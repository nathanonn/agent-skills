// extract-sections.js — stage-7 section classifier for `playwright-cli run-code`.
//
// Candidates are the
// direct children of main/body spanning >=60% viewport width, plus
// header/footer/nav landmarks. Each candidate is scored against the section
// taxonomy (hero, pricing-table, feature-grid, faq, stats, logo-wall, cta-band,
// footer, nav-header) by landmark + content-regex + geometry rules.
// Confidence >=0.5 -> auto-label; below -> needsSmart:true (Claude labels from
// the distilled snippet + screenshot crop, may assign custom:<name>).
//
// Usage (run once per sampled page):
//   playwright-cli -s=dsys run-code "$(cat scripts/extract-sections.js)" \
//     | bash scripts/slice-result.sh > sections-home.json
//
// Returns ONE compact JSON object:
//   { page, viewport, docHeight, sections: [...], notes }
// Every section: { pattern, confidence, needsSmart, order, sel, bbox, heading,
//   skeleton, atomEvidence, signals }.
// `atomEvidence` = class tokens + tag/role counts of notable descendants, for
// Claude to map onto catalog atoms during curation (composition recipe).
// Wrapped so a single bad candidate degrades to a note, never a thrown run.

async (page) => {
  return await page.evaluate(() => {
    const out = {
      page: location.pathname || '/',
      viewport: { w: innerWidth, h: innerHeight },
      docHeight: Math.round(document.documentElement.scrollHeight),
      sections: [], notes: [],
    };
    const vis = (el) => {
      try {
        const s = getComputedStyle(el); const r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 1 && r.height > 1;
      } catch (_) { return false; }
    };
    const inMock = (el) => !!el.closest(
      '[class*="mock"],[class*="demo"],[class*="preview"],[class*="screenshot"],[aria-hidden="true"]');
    const selectorOf = (el) => {
      try {
        if (el.id) return '#' + CSS.escape(el.id);
        const parts = [];
        let cur = el;
        for (let i = 0; i < 5 && cur && cur !== document.documentElement; i++) {
          const tag = cur.tagName.toLowerCase();
          const sibs = cur.parentElement
            ? Array.from(cur.parentElement.children).filter(c => c.tagName === cur.tagName) : [];
          parts.unshift(sibs.length > 1
            ? tag + ':nth-of-type(' + (sibs.indexOf(cur) + 1) + ')' : tag);
          if (cur.parentElement && cur.parentElement.id) {
            parts.unshift('#' + CSS.escape(cur.parentElement.id));
            return parts.join(' > ');
          }
          cur = cur.parentElement;
        }
        return parts.join(' > ');
      } catch (_) { return el.tagName.toLowerCase(); }
    };
    const abs = (el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY),
               w: Math.round(r.width), h: Math.round(r.height) };
    };
    const CTA_SEL = 'a[class*="btn"],a[class*="button"],button,[role="button"]';
    const HEADING_SEL = 'h1,h2,h3,h4,[role="heading"]';

    // ---------- candidate collection ---------------------------------------
    const root = document.querySelector('main') || document.body;
    const cands = [];
    const push = (el, landmark) => {
      if (!el || !vis(el) || inMock(el)) return;
      if (cands.some(c => c.el === el || c.el.contains(el) || el.contains(c.el))) return;
      cands.push({ el, landmark: landmark || null });
    };
    push(document.querySelector('header, [role="banner"]'), 'header');
    push(document.querySelector('footer, [role="contentinfo"]'), 'footer');
    for (const child of Array.from(root.children)) {
      if (['SCRIPT', 'STYLE', 'TEMPLATE'].includes(child.tagName)) continue;
      const r = child.getBoundingClientRect();
      if (r.width < innerWidth * 0.6 || r.height < 40) continue;
      // unwrap page-level wrappers: a single >=90%-height child that itself has
      // multiple wide children is a shell, not a section
      if (root.children.length <= 2 && child.children.length > 2
          && r.height > document.documentElement.scrollHeight * 0.8) {
        for (const gc of Array.from(child.children)) {
          const gr = gc.getBoundingClientRect();
          if (gr.width >= innerWidth * 0.6 && gr.height >= 40) push(gc, null);
        }
        continue;
      }
      push(child, null);
    }

    // ---------- per-candidate signals ---------------------------------------
    const firstH1 = document.querySelector('main h1') || document.querySelector('h1');
    const scored = [];
    for (const c of cands) {
      try {
        const el = c.el;
        const box = abs(el);
        const text = (el.innerText || '').trim();
        const heading = (() => {
          const h = el.querySelector(HEADING_SEL);
          return h ? (h.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 80) : '';
        })();
        const ctas = Array.from(el.querySelectorAll(CTA_SEL)).filter(vis);
        const details = el.querySelectorAll('details').length;
        const currencyHits = (text.match(/[$€£]\s?\d/g) || []).length;
        // equal-width sibling analysis on the densest row container inside
        const rowInfo = (() => {
          let best = { n: 0, cols: 0, el: null };
          const walk = [el];
          let guard = 0;
          while (walk.length && guard++ < 400) {
            const n = walk.shift();
            const kids = Array.from(n.children).filter(vis);
            if (kids.length >= 2) {
              const ws = kids.map(k => k.getBoundingClientRect().width).filter(w => w > 40);
              if (ws.length >= 2) {
                const same = ws.filter(w => Math.abs(w - ws[0]) < ws[0] * 0.12).length;
                if (same >= 2 && same > best.n) best = { n: same, cols: same, el: n };
              }
            }
            for (const k of kids) if (k.children.length) walk.push(k);
          }
          return best;
        })();
        // tier cards are often whole-card <a> links whose inner CTA is a styled
        // span (misses CTA_SEL) — phase D: both consumer pages' pricing
        // sections fell to feature-grid on the ctas gate. A ✓/li feature list
        // inside the equal-width row is an equivalent pricing signal.
        const tierListHits = (text.match(/[✓✔]/g) || []).length
          + (rowInfo.el ? rowInfo.el.querySelectorAll('li').length : 0);
        const imgs = Array.from(el.querySelectorAll('img,svg')).filter(vis);
        const smallImgs = imgs.filter(i => { const r = i.getBoundingClientRect(); return r.height > 8 && r.height < 80; });
        const digitRatio = text.length ? ((text.match(/\d/g) || []).length / text.length) : 0;

        // ---------- pattern scores (taxonomy) --------------
        const s = {};
        if (c.landmark === 'header' || (el.querySelector('nav') && box.y < 200)) s['nav-header'] = 0.95;
        if (c.landmark === 'footer') s.footer = 0.95;
        if (!c.landmark) {
          if (firstH1 && el.contains(firstH1)) {
            s.hero = 0.85 + (ctas.length ? 0.05 : 0) - (box.y > innerHeight * 1.5 ? 0.4 : 0);
          }
          if (currencyHits >= 2 && rowInfo.n >= 2
              && (ctas.length >= 2 || tierListHits >= 4)) s['pricing-table'] = 0.9;
          if (/faq|questions/i.test(heading) && (details >= 2 || rowInfo.n >= 3)) s.faq = 0.85;
          if (rowInfo.n >= 3 && el.querySelectorAll(HEADING_SEL).length >= 3
              && !s['pricing-table']) s['feature-grid'] = 0.7;
          if (digitRatio > 0.08 && rowInfo.n >= 2 && text.length < 600) s.stats = 0.65;
          if (smallImgs.length >= 4 && text.length < smallImgs.length * 30) s['logo-wall'] = 0.75;
          const nearEnd = box.y + box.h > document.documentElement.scrollHeight * 0.8;
          if (nearEnd && box.h < 600 && heading && ctas.length >= 1 && ctas.length <= 3
              && !s.footer) s['cta-band'] = 0.6 + (ctas.length === 1 ? 0.1 : 0);
        }
        // specific beats generic on ties: a pricing page's h1 lives inside the
        // pricing table — that section is pricing-table, not hero
        if (s['pricing-table'] && s.hero && s['pricing-table'] >= s.hero) delete s.hero;
        let pattern = null, confidence = 0;
        for (const k in s) if (s[k] > confidence) { pattern = k; confidence = s[k]; }

        // ---------- skeleton: widest layout container inside ----------------
        const skeleton = (() => {
          let host = el;
          // descend through single-child wrappers to the real layout node
          let guard = 0;
          while (guard++ < 6) {
            const kids = Array.from(host.children).filter(vis);
            if (kids.length === 1) { host = kids[0]; continue; }
            break;
          }
          const cs = getComputedStyle(host);
          const o = { display: cs.display };
          for (const [k, p] of [['gridCols', 'grid-template-columns'], ['gap', 'gap'],
            ['maxWidth', 'max-width'], ['padding', 'padding'], ['flexDirection', 'flex-direction'],
            ['alignItems', 'align-items'], ['justifyContent', 'justify-content']]) {
            const v = cs.getPropertyValue(p);
            if (v && v !== 'none' && v !== 'normal' && v !== '0px') o[k] = v;
          }
          return o;
        })();

        // ---------- atom evidence for composition recipe --------------------
        const tokenCount = {};
        for (const n of el.querySelectorAll('a,button,[role="button"],input,select,[class*="badge"],[class*="card"],[class*="tag"],[class*="pill"]')) {
          if (!vis(n) || inMock(n)) continue;
          const toks = String(n.className && n.className.baseVal !== undefined
            ? n.className.baseVal : n.className || '').split(/\s+/).filter(Boolean);
          const key = n.tagName.toLowerCase() + '[' + toks.filter(t => !/[[:]/.test(t)).slice(0, 4).join(' ') + ']';
          tokenCount[key] = (tokenCount[key] || 0) + 1;
        }
        const atomEvidence = Object.entries(tokenCount)
          .sort((a, b) => b[1] - a[1]).slice(0, 12)
          .map(([k, n]) => k + ' x' + n);

        scored.push({
          pattern: pattern || 'unknown',
          confidence: Math.round(confidence * 100) / 100,
          needsSmart: confidence < 0.5,
          order: box.y,
          sel: selectorOf(el),
          bbox: [box.x, box.y, box.w, box.h],
          heading, skeleton, atomEvidence,
          signals: { ctas: ctas.length, currencyHits, tierListHits, details, cols: rowInfo.cols,
                     smallImgs: smallImgs.length, digitRatio: Math.round(digitRatio * 100) / 100,
                     textLen: text.length },
        });
      } catch (e) { out.notes.push('candidate failed: ' + e.message); }
    }
    scored.sort((a, b) => a.order - b.order);
    scored.forEach((sc, i) => { sc.order = i; });
    out.sections = scored;
    return out;
  });
}
