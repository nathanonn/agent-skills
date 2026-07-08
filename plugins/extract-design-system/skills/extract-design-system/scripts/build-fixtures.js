#!/usr/bin/env node
// build-fixtures.js — emits eval/fixtures.json.
//
// Every assertion is generated from extracted evidence — no hand-authored
// expectations. Fixtures carry sourcePage/sourceSel/expectText so the eval
// self-test can resolve the original element and verify the fixture against
// the source site itself before the bundle ships.
//
// Usage:
//   node build-fixtures.js --tokens t.json --components components/ \
//     --out eval/fixtures.json --source https://x.com --theme light \
//     home:distilled-home.json pricing:distilled-pricing.json \
//     home:distilled-sections-home.json ...
// (each distilled file is prefixed with the page path it was captured on)

'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = { files: [] };
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[++i];
  else opt.files.push(args[i]);
}
if (!opt.tokens || !opt.out || !opt.components || !opt.files.length) {
  console.error('usage: node build-fixtures.js --tokens t.json --components dir/ --out fixtures.json [--source url] [--theme t] page:distilled.json ...');
  process.exit(1);
}

// ---- core tokens = tokens actually bound in the emitted snippets ----------
const core = {};
for (const f of fs.readdirSync(opt.components).filter((f) => f.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(opt.components, f), 'utf8');
  const rootBlock = (html.match(/:root \{([\s\S]*?)\}/) || [])[1] || '';
  for (const m of rootBlock.matchAll(/(--[\w./-]+):\s*([^;]+);/g)) core[m[1]] = m[2].trim();
}

// ---- load distilled components, tagged with source page --------------------
const atoms = [], sections = [];
for (const spec of opt.files) {
  const i = spec.indexOf(':');
  const pg = '/' + spec.slice(0, i).replace(/^home$/, '').replace(/^\//, '');
  for (const c of JSON.parse(fs.readFileSync(spec.slice(i + 1), 'utf8'))) {
    if (c.error) continue;
    c.sourcePage = pg === '/' ? '/' : pg;
    (/-section$/.test(c.name) ? sections : atoms).push(c);
  }
}

// ---- helpers ----------------------------------------------------------------
const rootProps = (c) => (c.css && c.css['.' + c.name.replace(/[^a-z0-9_-]/gi, '')]) || {};
const depthOf = (html) => {
  let d = 0, max = 0;
  for (const m of html.matchAll(/<(\/?)[a-z][a-z0-9]*/g)) {
    if (m[1]) d--; else { d++; if (d > max) max = d; }
  }
  return max;
};
const isColorVal = (v) => /^#|^rgb|^lab|^okl/.test(String(v).trim());
const STABLE = ['display', 'border-radius', 'background-color', 'color', 'font-size', 'font-weight'];
// outer display is context-dependent on a consuming page (flex vs inline-flex
// render identically inside flex rows) — consumers tripped on exact
// pins, so display expects are equivalence arrays (runner supports arrays)
const DISPLAY_EQUIV = {
  'flex': ['flex', 'inline-flex'], 'inline-flex': ['inline-flex', 'flex'],
  'grid': ['grid', 'inline-grid'], 'inline-grid': ['inline-grid', 'grid'],
  'block': ['block', 'inline-block'], 'inline-block': ['inline-block', 'block'],
};

// signature class tokens per atom (variant markers preferred) — used for
// section "contains" assertions, matched against source DOM class strings
const sigOf = (c) => {
  // only a variant-marker class (BEM-ish `x--y`) is distinctive enough to
  // assert containment; utility tokens (`group`, `mt-v1`, bare `card`)
  // false-positive everywhere. No marker -> no contains assert (honest gap).
  const m = c.html.match(/data-src-class="([^"]*)"/);
  if (!m) return null;
  return m[1].split(/\s+/).filter((t) => t.includes('--') && !/[[\]:/]/.test(t))
    .sort((a, b) => b.length - a.length)[0] || null;
};
const atomSig = {};
for (const a of atoms) { const s = sigOf(a); if (s) atomSig[a.name] = s; }

// ---- component fixtures ------------------------------------------------------
const componentFixtures = atoms.map((c) => {
  const props = rootProps(c);
  const css = [];
  for (const p of STABLE) {
    if (!(p in props)) continue;
    const v = props[p];
    if (p === 'display' && DISPLAY_EQUIV[v]) css.push({ prop: p, expect: DISPLAY_EQUIV[v] });
    else css.push(isColorVal(v) ? { prop: p, expect: v, tolerance: 'deltaE<=3' } : { prop: p, expect: v });
  }
  const fix = {
    name: c.name,
    match: 'any element the consuming page presents as a ' + c.name.replace(/--/g, ' ').replace(/-/g, ' '),
    sourcePage: c.sourcePage, sourceSel: c.sel,
    expectText: (c.text || '').slice(0, 24) || undefined,
    structure: {
      tags: [(c.html.match(/^<([a-z0-9]+)/) || [, 'div'])[1]],
      maxDepth: depthOf(c.html),
    },
    css,
  };
  for (const st of ['hover', 'focus']) {
    const diff = c.states && c.states[st];
    if (!diff || typeof diff !== 'object' || diff['outline-style'] === 'auto') continue;
    fix[st] = Object.entries(diff).map(([prop, v]) =>
      prop === 'outline-width' || prop === 'outline-style'
        ? { prop, expect: v }
        : { prop, changes: true });
  }
  return fix;
});

// ---- section fixtures --------------------------------------------------------
const sectionFixtures = sections.map((c) => {
  const contains = [];
  const seen = new Set();
  for (const [atom, sig] of Object.entries(atomSig)) {
    if (seen.has(sig)) continue;
    const re = new RegExp('data-src-class="[^"]*\\b' + sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    if (re.test(c.html)) { contains.push({ component: atom, sig }); seen.add(sig); }
  }
  return {
    name: c.name.replace(/-section$/, ''),
    sourcePage: c.sourcePage, sourceSel: c.sel,
    asserts: contains.map((x) => ({ type: 'contains', component: x.component, classSig: x.sig })),
  };
});

const out = {
  meta: {
    source: opt.source || 'unknown',
    extracted: new Date().toISOString().slice(0, 10),
    theme: opt.theme || 'default',
    extractorVersion: opt.version || '0.3.0-phaseC',
  },
  tokens: {
    core,
    recallMin: 0.9,
    foreignRateMax: 0.05,
    colorTolerance: 'CIEDE2000 deltaE <= 3',
  },
  components: componentFixtures,
  sections: sectionFixtures,
};
fs.mkdirSync(path.dirname(opt.out), { recursive: true });
fs.writeFileSync(opt.out, JSON.stringify(out, null, 2) + '\n');
console.error('wrote ' + opt.out + ': ' + Object.keys(core).length + ' core tokens, '
  + componentFixtures.length + ' components, ' + sectionFixtures.length + ' sections');
