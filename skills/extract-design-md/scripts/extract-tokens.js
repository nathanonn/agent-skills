// extract-tokens.js — DESIGN.md token extractor for `playwright-cli run-code`.
//
// This is the productionized version of the nucleus proven on cursor.com during
// research: it reads :root CSS custom properties (noise-filtered), samples the
// computed styles of visible main-content elements (mode-based, so one stray
// footer element can't skew a value), tags the prominent CTA + first input, then
// forces hover/focus via real Playwright actions and re-reads them.
//
// Usage (run once per page, and once per theme on dual-theme sites):
//   playwright-cli -s=designmd run-code "$(cat scripts/extract-tokens.js)" \
//     | bash scripts/slice-result.sh > tokens-home-light.json
//
// Returns ONE compact JSON object under playwright-cli's "### Result" header:
//   { themeSignal, vars, varsExtra, varsTotal, elements, states, ctaText, notes }
//
// Design notes:
//   - `vars`      = noise-filtered :root custom properties (the real tokens).
//   - `varsExtra` = other non-junk --* vars, kept so the skill can RELAX the
//                   filter on non-Tailwind sites where `vars` comes back thin
//                   (see references/edge-cases.md, EC-FW.1).
//   - `elements`  = mode computed-style per representative tag + button-primary
//                   + input-field. Colors arrive as rgb(...) (computed), trivial
//                   to hex-ify; CSS-var raws in `vars` are the fallback.
//   - `states`    = hover/focus variants. The skill drops any state equal to its
//                   base (FR-ST.3) during synthesis.
//   - Every section is wrapped so a single failure returns partial data, never
//     throws (FR-ROB.3).

async (page) => {
  const base = await page.evaluate(() => {
    const out = { themeSignal: {}, vars: {}, varsExtra: {}, varsTotal: 0, elements: {}, ctaText: '', notes: [] };

    // --- 1. :root custom properties, noise-filtered -----------------------
    try {
      const KEEP = ['--color-', '--text-', '--font-', '--font-weight-', '--radius-',
        '--spacing-', '--tracking-', '--leading-', '--breakpoint-', '--container-',
        '--max-width-', '--shadow-', '--blur-'];
      const DROP = ['--tw-', '--_', '--katex-', '--media-', '--animate-', '--ease-',
        '--duration', '--number-flow'];
      const rs = getComputedStyle(document.documentElement);
      for (const prop of Array.from(rs)) {
        if (!prop.startsWith('--')) continue;
        out.varsTotal++;
        if (DROP.some(d => prop.startsWith(d))) continue;
        if (prop.length <= 3) continue; // bare one-letter vars like --v, --g
        const val = rs.getPropertyValue(prop).trim();
        if (KEEP.some(k => prop.startsWith(k))) out.vars[prop] = val;
        else out.varsExtra[prop] = val;
      }
    } catch (e) { out.notes.push('vars: ' + e.message); }

    // --- 2. theme signal (the skill drives the actual toggle) -------------
    try {
      out.themeSignal = {
        htmlClass: document.documentElement.className || '',
        dataTheme: document.documentElement.getAttribute('data-theme') || '',
        colorScheme: getComputedStyle(document.documentElement).colorScheme || '',
        prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
        bodyBg: getComputedStyle(document.body).backgroundColor,
      };
    } catch (e) { out.notes.push('theme: ' + e.message); }

    // --- 3. computed styles of representative elements --------------------
    const PROPS = ['color', 'backgroundColor', 'fontFamily', 'fontSize', 'fontWeight',
      'lineHeight', 'letterSpacing', 'borderRadius', 'padding', 'boxShadow',
      'borderColor', 'borderWidth'];
    const vis = (el) => {
      try {
        const s = getComputedStyle(el); const r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden'
          && parseFloat(s.opacity || '1') > 0 && r.width > 1 && r.height > 1;
      } catch (_) { return false; }
    };
    const main = (el) => !el.closest('header,footer,nav,[role="banner"],[role="contentinfo"],[role="navigation"]');
    const read = (el) => { const s = getComputedStyle(el); const o = {}; for (const p of PROPS) o[p] = s[p]; return o; };
    const mode = (objs) => {
      const o = {};
      for (const p of PROPS) {
        const counts = {};
        for (const x of objs) { const v = x[p]; if (v == null) continue; counts[v] = (counts[v] || 0) + 1; }
        let best = null, bc = -1;
        for (const k in counts) { if (counts[k] > bc) { bc = counts[k]; best = k; } }
        if (best != null) o[p] = best;
      }
      return o;
    };

    const TAGS = ['body', 'h1', 'h2', 'h3', 'p', 'a', 'input', 'select', 'textarea'];
    for (const tag of TAGS) {
      try {
        let els = Array.from(document.getElementsByTagName(tag));
        if (tag !== 'body') els = els.filter(e => vis(e) && main(e));
        if (!els.length) continue;
        out.elements[tag] = mode(els.slice(0, 12).map(read));
      } catch (e) { out.notes.push(tag + ': ' + e.message); }
    }

    // --- 4. prominent CTA: largest visible main button near the top ------
    try {
      const btns = Array.from(document.querySelectorAll('button, a[role="button"], [class*="btn"], [class*="button"]'))
        .filter(e => vis(e) && main(e));
      let cta = null, area = -1; const limit = innerHeight * 1.6;
      for (const b of btns) {
        const r = b.getBoundingClientRect();
        if (r.top > limit || r.top < -50) continue;
        const a = r.width * r.height;
        if (a > area) { area = a; cta = b; }
      }
      if (cta) {
        cta.setAttribute('data-dmd-cta', '1');
        out.elements['button-primary'] = read(cta);
        out.ctaText = (cta.textContent || '').trim().slice(0, 40);
      }
    } catch (e) { out.notes.push('cta: ' + e.message); }

    // --- 5. first visible main input -------------------------------------
    try {
      const inp = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea'))
        .find(e => vis(e) && main(e));
      if (inp) { inp.setAttribute('data-dmd-input', '1'); out.elements['input-field'] = read(inp); }
    } catch (e) { out.notes.push('input: ' + e.message); }

    return out;
  });

  // --- 6. force interactive states with real Playwright actions ----------
  const states = {};
  try {
    const cta = page.locator('[data-dmd-cta]').first();
    if (await cta.count()) {
      await cta.hover({ timeout: 2000 }).catch(() => { });
      await page.waitForTimeout(150);
      states['button-primary-hover'] = await page.evaluate(() => {
        const el = document.querySelector('[data-dmd-cta]'); if (!el) return null;
        const s = getComputedStyle(el);
        return { color: s.color, backgroundColor: s.backgroundColor, borderColor: s.borderColor, boxShadow: s.boxShadow, borderRadius: s.borderRadius };
      });
    }
  } catch (e) { base.notes.push('hover: ' + e.message); }
  try {
    const inp = page.locator('[data-dmd-input]').first();
    if (await inp.count()) {
      await inp.focus({ timeout: 2000 }).catch(() => { });
      await page.waitForTimeout(150);
      states['input-field-focus'] = await page.evaluate(() => {
        const el = document.querySelector('[data-dmd-input]'); if (!el) return null;
        const s = getComputedStyle(el);
        return { borderColor: s.borderColor, boxShadow: s.boxShadow, outline: s.outline, backgroundColor: s.backgroundColor };
      });
    }
  } catch (e) { base.notes.push('focus: ' + e.message); }

  return { ...base, states };
}
