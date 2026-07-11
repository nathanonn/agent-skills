#!/usr/bin/env node
// convert-design-system.mjs
//
// Deterministic worker for the `design-system-to-skill` converter skill.
// Reads an `extract-design-system` output bundle (.design_systems/<domain>-YYYYMMDD/),
// validates it against references/expected-contract.json, and STAGES a complete
// per-brand agent-skill tree under a sandbox-allowed staging dir. It NEVER writes into
// `.claude/skills/` and NEVER authors the generated skill's trigger description — the
// converter skill's Claude step does both, reading the manifest this worker emits.
//
// Node >= 18, builtins only (no npm deps).
//
// Pipeline: arg-parse -> resolve -> detect -> validate (collect findings)
//           -> extract identity -> slug -> plan -> (stage) -> emit.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REF_DIR = path.resolve(SCRIPT_DIR, '..', 'references');

// ---------------------------------------------------------------------------
// Exit codes
// ---------------------------------------------------------------------------
const EXIT = {
  OK: 0,        // plan emitted (dry-run) or tree staged + manifest emitted
  HARD_FAIL: 1, // validation hard-fail incl. known-incompatible marker; no staging
  USAGE: 2,     // usage / argument error
  COLLISION: 3, // dest exists && !--force (non dry-run); nothing staged into place
  INTERNAL: 4,  // internal / IO error (e.g. staging write failed)
};

// A UsageError is thrown for argument problems that must map to exit 2.
class UsageError extends Error {}

// ---------------------------------------------------------------------------
// Findings collector: {level:'hard'|'warn', code, message}
// ---------------------------------------------------------------------------
function makeFindings() {
  const items = [];
  return {
    items,
    hard(code, message) { items.push({ level: 'hard', code, message }); },
    warn(code, message) { items.push({ level: 'warn', code, message }); },
    hasHard() { return items.some((f) => f.level === 'hard'); },
    warnings() { return items.filter((f) => f.level === 'warn').map((f) => `[${f.code}] ${f.message}`); },
    errors() { return items.filter((f) => f.level === 'hard').map((f) => `[${f.code}] ${f.message}`); },
  };
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
const HELP = `design-system-to-skill worker — convert an extract-design-system bundle into a staged agent skill.

Usage:
  node convert-design-system.mjs <bundle-path> [flags]

Arguments:
  <bundle-path>            Path to a .design_systems/<domain>-YYYYMMDD/ bundle dir, or a
                           parent holding exactly one *-YYYYMMDD bundle.

Flags:
  --out <dir>              Output ROOT (default: .claude/skills/). Final dest is
                           <out>/<slug>-design-system/.
  --name <slug>            Override the derived slug; still runs the collision check.
  --with-screenshots       Also stage screenshots/ into assets/screenshots/ (default: off).
  --dry-run                Validate + emit the plan; stage nothing, write nothing.
  --json                   Emit exactly one JSON manifest object on stdout (default: human).
  --force                  Bypass the collision STOP; proceed as a full-replace overwrite.
  --staging <dir>          Sandbox-allowed staging root (default: $TMPDIR or OS temp).
  --must-use               Declare MUST-USE intent: render the proposed CLAUDE.md directive
                           and compute the single-winner conflict verdict (scan/report only;
                           the worker never edits CLAUDE.md). Default: off.
  --claude-md <path>       Governing CLAUDE.md scanned for the MUST-USE registry block
                           (default: <cwd>/CLAUDE.md).
  --help                   Show this help.

Exit codes:
  0  success (plan emitted for --dry-run, or tree staged + manifest emitted)
  1  hard-fail validation (incl. known-incompatible contract marker); no staging
  2  usage / argument error
  3  collision needs a decision (dest exists and --force not given, non dry-run)
  4  internal / IO error
`;

function parseArgs(argv) {
  const opts = {
    bundle: null,
    out: '.claude/skills',
    name: null,
    withScreenshots: false,
    dryRun: false,
    json: false,
    force: false,
    staging: process.env.TMPDIR || os.tmpdir(),
    mustUse: false,
    claudeMd: null,
    help: false,
  };
  const valueFlags = new Set(['--out', '--name', '--staging', '--claude-md']);
  const boolFlags = new Set(['--with-screenshots', '--dry-run', '--json', '--force', '--must-use', '--help']);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { opts.help = true; continue; }
    if (arg.startsWith('--')) {
      if (valueFlags.has(arg)) {
        const val = argv[++i];
        if (val === undefined) throw new UsageError(`flag ${arg} requires a value`);
        if (arg === '--out') opts.out = val;
        else if (arg === '--name') opts.name = val;
        else if (arg === '--staging') opts.staging = val;
        else if (arg === '--claude-md') opts.claudeMd = val;
        continue;
      }
      if (boolFlags.has(arg)) {
        if (arg === '--with-screenshots') opts.withScreenshots = true;
        else if (arg === '--dry-run') opts.dryRun = true;
        else if (arg === '--json') opts.json = true;
        else if (arg === '--force') opts.force = true;
        else if (arg === '--must-use') opts.mustUse = true;
        continue;
      }
      // Support --flag=value form for value flags.
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        const k = arg.slice(0, eq);
        const v = arg.slice(eq + 1);
        if (k === '--out') { opts.out = v; continue; }
        if (k === '--name') { opts.name = v; continue; }
        if (k === '--staging') { opts.staging = v; continue; }
        if (k === '--claude-md') { opts.claudeMd = v; continue; }
      }
      throw new UsageError(`unknown flag: ${arg}`);
    }
    if (arg.startsWith('-') && arg.length > 1) {
      throw new UsageError(`unknown flag: ${arg}`);
    }
    // Positional bundle path.
    if (opts.bundle === null) opts.bundle = arg;
    else throw new UsageError(`unexpected extra argument: ${arg}`);
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Path / filesystem helpers (traversal confinement)
// ---------------------------------------------------------------------------

// Resolve the bundle root, applying the single-bundle-parent convenience.
function resolveBundleRoot(inputPath) {
  let abs;
  try {
    abs = fs.realpathSync(path.resolve(inputPath));
  } catch {
    throw new UsageError(`bundle path does not exist or is unreadable: ${inputPath}`);
  }
  let st;
  try {
    st = fs.statSync(abs);
  } catch {
    throw new UsageError(`cannot stat bundle path: ${inputPath}`);
  }
  if (!st.isDirectory()) throw new UsageError(`bundle path is not a directory: ${inputPath}`);

  // Does this dir look like a bundle itself (has DESIGN.md)? Then use it directly.
  if (fs.existsSync(path.join(abs, 'DESIGN.md'))) return abs;

  // Otherwise treat it as a parent: find *-YYYYMMDD child dirs.
  let entries;
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    throw new UsageError(`cannot read directory: ${inputPath}`);
  }
  const candidates = entries
    .filter((e) => e.isDirectory() && /-\d{8}$/.test(e.name))
    .map((e) => e.name)
    .sort();
  if (candidates.length === 1) return fs.realpathSync(path.join(abs, candidates[0]));
  if (candidates.length === 0) {
    throw new UsageError(
      `no bundle found: '${inputPath}' is neither a bundle (no DESIGN.md) nor a parent of a *-YYYYMMDD bundle`,
    );
  }
  throw new UsageError(
    `ambiguous: '${inputPath}' holds ${candidates.length} *-YYYYMMDD bundles (${candidates.join(', ')}); pass one directly`,
  );
}

// Given a bundle-relative path, return {abs, real, inside}. `real` is the realpath
// (symlinks collapsed); `inside` asserts it stays within the confinement root.
function confinedPath(root, rel) {
  const abs = path.resolve(root, rel);
  let real = null;
  let inside = false;
  try {
    real = fs.realpathSync(abs);
    inside = real === root || real.startsWith(root + path.sep);
  } catch {
    // Non-existent: fall back to the lexical resolution for the inside check.
    real = abs;
    inside = abs === root || abs.startsWith(root + path.sep);
  }
  return { abs, real, inside };
}

function existsRel(root, rel) {
  return fs.existsSync(path.join(root, rel));
}
function isDirRel(root, rel) {
  try { return fs.statSync(path.join(root, rel)).isDirectory(); } catch { return false; }
}
function isFileRel(root, rel) {
  try { return fs.statSync(path.join(root, rel)).isFile(); } catch { return false; }
}
function readTextRel(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function sizeRel(root, rel) {
  try { return fs.statSync(path.join(root, rel)).size; } catch { return -1; }
}

// List component *.html files (excluding gallery.html), sorted, that are regular files
// resolving inside the confinement root.
function listSnippetFiles(root, findings) {
  const dir = path.join(root, 'components');
  if (!isDirRel(root, 'components')) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.name.endsWith('.html')) continue;
    if (e.name === 'gallery.html') continue;
    const rel = `components/${e.name}`;
    const cp = confinedPath(root, rel);
    if (!cp.inside) {
      findings.hard('path-escape', `component snippet escapes bundle root: ${rel}`);
      continue;
    }
    if (!isFileRel(root, rel)) continue; // skip dirs / dangling symlinks
    out.push(e.name);
  }
  return out.sort(byteCompare);
}

// Recursively walk a directory relative to root, returning file paths relative to root.
function walkDirRel(root, relDir, findings) {
  const out = [];
  const abs = path.join(root, relDir);
  if (!isDirRel(root, relDir)) return out;
  const stack = [relDir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(path.join(root, cur), { withFileTypes: true }); }
    catch { continue; }
    for (const e of entries) {
      const rel = `${cur}/${e.name}`;
      const cp = confinedPath(root, rel);
      if (!cp.inside) {
        findings.hard('path-escape', `path escapes bundle root: ${rel}`);
        continue;
      }
      if (e.isDirectory()) stack.push(rel);
      else if (e.isFile()) out.push(rel);
      // symlinks: only follow if they resolve to a regular file inside root
      else if (e.isSymbolicLink()) {
        try { if (fs.statSync(cp.real).isFile()) out.push(rel); } catch { /* dangling */ }
      }
    }
  }
  return out.sort(byteCompare);
}

// Byte-order string comparator for deterministic ordering.
function byteCompare(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Light front-matter scan (NOT full YAML — top-level `key: value` only)
// ---------------------------------------------------------------------------
function parseFrontMatter(text) {
  const lines = text.split(/\r?\n/);
  // Find the opening `---` (must be at/near the very top, allowing a leading BOM/blank).
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    if (lines[i].trim() === '---') { start = i; }
    break;
  }
  if (start === -1) return null;
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { end = i; break; }
  }
  if (end === -1) return null;

  const fm = {};
  for (let i = start + 1; i < end; i++) {
    const line = lines[i];
    // Only top-level keys (no leading whitespace).
    const m = /^([A-Za-z_][A-Za-z0-9_-]*):(?:[ \t]+(.*))?$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let val = m[2] === undefined ? '' : m[2].trim();
    // Strip a trailing inline comment only when the value is unquoted and clearly a comment.
    val = stripQuotes(val);
    if (!(key in fm)) fm[key] = val;
  }
  return fm;
}

function stripQuotes(v) {
  if (v.length >= 2) {
    const first = v[0];
    const last = v[v.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return v.slice(1, -1);
    }
  }
  return v;
}

// First prose sentence of the DESIGN.md `## Overview` section (description fallback).
function firstOverviewSentence(text) {
  const lines = text.split(/\r?\n/);
  let inOverview = false;
  const buf = [];
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (inOverview) break; // next heading ends the section
      if (/^##\s+Overview\b/i.test(line)) { inOverview = true; }
      continue;
    }
    if (inOverview) {
      if (line.trim() === '') { if (buf.length) break; else continue; }
      buf.push(line.trim());
    }
  }
  const prose = stripMd(buf.join(' '));
  return firstSentence(prose);
}

function firstSentence(s) {
  const t = s.trim();
  const m = /^(.*?[.!?])(\s|$)/.exec(t);
  return (m ? m[1] : t).trim();
}

// Strip common markdown inline markup for one-line role/description extraction.
function stripMd(s) {
  return s
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// MUST-USE mode scan & registry parsing
// The worker only READS + REPORTS; it never edits CLAUDE.md or .claude/skills/.
// ---------------------------------------------------------------------------
const MU_START = '<!-- design-system-must-use:start -->';
const MU_END = '<!-- design-system-must-use:end -->';

// Read a single front-matter field, flattening YAML block scalars (`>-`, `|`, ...)
// into one whitespace-collapsed string. parseFrontMatter only captures the key line,
// which yields ">-" for folded descriptions — this recovers the real prose so the
// consumer heuristic can see it.
function frontMatterField(text, field) {
  const lines = text.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    if (lines[i].trim() === '---') { start = i; }
    break;
  }
  if (start === -1) return null;
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { end = i; break; }
  }
  if (end === -1) return null;
  const re = new RegExp(`^${field}:(?:[ \\t]+(.*))?$`);
  for (let i = start + 1; i < end; i++) {
    const m = re.exec(lines[i]);
    if (!m) continue;
    const raw = m[1] === undefined ? '' : m[1].trim();
    // Block-scalar indicator on the key line -> gather indented continuation lines.
    if (/^[|>][+-]?$/.test(raw)) {
      const buf = [];
      for (let j = i + 1; j < end; j++) {
        const l = lines[j];
        if (l.trim() === '') { buf.push(''); continue; }
        if (/^\s/.test(l)) buf.push(l.trim());
        else break;
      }
      return buf.join(' ').replace(/\s+/g, ' ').trim();
    }
    return stripQuotes(raw);
  }
  return null;
}

// Deterministic consumer classification: flag brand-DS *consumers*
// (skills you build UI with), exclude *producers/extractors* and the converter.
function isConsumerSkill(slug, name, desc) {
  const nm = name || '';
  const d = desc || '';
  const looksConsumer = /-design-system$/.test(nm)
    || (/design system/i.test(d) && /\b(build|generate|restyle|match|style)\b/i.test(d));
  const looksProducer = /\bextract(s|ing|ed)?\b/i.test(d)
    || /into a bundle/i.test(d)
    || /outputs\s+\.design_systems/i.test(d)
    || slug === 'design-system-to-skill';
  return looksConsumer && !looksProducer;
}

// Scan <outRoot>/*/SKILL.md front matter; one entry per skill dir, sorted by slug.
// Never crashes: unreadable/malformed SKILL.md dirs are skipped.
function scanInstalledDesignSystems(outRoot, targetSlug, currentMustUse) {
  const entries = [];
  let dirents;
  try { dirents = fs.readdirSync(outRoot, { withFileTypes: true }); }
  catch { return entries; }
  for (const e of dirents) {
    if (!e.isDirectory() && !e.isSymbolicLink()) continue;
    const slug = e.name;
    let text;
    try { text = fs.readFileSync(path.join(outRoot, slug, 'SKILL.md'), 'utf8'); }
    catch { continue; }
    const fm = parseFrontMatter(text);
    if (!fm) continue; // malformed / no front matter
    const name = fm.name || slug;
    const desc = frontMatterField(text, 'description') || fm.description || '';
    entries.push({
      slug,
      name,
      isConsumer: isConsumerSkill(slug, name, desc),
      isMustUse: slug === currentMustUse,
      isSelf: slug === targetSlug,
    });
  }
  entries.sort((a, b) => byteCompare(a.slug, b.slug));
  return entries;
}

// Parse the governing CLAUDE.md for the managed MUST-USE block. Returns the slug named
// in "use the `<slug>` skill" (first backticked token after "use the"), or null.
function parseMustUseRegistry(claudeMdPath) {
  let text;
  try { text = fs.readFileSync(claudeMdPath, 'utf8'); }
  catch { return { blockPresent: false, currentMustUse: null }; }
  const si = text.indexOf(MU_START);
  if (si === -1) return { blockPresent: false, currentMustUse: null };
  const ei = text.indexOf(MU_END, si + MU_START.length);
  if (ei === -1) return { blockPresent: false, currentMustUse: null };
  const block = text.slice(si + MU_START.length, ei);
  const m = /use the\s+`([^`]+)`/i.exec(block);
  return { blockPresent: true, currentMustUse: m ? m[1].trim() : null };
}

// ---------------------------------------------------------------------------
// Component catalog + COMPONENTS.md parsing (cross-ref integrity)
// ---------------------------------------------------------------------------

// Parse the markdown table under `## Component Catalog` in DESIGN.md.
// Returns { names:[...], referencePaths:[...] } (referencePaths relative to bundle root).
function parseCatalog(designText) {
  const lines = designText.split(/\r?\n/);
  let inCatalog = false;
  const names = [];
  const referencePaths = [];
  let headerSeen = false;
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      inCatalog = /^##\s+Component Catalog\b/i.test(line);
      headerSeen = false;
      continue;
    }
    if (!inCatalog) continue;
    if (!line.trim().startsWith('|')) continue;
    const cells = splitTableRow(line);
    if (!headerSeen) { headerSeen = true; continue; } // header row
    if (cells.every((c) => /^:?-+:?$/.test(c) || c === '')) continue; // separator row
    const name = (cells[0] || '').trim();
    const ref = (cells[3] || '').trim();
    if (name && name !== '—') names.push(name);
    if (ref && ref !== '—' && /\.html$/i.test(ref)) referencePaths.push(ref);
  }
  return { names, referencePaths };
}

function splitTableRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

// Parse COMPONENTS.md into component blocks.
// Returns [{ name, files:[bare html names], role, screenshots:[paths] }]
function parseComponents(componentsText) {
  const lines = componentsText.split(/\r?\n/);
  const blocks = [];
  let current = null;
  for (const line of lines) {
    const h = /^##\s+(.*\S)\s*$/.exec(line);
    if (h) {
      if (current) blocks.push(current);
      current = { name: h[1].trim(), body: [] };
      continue;
    }
    if (current) current.body.push(line);
  }
  if (current) blocks.push(current);

  return blocks.map((b) => {
    const bodyText = b.body.join('\n');
    const files = [];
    const screenshots = [];
    for (const line of b.body) {
      const fm = /^\s*\*\*Files?:\*\*\s*(.*)$/.exec(line);
      if (fm) {
        for (const tok of fm[1].split('·')) {
          const t = tok.trim().split(/\s/)[0];
          if (/\.html$/i.test(t)) files.push(t);
        }
      }
      const sm = /^\s*\*\*Screenshots?:\*\*\s*(.*)$/.exec(line);
      if (sm) {
        for (const tok of sm[1].split('·')) {
          const t = tok.trim().split(/\s/)[0];
          if (/\.png$/i.test(t)) screenshots.push(t);
        }
      }
    }
    return { name: b.name, files, screenshots, role: extractRole(bodyText, b.name) };
  });
}

// Deterministic one-line role for a component (Usage -> Composition -> Anatomy -> name).
function extractRole(bodyText, name) {
  const usage = /\*\*Usage:\*\*\s*([^\n]+)/.exec(bodyText);
  if (usage) return truncate(firstSentence(stripMd(usage[1])), 140);
  const comp = /\*\*Composition:\*\*\s*([^\n]+)/.exec(bodyText);
  if (comp) return truncate(firstSentence(stripMd(comp[1])), 140);
  const anat = /\*\*Anatomy\*\*\s*\n\s*1\.\s*([^\n]+)/.exec(bodyText);
  if (anat) return truncate(firstSentence(stripMd(anat[1])), 140);
  return name;
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

// ---------------------------------------------------------------------------
// DTCG token shape sanity (WARN only)
// ---------------------------------------------------------------------------
function checkDtcgShape(tokens, contract, findings) {
  const allowed = new Set(contract.tokens.allowedTopLevelBuckets);
  const prefix = contract.tokens.metadataKeyPrefix || '$';
  for (const key of Object.keys(tokens)) {
    if (key.startsWith(prefix)) continue;
    if (!allowed.has(key)) {
      findings.warn('dtcg-bucket', `unexpected top-level token bucket: '${key}' (allowed: ${[...allowed].join(', ')})`);
    }
  }
  // Walk buckets for leaf-node $type/$value presence.
  let leafWarned = false;
  const walk = (node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const hasType = '$type' in node;
    const hasValue = '$value' in node;
    if (hasType || hasValue) {
      if (!(hasType && hasValue) && !leafWarned) {
        findings.warn('dtcg-leaf', 'at least one token leaf is missing $type or $value');
        leafWarned = true;
      }
      return;
    }
    for (const k of Object.keys(node)) {
      if (k.startsWith('$')) continue;
      walk(node[k]);
    }
  };
  for (const key of Object.keys(tokens)) {
    if (key.startsWith(prefix)) continue;
    if (allowed.has(key)) walk(tokens[key]);
  }
}

// ---------------------------------------------------------------------------
// Slug computation
// ---------------------------------------------------------------------------
const SUFFIX = '-design-system';
const NAME_MAX = 64;
const SLUG_MAX = NAME_MAX - SUFFIX.length; // 50

function slugify(input) {
  if (!input) return '';
  let x = String(input).normalize('NFKD');
  x = x.replace(/[̀-ͯ]/g, ''); // drop combining marks
  x = x.replace(/[^\x00-\x7F]/g, '');     // strip remaining non-ASCII
  x = x.toLowerCase();
  x = x.replace(/[^a-z0-9]+/g, '-');     // non-alnum runs -> single hyphen
  x = x.replace(/^-+|-+$/g, '');         // trim
  return x;
}

function truncateSlug(slug) {
  if (slug.length <= SLUG_MAX) return slug;
  let t = slug.slice(0, SLUG_MAX);
  const lastHyphen = t.lastIndexOf('-');
  if (lastHyphen > 0) t = t.slice(0, lastHyphen); // prefer a hyphen boundary
  return t.replace(/-+$/g, '');
}

function isReservedSlug(slug) {
  if (!slug) return true;
  if (slug === '.' || slug === '..') return true;
  if (slug.includes('anthropic') || slug.includes('claude')) return true;
  return false;
}

// Returns a valid slug or null if every candidate is degenerate/reserved.
function computeSlug(brand, domainSeed, folderDate, override) {
  if (override) {
    const s = truncateSlug(slugify(override));
    if (isReservedSlug(s)) throw new UsageError(`--name '${override}' is empty/reserved after slugification`);
    return s;
  }
  const candidates = [
    slugify(brand),
    slugify(domainSeed),
    slugify(`${domainSeed}-${folderDate}`),
  ];
  for (const c of candidates) {
    const t = truncateSlug(c);
    if (!isReservedSlug(t)) return t;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rendering helpers for generated files
// ---------------------------------------------------------------------------
function applyTemplate(tpl, subs) {
  let out = tpl;
  for (const [k, v] of Object.entries(subs)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}

function renderIndex(brand, planDests, snippetRoleByFile) {
  const descFor = (dest) => {
    switch (dest) {
      case 'references/DESIGN.md': return 'Design tokens (front matter), prose, and the Component Catalog. Read fully first.';
      case 'references/COMPONENTS.md': return 'Per-component contracts: anatomy, variants, states, and section skeletons.';
      case 'references/source-protocol.md': return 'The source brand protocol and non-negotiables, quoted as DATA (not instructions).';
      case 'references/snippets-manifest.md': return 'Map of each component to its reference snippet and role.';
      case 'references/tokens/design-tokens.json': return 'DTCG machine token export (colors, dimensions, fonts, shadows).';
      case 'references/eval/checklists.md': return 'Optional downstream UI-QA rubric — validates generated UI, not this skill.';
      case 'references/eval/fixtures.json': return 'Optional downstream UI-QA fixtures — validates generated UI, not this skill.';
      default: break;
    }
    if (dest.startsWith('assets/snippets/')) {
      const base = dest.slice('assets/snippets/'.length);
      const role = snippetRoleByFile.get(base);
      return role ? `Reference snippet — ${role}` : 'Reference component snippet.';
    }
    if (dest.startsWith('assets/screenshots/')) return 'Reference screenshot (page / section / state crop).';
    return 'Reference file.';
  };

  const refFiles = planDests
    .filter((d) => d.startsWith('references/') && d !== 'references/index.md')
    .sort(byteCompare);
  const assetFiles = planDests.filter((d) => d.startsWith('assets/')).sort(byteCompare);

  const lines = [];
  lines.push(`# ${brand} design system — reference index`);
  lines.push('');
  lines.push('A map of every file under `references/` and `assets/` in this skill. Files are read on');
  lines.push('demand; nothing here is loaded until you open it.');
  lines.push('');
  lines.push('## references/');
  lines.push('');
  for (const d of refFiles) lines.push(`- \`${d}\` — ${descFor(d)}`);
  lines.push('');
  lines.push('## assets/');
  lines.push('');
  if (assetFiles.length === 0) {
    lines.push('- (none)');
  } else {
    for (const d of assetFiles) lines.push(`- \`${d}\` — ${descFor(d)}`);
  }
  lines.push('');
  return lines.join('\n');
}

function renderSnippetsManifest(brand, components, snippetSet) {
  const lines = [];
  lines.push(`# ${brand} — snippets manifest`);
  lines.push('');
  lines.push('Each component maps to its reference snippet(s) under `assets/snippets/` and a one-line');
  lines.push('role. Open the snippet for a component before building it; reproduce its anatomy and');
  lines.push('token bindings rather than cloning the markup.');
  lines.push('');
  lines.push('| Component | Snippet | Role |');
  lines.push('|---|---|---|');
  for (const c of components) {
    const role = mdCell(c.role);
    const files = c.files.filter((f) => snippetSet.has(f));
    if (files.length === 0) continue;
    for (const f of files) {
      lines.push(`| ${mdCell(c.name)} | \`assets/snippets/${f}\` | ${role} |`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function mdCell(s) {
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

// ---------------------------------------------------------------------------
// Staging (writes only under the sandbox-allowed staging dir)
// ---------------------------------------------------------------------------
function stageTree(stagingRoot, name, plan) {
  const destRoot = path.join(stagingRoot, name);
  // Clean any prior staging of the same name for a deterministic, byte-identical tree.
  fs.rmSync(destRoot, { recursive: true, force: true });
  fs.mkdirSync(destRoot, { recursive: true });
  for (const entry of plan) {
    const target = path.join(destRoot, entry.dest);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (entry.mode === 'copy') {
      fs.copyFileSync(entry.source, target); // byte-exact copy
    } else {
      fs.writeFileSync(target, entry.content);
    }
  }
  return destRoot;
}

// List existing dest files (relative to outDir), for staleFiles computation.
function listExistingDestFiles(outDir) {
  const out = [];
  if (!fs.existsSync(outDir)) return out;
  const stack = ['.'];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(path.join(outDir, cur), { withFileTypes: true }); }
    catch { continue; }
    for (const e of entries) {
      const rel = cur === '.' ? e.name : `${cur}/${e.name}`;
      if (e.isDirectory()) stack.push(rel);
      else if (e.isFile()) out.push(rel);
    }
  }
  return out.sort(byteCompare);
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------
function emitJson(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function emitFindingsToStderr(findings) {
  for (const f of findings.items) {
    const tag = f.level === 'hard' ? 'HARD-FAIL' : 'WARN';
    process.stderr.write(`${tag} [${f.code}] ${f.message}\n`);
  }
}

function emitHuman(manifest, findings) {
  const out = [];
  out.push(`design-system-to-skill — ${manifest.dryRun ? 'DRY RUN' : 'convert'}`);
  out.push('');
  out.push(`  brand:            ${manifest.descriptionInputs.brand || '(unknown)'}`);
  out.push(`  slug:             ${manifest.slug || '(none)'}`);
  out.push(`  name:             ${manifest.name || '(none)'}`);
  out.push(`  variant:          ${manifest.variant || '(none)'}`);
  out.push(`  source:           ${manifest.descriptionInputs.sourceUrl || '(unknown)'}`);
  out.push(`  extractor marker: ${manifest.extractorMarker || '(none)'}`);
  out.push(`  out dir:          ${manifest.outDir}`);
  out.push(`  staging dir:      ${manifest.stagingDir || '(not staged)'}`);
  if (manifest.collision.exists) {
    out.push('');
    out.push(`  COLLISION: destination already exists (${manifest.collision.dest}).`);
    if (manifest.staleFiles.length) {
      out.push(`  stale files (present at dest, absent from new plan): ${manifest.staleFiles.length}`);
    }
  }
  if (manifest.mustUse) {
    const mu = manifest.mustUse;
    const consumers = mu.installedDesignSystems.filter((s) => s.isConsumer).length;
    out.push('');
    out.push(`  MUST-USE:         ${mu.requested ? 'requested' : 'not requested'}`);
    out.push(`  governing CLAUDE.md: ${mu.claudeMdPath}`);
    out.push(`  current registry: ${mu.currentMustUse || '(none)'}`);
    out.push(`  consumer skills:  ${consumers} found`);
    if (mu.requested) {
      const ex = mu.conflict.existingSlug ? ` (${mu.conflict.existingSlug})` : '';
      out.push(`  conflict:         ${mu.conflict.type}${ex}`);
    }
  }
  out.push('');
  out.push(`  files planned: ${manifest.filesPlanned.length}`);
  for (const f of manifest.filesPlanned) {
    out.push(`    ${f.mode.padEnd(6)} ${f.dest} (${f.bytes} B)`);
  }
  if (manifest.warnings.length) {
    out.push('');
    out.push(`  warnings: ${manifest.warnings.length} (see stderr)`);
  }
  if (manifest.errors.length) {
    out.push('');
    out.push(`  errors: ${manifest.errors.length} (see stderr) — no output staged`);
  }
  out.push('');
  process.stdout.write(out.join('\n') + '\n');
  emitFindingsToStderr(findings);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write(`usage error: ${e.message}\n\n${HELP}`);
      return EXIT.USAGE;
    }
    throw e;
  }

  if (opts.help) {
    process.stdout.write(HELP);
    return EXIT.OK;
  }
  if (!opts.bundle) {
    process.stderr.write(`usage error: missing <bundle-path>\n\n${HELP}`);
    return EXIT.USAGE;
  }

  const findings = makeFindings();

  // --- Resolve bundle root (usage errors -> exit 2) ---
  let root;
  try {
    root = resolveBundleRoot(opts.bundle);
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write(`usage error: ${e.message}\n`);
      return EXIT.USAGE;
    }
    throw e;
  }

  // --- Load checked-in contract + templates ---
  let contract, skillTemplate, protocolBanner, mustUseTemplate;
  try {
    contract = JSON.parse(fs.readFileSync(path.join(REF_DIR, 'expected-contract.json'), 'utf8'));
    skillTemplate = fs.readFileSync(path.join(REF_DIR, 'skill-body.template.md'), 'utf8');
    protocolBanner = fs.readFileSync(path.join(REF_DIR, 'source-protocol-banner.md'), 'utf8');
    mustUseTemplate = fs.readFileSync(path.join(REF_DIR, 'must-use-directive.template.md'), 'utf8');
  } catch (e) {
    process.stderr.write(`internal error: cannot load worker reference files: ${e.message}\n`);
    return EXIT.INTERNAL;
  }

  // --- Detect variant by file presence/shape ---
  const snippetFiles = listSnippetFiles(root, findings);
  const snippetSet = new Set(snippetFiles);
  const hasAgents = isFileRel(root, 'AGENTS.md');
  const hasFixtures = isFileRel(root, 'eval/fixtures.json');
  const hasComponentsMd = isFileRel(root, 'components/COMPONENTS.md');
  const hasSingleFile = isFileRel(root, 'design-system.full.md');
  const hasScreenshots = isDirRel(root, 'screenshots') && walkDirRel(root, 'screenshots', findings).length > 0;

  let variant;
  if (snippetFiles.length === 0) {
    findings.hard('unsupported-bundle', contract.variants.unsupported.failMessage);
    variant = 'unsupported';
  } else if (hasSingleFile) {
    variant = 'single-file';
    findings.warn('variant-single-file', contract.variants['single-file'].warnMessage);
  } else if (!hasAgents || !hasFixtures) {
    variant = 'components-only';
    findings.warn('variant-components-only', contract.variants['components-only'].warnMessage);
  } else if (!hasScreenshots) {
    variant = 'no-screenshots';
  } else {
    variant = 'full';
  }

  // --- Structural presence checks for detected variant ---
  const requiredForVariant = variant === 'components-only'
    ? ['DESIGN.md', 'components/COMPONENTS.md', 'tokens/design-tokens.json']
    : ['DESIGN.md', 'AGENTS.md', 'components/COMPONENTS.md', 'tokens/design-tokens.json', 'eval/fixtures.json'];
  for (const req of requiredForVariant) {
    if (!isFileRel(root, req)) findings.hard('missing-required', `required file missing for ${variant} variant: ${req}`);
  }
  if (snippetFiles.length > 0 && !hasComponentsMd) {
    findings.hard('missing-components-md', 'components/COMPONENTS.md missing while component snippets exist');
  }

  // --- Parse core files (parse hard-fails) ---
  let designText = null, designFm = null, componentsText = null, tokensObj = null, fixturesObj = null, agentsText = null;

  if (isFileRel(root, 'DESIGN.md')) {
    designText = readTextRel(root, 'DESIGN.md');
    designFm = parseFrontMatter(designText);
    if (!designFm || !designFm.name) {
      findings.hard('design-frontmatter', 'DESIGN.md front matter is missing or has no non-empty top-level name:');
    }
  }
  if (hasComponentsMd) componentsText = readTextRel(root, 'components/COMPONENTS.md');
  if (hasAgents) agentsText = readTextRel(root, 'AGENTS.md');

  if (isFileRel(root, 'tokens/design-tokens.json')) {
    try { tokensObj = JSON.parse(readTextRel(root, 'tokens/design-tokens.json')); }
    catch (e) { findings.hard('tokens-json', `tokens/design-tokens.json is not valid JSON: ${e.message}`); }
  }
  if (isFileRel(root, 'eval/fixtures.json')) {
    try {
      fixturesObj = JSON.parse(readTextRel(root, 'eval/fixtures.json'));
      if (!fixturesObj || typeof fixturesObj.meta !== 'object' || fixturesObj.meta === null || Array.isArray(fixturesObj.meta)) {
        findings.hard('fixtures-meta', 'eval/fixtures.json is valid JSON but has no meta object');
      }
    } catch (e) {
      findings.hard('fixtures-json', `eval/fixtures.json is not valid JSON: ${e.message}`);
    }
  }

  // --- DTCG shape sanity (WARN) ---
  if (tokensObj && typeof tokensObj === 'object') checkDtcgShape(tokensObj, contract, findings);

  // --- Cross-reference integrity ---
  const catalog = designText ? parseCatalog(designText) : { names: [], referencePaths: [] };
  const components = componentsText ? parseComponents(componentsText) : [];

  // Referenced snippet filenames (bare, relative to components/), from catalog + COMPONENTS.
  const referencedBare = new Set();
  // Catalog references are like `components/button--primary.html`.
  for (const ref of catalog.referencePaths) {
    if (ref.includes('..') || path.isAbsolute(ref)) {
      findings.hard('path-escape', `catalog reference escapes bundle root: ${ref}`);
      continue;
    }
    const cp = confinedPath(root, ref);
    if (!cp.inside) { findings.hard('path-escape', `catalog reference escapes bundle root: ${ref}`); continue; }
    if (!isFileRel(root, ref)) {
      findings.hard('missing-reference', `catalog Reference points at a missing file: ${ref}`);
    } else {
      referencedBare.add(path.basename(ref));
    }
  }
  // COMPONENTS.md **File:** entries are bare, relative to components/.
  for (const c of components) {
    for (const f of c.files) {
      if (f.includes('..') || path.isAbsolute(f)) {
        findings.hard('path-escape', `COMPONENTS.md file reference escapes bundle root: ${f}`);
        continue;
      }
      const rel = `components/${f}`;
      const cp = confinedPath(root, rel);
      if (!cp.inside) { findings.hard('path-escape', `COMPONENTS.md file reference escapes bundle root: ${f}`); continue; }
      if (!isFileRel(root, rel)) {
        findings.hard('missing-reference', `COMPONENTS.md **File:** points at a missing snippet: ${f}`);
      } else {
        referencedBare.add(f);
      }
    }
  }

  // Orphan snippets (WARN) — present *.html (excl gallery) never catalogued.
  for (const f of snippetFiles) {
    if (!referencedBare.has(f)) findings.warn('orphan-snippet', `component snippet not catalogued: components/${f}`);
  }

  // Duplicate component names (HARD) — within catalog, and within COMPONENTS headers.
  reportDuplicates(catalog.names, 'catalog', findings);
  reportDuplicates(components.map((c) => c.name), 'COMPONENTS.md', findings);

  // Screenshot state-row references present when --with-screenshots (WARN).
  if (opts.withScreenshots) {
    for (const c of components) {
      for (const shot of c.screenshots) {
        // Screenshot refs in COMPONENTS.md are relative to components/ (e.g. ../screenshots/...).
        const rel = path.normalize(path.join('components', shot));
        const cp = confinedPath(root, rel);
        if (!cp.inside) { findings.warn('screenshot-ref', `screenshot reference escapes bundle root: ${shot}`); continue; }
        if (!isFileRel(root, rel)) findings.warn('screenshot-ref', `referenced screenshot missing: ${shot}`);
      }
    }
  }

  // --- Size / sanity (WARN) ---
  for (const core of ['DESIGN.md', 'AGENTS.md', 'components/COMPONENTS.md', 'tokens/design-tokens.json', 'eval/fixtures.json']) {
    if (isFileRel(root, core) && sizeRel(root, core) === 0) findings.warn('empty-file', `core file is empty (0 bytes): ${core}`);
  }
  for (const f of snippetFiles) {
    const sz = sizeRel(root, `components/${f}`);
    if (sz > 262144) findings.warn('oversized-snippet', `component snippet exceeds ~256 KB (probable full-page dump): components/${f} (${sz} B)`);
  }

  // --- Contract marker / drift ---
  let extractorMarker = null;
  if (fixturesObj && fixturesObj.meta && typeof fixturesObj.meta.extractorVersion === 'string') {
    extractorMarker = fixturesObj.meta.extractorVersion;
  }
  const marker = contract.marker;
  if (!extractorMarker) {
    findings.warn('marker-missing', `no extractor marker (${marker.field}) in eval/fixtures.json; proceeding`);
  } else if (Array.isArray(marker.incompatible) && marker.incompatible.includes(extractorMarker)) {
    findings.hard('marker-incompatible', `extractor marker '${extractorMarker}' is documented as incompatible with this converter`);
  } else if (!marker.recognized.includes(extractorMarker)) {
    findings.warn('marker-unknown', `unknown/newer extractor marker '${extractorMarker}' (recognized: ${marker.recognized.join(', ')}); degrading gracefully`);
  }

  // --- Extract identity metadata ---
  const folderName = path.basename(root);
  const folderMatch = /^(.*)-(\d{8})$/.exec(folderName);
  const folderDomainSeed = folderMatch ? folderMatch[1] : folderName;
  const folderDate = folderMatch ? folderMatch[2] : '';

  const brand = (designFm && designFm.name)
    ? designFm.name
    : titleCase(folderDomainSeed);

  let description = '';
  if (designFm && designFm.description) description = designFm.description;
  else if (designText) description = firstOverviewSentence(designText);

  let sourceUrl = '';
  if (fixturesObj && fixturesObj.meta && typeof fixturesObj.meta.source === 'string') sourceUrl = fixturesObj.meta.source;
  else if (folderDomainSeed) sourceUrl = `https://${folderDomainSeed}`;

  let extractedDate = '';
  if (fixturesObj && fixturesObj.meta && typeof fixturesObj.meta.extracted === 'string') extractedDate = fixturesObj.meta.extracted;
  else extractedDate = folderDate;

  const domainSlugSeed = folderDomainSeed;

  // --- Slug ---
  let slug = null;
  try {
    slug = computeSlug(brand, domainSlugSeed, folderDate, opts.name);
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write(`usage error: ${e.message}\n`);
      return EXIT.USAGE;
    }
    throw e;
  }
  if (!slug) findings.hard('slug-degenerate', 'could not derive a valid slug from brand, domain seed, or folder date');

  const name = slug ? `${slug}${SUFFIX}` : '';
  const outRoot = opts.out;
  const outDir = slug ? path.resolve(outRoot, name) : path.resolve(outRoot);

  // Trigger hints for the Claude-authored description (descriptionInputs).
  const host = deriveHost(sourceUrl, domainSlugSeed);
  const triggerHints = [
    `make a ${brand} page`,
    `build a hero in the ${brand} style`,
    `use the ${brand} design system`,
    `same buttons, cards, and sections as ${brand}`,
    `components like ${host}`,
  ];

  // --- MUST-USE scan & report ---
  // The worker only reads + reports; the Claude step performs the CLAUDE.md write.
  const targetSlug = name || null; // full skill dir name (<brand-slug>-design-system)
  const claudeMdPath = opts.claudeMd
    ? path.resolve(opts.claudeMd)
    : path.join(process.cwd(), 'CLAUDE.md');
  const registry = parseMustUseRegistry(claudeMdPath);
  const installedDesignSystems = scanInstalledDesignSystems(
    path.resolve(outRoot), targetSlug, registry.currentMustUse,
  );

  let proposedDirective = null;
  let conflict = { type: 'none', existingSlug: null };
  if (opts.mustUse) {
    proposedDirective = applyTemplate(mustUseTemplate, {
      SLUG: name || '',
      BRAND: brand,
      SOURCE_URL: sourceUrl || '(unknown source)',
    });
    if (registry.currentMustUse === null) {
      conflict = { type: 'none', existingSlug: null };
    } else if (registry.currentMustUse === targetSlug) {
      conflict = { type: 'already-self', existingSlug: registry.currentMustUse };
    } else {
      conflict = { type: 'replace', existingSlug: registry.currentMustUse };
    }
  }

  const mustUse = {
    claudeMdPath,
    blockPresent: registry.blockPresent,
    currentMustUse: registry.currentMustUse,
    installedDesignSystems,
    requested: opts.mustUse,
    proposedDirective,
    conflict,
  };

  // Base manifest object (fields always present).
  const manifest = {
    slug: slug || null,
    name: name || null,
    variant,
    outDir,
    stagingDir: null,
    dryRun: opts.dryRun,
    filesPlanned: [],
    staleFiles: [],
    collision: { exists: false, dest: outDir },
    extractorMarker,
    warnings: [],
    errors: [],
    descriptionInputs: { brand, description, sourceUrl, triggerHints },
    mustUse,
  };

  // --- HARD-FAIL gate: abort before any staging ---
  if (findings.hasHard()) {
    manifest.warnings = findings.warnings();
    manifest.errors = findings.errors();
    if (opts.json) { emitFindingsToStderr(findings); emitJson(manifest); }
    else emitHuman(manifest, findings);
    return EXIT.HARD_FAIL;
  }

  // --- Build the file PLAN ---
  const plan = []; // {dest, mode:'copy'|'render', source?, content?, bytes}

  const addCopy = (dest, sourceRel) => {
    const cp = confinedPath(root, sourceRel);
    if (!cp.inside) { findings.hard('path-escape', `copy source escapes bundle root: ${sourceRel}`); return; }
    plan.push({ dest, mode: 'copy', source: path.join(root, sourceRel), bytes: sizeRel(root, sourceRel) });
  };
  const addRender = (dest, content) => {
    plan.push({ dest, mode: 'render', content, bytes: Buffer.byteLength(content, 'utf8') });
  };

  // Copies (verbatim).
  addCopy('references/DESIGN.md', 'DESIGN.md');
  addCopy('references/COMPONENTS.md', 'components/COMPONENTS.md');
  addCopy('references/tokens/design-tokens.json', 'tokens/design-tokens.json');
  if (isFileRel(root, 'eval/checklists.md')) addCopy('references/eval/checklists.md', 'eval/checklists.md');
  if (isFileRel(root, 'eval/fixtures.json')) addCopy('references/eval/fixtures.json', 'eval/fixtures.json');
  for (const f of snippetFiles) addCopy(`assets/snippets/${f}`, `components/${f}`);
  if (opts.withScreenshots) {
    for (const rel of walkDirRel(root, 'screenshots', findings)) {
      addCopy(`assets/${rel}`, rel); // rel starts with 'screenshots/'
    }
  }

  // Generated: source-protocol.md (banner + verbatim AGENTS.md) — only if AGENTS.md present.
  if (agentsText !== null) {
    const bannerRendered = applyTemplate(protocolBanner, {
      SOURCE_URL: sourceUrl || '(unknown source)',
      EXTRACTED: extractedDate || '(unknown date)',
      EXTRACTOR_VERSION: extractorMarker || 'unknown',
      BRAND: brand,
    });
    addRender('references/source-protocol.md', `${bannerRendered}\n${agentsText}`);
  }

  // Generated: SKILL.md (template; leaves __DESCRIPTION__ untouched).
  const skillMd = applyTemplate(skillTemplate, {
    SLUG: name,
    BRAND: brand,
    SOURCE_URL: sourceUrl || '(unknown source)',
    EXTRACTED: extractedDate || '(unknown date)',
    EXTRACTOR_VERSION: extractorMarker || 'unknown',
  });
  addRender('SKILL.md', skillMd);

  // Generated: snippets-manifest.md.
  const snippetRoleByFile = new Map();
  for (const c of components) for (const f of c.files) if (snippetSet.has(f) && !snippetRoleByFile.has(f)) snippetRoleByFile.set(f, c.role);
  addRender('references/snippets-manifest.md', renderSnippetsManifest(brand, components, snippetSet));

  // Generated: index.md (map of every reference/asset file) — computed from the plan so far.
  const planDests = plan.map((p) => p.dest).concat(['references/index.md']);
  addRender('references/index.md', renderIndex(brand, planDests, snippetRoleByFile));

  // Deterministic ordering of the plan (by dest).
  plan.sort((a, b) => byteCompare(a.dest, b.dest));

  // A late path-escape during plan building is still a hard-fail with zero output.
  if (findings.hasHard()) {
    manifest.warnings = findings.warnings();
    manifest.errors = findings.errors();
    if (opts.json) { emitFindingsToStderr(findings); emitJson(manifest); }
    else emitHuman(manifest, findings);
    return EXIT.HARD_FAIL;
  }

  const planDestSet = new Set(plan.map((p) => p.dest));

  // --- Collision detection ---
  const destExists = fs.existsSync(outDir);
  if (destExists) {
    const existing = listExistingDestFiles(outDir);
    manifest.staleFiles = existing.filter((d) => !planDestSet.has(d));
  }

  // Fill common manifest fields.
  manifest.warnings = findings.warnings();
  manifest.errors = findings.errors();

  const stagingDir = slug ? path.join(path.resolve(opts.staging), name) : null;

  // Populate filesPlanned (stagedPath is where each file is / would be staged).
  manifest.filesPlanned = plan.map((p) => ({
    dest: p.dest,
    stagedPath: path.join(stagingDir, p.dest),
    mode: p.mode,
    bytes: p.bytes,
  }));

  // Collision gate: dest exists && !force && !dry-run -> exit 3, stage nothing.
  if (destExists && !opts.force && !opts.dryRun) {
    manifest.collision = { exists: true, dest: outDir };
    manifest.stagingDir = null;
    if (opts.json) { emitFindingsToStderr(findings); emitJson(manifest); }
    else emitHuman(manifest, findings);
    return EXIT.COLLISION;
  }
  manifest.collision = { exists: destExists, dest: outDir };

  // --- Dry run: report the plan, stage nothing ---
  if (opts.dryRun) {
    manifest.stagingDir = null;
    if (opts.json) { emitFindingsToStderr(findings); emitJson(manifest); }
    else emitHuman(manifest, findings);
    return EXIT.OK;
  }

  // --- Stage the complete tree ---
  let stagedRoot;
  try {
    stagedRoot = stageTree(path.resolve(opts.staging), name, plan);
  } catch (e) {
    process.stderr.write(`internal error: staging failed: ${e.message}\n`);
    manifest.errors.push(`[staging] ${e.message}`);
    if (opts.json) { emitFindingsToStderr(findings); emitJson(manifest); }
    return EXIT.INTERNAL;
  }
  manifest.stagingDir = stagedRoot;
  // Recompute stagedPath against the actual staged root (identical to stagingDir above).
  manifest.filesPlanned = plan.map((p) => ({
    dest: p.dest,
    stagedPath: path.join(stagedRoot, p.dest),
    mode: p.mode,
    bytes: p.bytes,
  }));

  if (opts.json) { emitFindingsToStderr(findings); emitJson(manifest); }
  else emitHuman(manifest, findings);
  return EXIT.OK;
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------
function reportDuplicates(names, where, findings) {
  const seen = new Set();
  const dup = new Set();
  for (const n of names) {
    if (seen.has(n)) dup.add(n);
    seen.add(n);
  }
  for (const n of dup) findings.hard('duplicate-component', `duplicate component name in ${where}: ${n}`);
}

function titleCase(seed) {
  return String(seed)
    .split(/[-.\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function deriveHost(sourceUrl, domainSlugSeed) {
  if (sourceUrl) {
    const m = /^[a-z]+:\/\/([^/]+)/i.exec(sourceUrl);
    if (m) return m[1];
  }
  return domainSlugSeed;
}

// ---------------------------------------------------------------------------
try {
  process.exit(main());
} catch (e) {
  process.stderr.write(`internal error: ${e && e.stack ? e.stack : e}\n`);
  process.exit(EXIT.INTERNAL);
}
