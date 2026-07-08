// eval-selftest.js — run eval/fixtures.json against the LIVE SOURCE.
// Any failure means the fixture (or the extraction) is wrong — fix or drop;
// never ship a fixture the source itself fails.
//
// run-code template. Compose per page: tpl.replace the FIXTURES placeholder
// (double-underscore token — it must appear exactly ONCE in this file, in the
// code below; never write the literal in comments) with the fixtures.json
// text, then: playwright-cli -s=dsys run-code "$(cat selftest-run.js)" | bash slice-result.sh
// The script only checks fixtures whose sourcePage matches location.pathname.
//
// Colors compare via CIEDE2000 deltaE <= 3 (the tolerance recorded in
// fixtures.json); token core values likewise when both sides parse as colors.

async (page) => {
  const FIX = __FIXTURES__;
  const here = await page.evaluate(() => location.pathname || '/');
  const out = { page: here, checks: [], passed: 0, failed: 0 };
  const rec = (name, check, ok, detail) => {
    out.checks.push({ name, check, ok, detail });
    ok ? out.passed++ : out.failed++;
  };

  // ---- CIEDE2000 (node side) ----------------------------------------------
  const parseCol = (v) => {
    v = String(v).trim();
    let m = /^#([0-9a-f]{6})$/i.exec(v);
    if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    m = /^rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(v);
    if (m) return [+m[1], +m[2], +m[3]];
    return null;
  };
  const rgb2lab = ([r, g, b]) => {
    const f = (c) => { c /= 255; return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92; };
    const [R, G, B] = [f(r), f(g), f(b)];
    let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    let Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
    let Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const g2 = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    [X, Y, Z] = [g2(X), g2(Y), g2(Z)];
    return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
  };
  const ciede2000 = (lab1, lab2) => {
    const [L1, a1, b1] = lab1, [L2, a2, b2] = lab2;
    const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
    const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
    const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    const h1p = Math.atan2(b1, a1p) * 180 / Math.PI + (Math.atan2(b1, a1p) < 0 ? 360 : 0);
    const h2p = Math.atan2(b2, a2p) * 180 / Math.PI + (Math.atan2(b2, a2p) < 0 ? 360 : 0);
    const dL = L2 - L1, dC = C2p - C1p;
    let dh = h2p - h1p;
    if (C1p * C2p !== 0) { if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; } else dh = 0;
    const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(dh * Math.PI / 360);
    const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
    let hbp = (h1p + h2p) / 2;
    if (C1p * C2p !== 0 && Math.abs(h1p - h2p) > 180) hbp += hbp < 180 ? 180 : -180;
    const T = 1 - 0.17 * Math.cos((hbp - 30) * Math.PI / 180) + 0.24 * Math.cos(2 * hbp * Math.PI / 180)
      + 0.32 * Math.cos((3 * hbp + 6) * Math.PI / 180) - 0.20 * Math.cos((4 * hbp - 63) * Math.PI / 180);
    const SL = 1 + 0.015 * Math.pow(Lbp - 50, 2) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
    const SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T;
    const dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
    const RC = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
    const RT = -RC * Math.sin(2 * dTheta * Math.PI / 180);
    return Math.sqrt(Math.pow(dL / SL, 2) + Math.pow(dC / SC, 2) + Math.pow(dH / SH, 2)
      + RT * (dC / SC) * (dH / SH));
  };
  const colorOk = (expect, actual) => {
    const c1 = parseCol(expect), c2 = parseCol(actual);
    if (!c1 || !c2) return { ok: String(expect).trim() === String(actual).trim(), dE: null };
    const dE = ciede2000(rgb2lab(c1), rgb2lab(c2));
    return { ok: dE <= 3, dE: Math.round(dE * 100) / 100 };
  };

  let client = null;
  try {
    client = await page.context().newCDPSession(page);
    await client.send('DOM.enable'); await client.send('CSS.enable');
  } catch (_) { }

  // ---- token core (checked once, on '/') -----------------------------------
  if (here === '/') {
    for (const [name, expect] of Object.entries(FIX.tokens.core || {})) {
      const actual = await page.evaluate((n) =>
        getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
      if (!actual) { rec('tokens', name, false, 'not defined on :root'); continue; }
      const r = colorOk(expect, actual);
      rec('tokens', name, r.ok, 'expect ' + expect + ' actual ' + actual + (r.dE !== null ? ' dE=' + r.dE : ''));
    }
  }

  // ---- component fixtures ----------------------------------------------------
  for (const fx of (FIX.components || []).filter((f) => f.sourcePage === here)) {
    const found = await page.evaluate((f) => {
      let el = null;
      try { el = document.querySelector(f.sourceSel); } catch (_) { }
      if ((!el || (f.expectText && !(el.textContent || '').trim().startsWith(f.expectText))) && f.expectText) {
        const tag = (f.structure.tags && f.structure.tags[0]) || '*';
        el = Array.from(document.querySelectorAll(tag)).find((e) =>
          (e.textContent || '').trim().startsWith(f.expectText) && e.getClientRects().length) || el;
      }
      if (!el) return null;
      el.setAttribute('data-dsys-test', f.name);
      const s = getComputedStyle(el);
      const props = {};
      for (const a of f.css) props[a.prop] = s.getPropertyValue(a.prop);
      // pill radii report huge px values; normalize like the extractor did
      if (props['border-radius']) {
        const r = el.getBoundingClientRect();
        if (parseFloat(props['border-radius']) >= r.height / 2 && r.height > 0) props['border-radius'] = '9999px';
      }
      return { tag: el.tagName.toLowerCase(), props };
    }, fx);
    if (!found) { rec(fx.name, 'resolve', false, fx.sourceSel); continue; }
    rec(fx.name, 'structure.tag', fx.structure.tags.includes(found.tag), found.tag);
    for (const a of fx.css) {
      const actual = found.props[a.prop];
      if (a.tolerance) {
        const r = colorOk(a.expect, actual);
        rec(fx.name, 'css.' + a.prop, r.ok, 'expect ' + a.expect + ' actual ' + actual + ' dE=' + r.dE);
      } else {
        const ok = Array.isArray(a.expect) ? a.expect.includes(actual) : actual === a.expect;
        rec(fx.name, 'css.' + a.prop, ok, 'expect ' + JSON.stringify(a.expect) + ' actual ' + actual);
      }
    }
    // forced-state asserts
    if (client && (fx.hover || fx.focus)) {
      try {
        const doc = await client.send('DOM.getDocument', { depth: -1 });
        const node = await client.send('DOM.querySelector',
          { nodeId: doc.root.nodeId, selector: '[data-dsys-test="' + fx.name + '"]' });
        if (node.nodeId) {
          const readProps = (props) => page.evaluate((args) => {
            const el = document.querySelector('[data-dsys-test="' + args.name + '"]');
            const s = getComputedStyle(el); const o = {};
            for (const p of args.props) o[p] = s.getPropertyValue(p);
            return o;
          }, { name: fx.name, props });
          for (const [st, pseudo] of [['hover', ['hover']], ['focus', ['focus', 'focus-visible']]]) {
            if (!fx[st]) continue;
            const props = fx[st].map((a) => a.prop);
            const base = await readProps(props);
            await client.send('CSS.forcePseudoState', { nodeId: node.nodeId, forcedPseudoClasses: pseudo });
            await page.waitForTimeout(80);
            const forced = await readProps(props);
            await client.send('CSS.forcePseudoState', { nodeId: node.nodeId, forcedPseudoClasses: [] });
            for (const a of fx[st]) {
              if (a.changes) rec(fx.name, st + '.' + a.prop + '.changes', forced[a.prop] !== base[a.prop],
                base[a.prop] + ' -> ' + forced[a.prop]);
              else rec(fx.name, st + '.' + a.prop, forced[a.prop] === a.expect,
                'expect ' + a.expect + ' actual ' + forced[a.prop]);
            }
          }
        }
      } catch (e) { rec(fx.name, 'states', false, 'cdp: ' + e.message.slice(0, 80)); }
    }
  }

  // ---- section fixtures --------------------------------------------------------
  for (const fx of (FIX.sections || []).filter((f) => f.sourcePage === here)) {
    const r = await page.evaluate((f) => {
      let el = null;
      try { el = document.querySelector(f.sourceSel); } catch (_) { }
      if (!el) return null;
      return f.asserts.map((a) => {
        if (a.type !== 'contains') return { a, ok: false, detail: 'unknown assert type' };
        const hit = Array.from(el.querySelectorAll('[class]')).some((n) => {
          const cls = String(n.className && n.className.baseVal !== undefined ? n.className.baseVal : n.className || '');
          return cls.split(/\s+/).includes(a.classSig);
        });
        return { a, ok: hit, detail: a.classSig };
      });
    }, fx);
    if (!r) { rec('section:' + fx.name, 'resolve', false, fx.sourceSel); continue; }
    for (const x of r) rec('section:' + fx.name, 'contains ' + x.a.component, x.ok, x.detail);
  }

  return out;
}
