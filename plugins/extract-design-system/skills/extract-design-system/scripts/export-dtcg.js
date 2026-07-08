#!/usr/bin/env node
// export-dtcg.js — mechanical DTCG export of the stage-2 token table.
//
// Reads extract-tokens.js output and writes a Design Tokens Community Group
// format file (hex/string $value style — the widely-supported classic form).
// Groups by token-name prefix: color / dimension / font / shadow / other.
//
// Usage: node export-dtcg.js <tokens.json> <out.json> [--source url] [--theme light]

'use strict';
const fs = require('fs');

const [, , inFile, outFile, ...rest] = process.argv;
if (!inFile || !outFile) {
  console.error('usage: node export-dtcg.js tokens.json out.json [--source url] [--theme t]');
  process.exit(1);
}
const opt = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--source') opt.source = rest[++i];
  else if (rest[i] === '--theme') opt.theme = rest[++i];
}

const tok = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const allVars = { ...(tok.varsExtra || {}), ...(tok.vars || {}) };

// Value shape decides the type BEFORE any name heuristic: Tailwind v4 names
// font sizes --text-* (e.g. --text-2xl: 1.5rem), which a name-first rule
// mis-typed as color.
const isColorValue = (v) =>
  /^#[0-9a-f]{3,8}$/i.test(v) || /^(rgba?|hsla?|lab|oklab|oklch|color-mix|color)\(/i.test(v);
const isColorName = (name) => /^--(color|bg|fg|text|border|accent|surface)/.test(name);
const isDimension = (v) => /^-?\d+(\.\d+)?(px|rem|em|ch|vh|vw|%)$/.test(v.trim());
const isNumber = (v) => /^-?\d+(\.\d+)?$/.test(v.trim());
const isFontFamily = (name) => /^--font(-|$)/.test(name) && !/size|weight/.test(name);

const groups = { color: {}, dimension: {}, number: {}, font: {}, shadow: {}, other: {} };
for (const [name, rawVal] of Object.entries(allVars)) {
  const v = String(rawVal).trim();
  const key = name.replace(/^--/, '');
  if (/shadow/.test(name)) groups.shadow[key] = { $type: 'shadow', $value: v };
  else if (isFontFamily(name)) groups.font[key] = { $type: 'fontFamily', $value: v };
  else if (isColorValue(v)) groups.color[key] = { $type: 'color', $value: v };
  else if (isDimension(v)) groups.dimension[key] = { $type: 'dimension', $value: v };
  else if (isNumber(v)) groups.number[key] = { $type: 'number', $value: v };
  else if (isColorName(name) && /^[a-z]/i.test(v)) groups.color[key] = { $type: 'color', $value: v };
  else groups.other[key] = { $value: v }; // calc()/keywords: value preserved, untyped
}

const out = {
  $description: 'Design tokens extracted from ' + (opt.source || 'source site')
    + (opt.theme ? ' (' + opt.theme + ' theme)' : '')
    + ' — mechanical export of the extracted CSS custom-property table.',
};
for (const g in groups) {
  if (Object.keys(groups[g]).length) out[g] = groups[g];
}
fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n');
const counts = Object.entries(groups).map(([g, o]) => g + ':' + Object.keys(o).length).join(' ');
console.error('wrote ' + outFile + ' (' + counts + ')');
