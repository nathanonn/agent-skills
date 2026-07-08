#!/usr/bin/env node
// cluster.js — stage-4 mechanical clustering for extract-design-system.
//
// Reads one or more candidates-*.json files (output of extract-components.js,
// one per sampled page), merges cross-page, and emits clusters.json: variant
// families per component kind, ranked by instance count, each with a
// per-property-mode representative style and a top-scored representative
// element. Applies the catalog gate: >=2 instances site-wide
// OR semantic/landmark role. Claude curation (naming, merging, dropping)
// happens AFTER this — this script is deterministic.
//
// Usage: node cluster.js candidates-home.json candidates-pricing.json > clusters.json

'use strict';
const fs = require('fs');

const COS_THRESHOLD = 0.95;          // greedy leader clustering (tune per 11-open-questions #1)
const SEMANTIC_KINDS = new Set([     // pass the gate even as singletons
  'nav', 'header', 'footer', 'input', 'select', 'textarea', 'checkbox',
  'dialog', 'table', 'form', 'tab', 'tablist', 'menu', 'tooltip']);

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: node cluster.js <candidates.json>...'); process.exit(1); }

const pages = files.map((f) => {
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  d._file = f;
  return d;
});

// ---- merge candidates across pages, tagging source page --------------------
const all = [];
for (const p of pages) {
  for (const c of p.candidates || []) all.push({ ...c, page: p.page });
}

// ---- vector math ------------------------------------------------------------
const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (!na || !nb) return na === nb ? 1 : 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};
const modeOf = (members, prop) => {
  const counts = {};
  for (const m of members) {
    const v = (m.raw || {})[prop];
    if (v == null) continue;
    counts[v] = (counts[v] || 0) + 1;
  }
  let best = null, bc = -1;
  for (const k in counts) if (counts[k] > bc) { bc = counts[k]; best = k; }
  return best;
};
const RAWPROPS = ['backgroundColor', 'color', 'borderColor', 'borderWidth', 'borderStyle',
  'borderRadius', 'padding', 'fontSize', 'fontWeight', 'fontFamily', 'display',
  'boxShadow', 'gap', 'textTransform', 'letterSpacing', 'transitionProperty',
  'transitionDuration'];

// ---- group by kind|hash, then greedy-leader cluster within groups -----------
const groups = new Map();
for (const c of all) {
  const key = c.kind + '|' + c.hash;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(c);
}

const clustersByKind = new Map();
for (const [key, members] of groups) {
  const kind = key.split('|')[0];
  // sort by score desc so leaders are the best-evidenced members (F1)
  members.sort((a, b) => (b.score || 0) - (a.score || 0));
  const leaders = [];
  for (const m of members) {
    let placed = false;
    for (const L of leaders) {
      if (cosine(m.vec, L.vec) >= COS_THRESHOLD) { L.members.push(m); placed = true; break; }
    }
    if (!placed) leaders.push({ vec: m.vec, members: [m] });
  }
  for (const L of leaders) {
    if (!clustersByKind.has(kind)) clustersByKind.set(kind, []);
    // instance count: channel-B members carry groupSize (page-wide count),
    // captured members may be a sample — use max(captured, sum-of-groupSize-share)
    const captured = L.members.length;
    const groupCounts = L.members.filter((m) => m.groupSize);
    const estimated = groupCounts.length
      ? Math.max(captured, Math.max(...groupCounts.map((m) => m.groupSize)))
      : captured;
    const style = {};
    for (const p of RAWPROPS) { const v = modeOf(L.members, p); if (v != null) style[p] = v; }
    const rep = L.members[0]; // highest score
    const hints = Array.from(new Set(L.members.flatMap((m) => m.hints || [])));
    clustersByKind.get(kind).push({
      kind, hash: key.split('|')[1],
      instances: estimated,
      capturedMembers: captured,
      pages: Array.from(new Set(L.members.map((m) => m.page))),
      channels: Array.from(new Set(L.members.map((m) => m.ch))),
      hints: hints.length ? hints : undefined,
      style,
      slots: rep.slots,
      representative: { sel: rep.sel, page: rep.page, text: rep.text, score: rep.score, bbox: rep.bbox },
      sampleTexts: Array.from(new Set(L.members.map((m) => m.text).filter(Boolean))).slice(0, 5),
    });
  }
}

// ---- catalog gate + output ---------------------------------------------------
const passed = [], skipped = [];
for (const [kind, clusters] of clustersByKind) {
  clusters.sort((a, b) => b.instances - a.instances);
  for (const cl of clusters) {
    const gate = cl.instances >= 2 || SEMANTIC_KINDS.has(kind);
    (gate ? passed : skipped).push(gate ? cl : { ...cl, skipReason: 'singleton without semantic role' });
  }
}
passed.sort((a, b) => (a.kind > b.kind ? 1 : a.kind < b.kind ? -1 : b.instances - a.instances));

const regime = pages[0].regime || {};
process.stdout.write(JSON.stringify({
  meta: {
    pages: pages.map((p) => ({ page: p.page, file: p._file, candidates: (p.candidates || []).length, kindTotals: p.kindTotals })),
    totalCandidates: all.length,
    cosThreshold: COS_THRESHOLD,
  },
  regime,
  gate: { passed: passed.length, skipped: skipped.length },
  clusters: passed,
  skipped,
}, null, 1));
