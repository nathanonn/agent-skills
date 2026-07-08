#!/usr/bin/env node
// build-snippets.js — stage-8 snippet emitter (component slice).
//
// Takes the token table (extract-tokens.js output) + one or more distill.js
// outputs and writes components/<name>.html (self-contained, token-variable-
// ified, variants + forced hover/focus shown side by side) plus gallery.html.
//
// Usage:
//   node build-snippets.js --tokens cursor-tokens.json --out components/ \
//     distilled-home.json distilled-pricing.json

'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = { files: [] };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--tokens') opt.tokens = args[++i];
  else if (args[i] === '--out') opt.out = args[++i];
  else if (args[i] === '--source') opt.source = args[++i];
  else opt.files.push(args[i]);
}
if (!opt.tokens || !opt.out || !opt.files.length) {
  console.error('usage: node build-snippets.js --tokens t.json --out dir/ [--source url] distilled...json');
  process.exit(1);
}

// ---- token map: normalized color -> best var name --------------------------
const tok = JSON.parse(fs.readFileSync(opt.tokens, 'utf8'));
const allVars = { ...(tok.varsExtra || {}), ...(tok.vars || {}) };
const parseCol = (v) => {
  if (!v) return null;
  v = String(v).trim();
  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), 1];
  m = /^#([0-9a-f]{3})$/i.exec(v);
  if (m) return [17 * parseInt(m[1][0], 16), 17 * parseInt(m[1][1], 16), 17 * parseInt(m[1][2], 16), 1];
  m = /^rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\)$/.exec(v);
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  return null;
};
const colorTokens = []; // {name, rgb}
const otherTokens = {}; // exact-value match (radius, spacing px values)
for (const name in allVars) {
  const c = parseCol(allVars[name]);
  if (c) colorTokens.push({ name, rgb: c });
  else if (/^\d+(\.\d+)?(px|rem)$/.test(allVars[name].trim())) {
    (otherTokens[allVars[name].trim()] = otherTokens[allVars[name].trim()] || []).push(name);
  }
}
const rank = (name) => (name.includes('theme') ? 0 : 1) * 1000 + name.length;
const usedTokens = new Map(); // var name -> value
let matched = 0, unmatchedColors = new Set();
const tokenize = (value) => {
  // replace every color occurrence in a CSS value with var(--x) when a token matches
  return String(value).replace(/#[0-9a-f]{3,6}\b|rgba?\([\d.,\s/]+\)/gi, (colStr) => {
    const c = parseCol(colStr);
    if (!c) return colStr;
    let best = null, bd = 1e9;
    for (const t of colorTokens) {
      if (Math.abs(t.rgb[3] - c[3]) > 0.05) continue;
      const d = Math.hypot(t.rgb[0] - c[0], t.rgb[1] - c[1], t.rgb[2] - c[2]);
      if (d < bd || (d === bd && best && rank(t.name) < rank(best))) { bd = d; best = t.name; }
    }
    if (best && bd <= 6) {
      usedTokens.set(best, allVars[best]);
      matched++;
      return 'var(' + best + ')';
    }
    if (colStr !== 'rgba(0, 0, 0, 0)') unmatchedColors.add(colStr);
    return colStr;
  });
};

// ---- build one snippet file -------------------------------------------------
fs.mkdirSync(opt.out, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const comps = [];
for (const f of opt.files) {
  for (const c of JSON.parse(fs.readFileSync(f, 'utf8'))) {
    if (c.error) { console.error('skip ' + c.name + ': ' + c.error); continue; }
    comps.push(c);
  }
}

const snippetBody = (c) => {
  const rootCls = c.name.replace(/[^a-z0-9_-]/gi, '');
  const isSection = /-section$/.test(c.name); // sections render full-width, no state copies
  const localUsed = new Map();
  const localTokenize = (v) => {
    const before = usedTokens.size;
    const r = tokenize(v);
    return r;
  };
  let rules = '';
  for (const sel in (c.css || {})) {
    rules += '  ' + sel + ' {\n';
    for (const p in c.css[sel]) rules += '    ' + p + ': ' + localTokenize(c.css[sel][p]) + ';\n';
    rules += '  }\n';
  }
  const stateRules = [];
  const stateCopies = [];
  for (const st of isSection ? [] : ['hover', 'focus']) {
    let diff = c.states && c.states[st];
    // a UA-default focus ring (outline-style:auto) is not an authored state
    if (diff && typeof diff === 'object' && diff['outline-style'] === 'auto') diff = null;
    if (diff && typeof diff === 'object') {
      let r = '  .' + rootCls + '.is-' + st + ' {\n';
      for (const p in diff) r += '    ' + p + ': ' + localTokenize(diff[p]) + ';\n';
      stateRules.push(r + '  }\n');
      stateCopies.push({ st });
    }
  }
  const withClass = (extra) => c.html.replace('class="' + rootCls + '"', 'class="' + rootCls + ' ' + extra + '"');
  const itemCls = 'dsys-item' + (isSection ? ' dsys-item--wide' : '');
  let body = '<section class="dsys-demo">\n<h2>' + c.name + '</h2>\n';
  body += '<div class="dsys-row"><div class="' + itemCls + '"><span class="dsys-tag">base</span>\n' + c.html + '\n</div>';
  for (const s of stateCopies) {
    body += '\n<div class="dsys-item"><span class="dsys-tag">:' + s.st + ' (forced)</span>\n'
      + withClass('is-' + s.st) + '\n</div>';
  }
  body += '</div>\n</section>';
  return { rules: rules + stateRules.join(''), body };
};

const CHROME = `
  body { margin: 0; padding: 32px; font-family: system-ui, sans-serif; background: ${tokenize(tok.themeSignal && tok.themeSignal.bodyBg || '#fff')}; }
  .dsys-demo { margin-bottom: 40px; }
  .dsys-demo h2 { font: 600 13px/1 monospace; color: #888; margin: 0 0 12px; }
  .dsys-row { display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; }
  .dsys-item { max-width: 480px; }
  .dsys-item--wide { max-width: 100%; flex-basis: 100%; }
  .dsys-tag { display: block; font: 11px/1 monospace; color: #aaa; margin-bottom: 6px; }
`;

const rootBlock = () => {
  let s = '  :root {\n';
  for (const [k, v] of usedTokens) s += '    ' + k + ': ' + v + ';\n';
  return s + '  }\n';
};

const galleryParts = [];
for (const c of comps) {
  usedTokens.clear();
  const { rules, body } = snippetBody(c);
  const meta = '<!-- ' + c.name + ' — extracted from ' + (opt.source || 'source') + ' ' + today
    + (c.transition ? ' · transition: ' + c.transition.property + ' ' + c.transition.duration + ' ' + c.transition.easing : '')
    + ' · original bbox ' + (c.bbox || []).join(',') + ' -->\n';
  const html = meta + '<!doctype html>\n<meta charset="utf-8">\n<title>' + c.name + '</title>\n<style>\n'
    + rootBlock() + CHROME + rules + '</style>\n' + body + '\n';
  const file = path.join(opt.out, c.name.replace(/[^a-z0-9_-]/gi, '') + '.html');
  fs.writeFileSync(file, html);
  console.error('wrote ' + file + ' (' + html.split('\n').length + ' lines)');
  galleryParts.push({ c, rules, body, meta });
}

// gallery: shared :root with union of used tokens
usedTokens.clear();
let gRules = '', gBody = '';
for (const g of galleryParts) {
  const { rules, body } = snippetBody(g.c); // re-run to accumulate usedTokens union
  gRules += rules; gBody += body + '\n';
}
const gallery = '<!-- gallery — ' + (opt.source || '') + ' ' + today + ' -->\n<!doctype html>\n<meta charset="utf-8">\n<title>gallery</title>\n<style>\n'
  + rootBlock() + CHROME + gRules + '</style>\n' + gBody;
fs.writeFileSync(path.join(opt.out, 'gallery.html'), gallery);
console.error('wrote gallery.html (' + gallery.split('\n').length + ' lines)');
console.error('token matches: ' + matched + ' | unmatched colors: ' + unmatchedColors.size
  + (unmatchedColors.size ? ' -> ' + Array.from(unmatchedColors).slice(0, 8).join(' | ') : ''));
