// extract-components.js — stage-3 component sweep for `playwright-cli run-code`.
//
// Two merged candidate
// channels — (A) semantic tags/roles/class-regex with geometry guards, catching
// singletons like nav and hero CTAs; (B) structural fingerprinting of [class]
// elements, catching unnamed repeated components — plus styling-regime detection
// (tailwind density, hashed classes, library fingerprints).
//
// Usage (run once per sampled page):
//   playwright-cli -s=dsys run-code "$(cat scripts/extract-components.js)" \
//     | bash scripts/slice-result.sh > candidates-home.json
//
// Returns ONE compact JSON object:
//   { page, viewport, regime, candidates: [...], groupsTotal, notes }
//
// Every candidate: { kind, ch (A|B|AB), hash, sel, page, text, bbox, score,
//   hints, slots, vec, raw }. `vec` is the ~17-dim numeric style vector used for
// clustering; `raw` keeps the human-readable style values for curation/distill.
//
// F1 lessons baked in: word-boundary class matching, component-ness scoring,
// mock/demo container disqualification, top-N per kind (never max-area winner).
// Every section is wrapped so a single failure returns partial data, never throws.

async (page) => {
  return await page.evaluate(() => {
    const out = {
      page: location.pathname || '/',
      viewport: { w: innerWidth, h: innerHeight },
      regime: {}, candidates: [], groupsTotal: 0, notes: [],
    };
    const CAPS = { button: 30, card: 20, defaultKind: 12, groupMembers: 8, groups: 40 };

    // ---------- helpers ---------------------------------------------------
    const vis = (el) => {
      try {
        const s = getComputedStyle(el); const r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden'
          && parseFloat(s.opacity || '1') > 0 && r.width > 1 && r.height > 1;
      } catch (_) { return false; }
    };
    const tokensOf = (el) => String(el.className && el.className.baseVal !== undefined
      ? el.className.baseVal : el.className || '')
      .split(/[\s_-]+/).filter(Boolean).map(t => t.toLowerCase());
    const inMock = (el) => !!el.closest(
      '[class*="mock"],[class*="demo"],[class*="preview"],[class*="screenshot"],[class*="example"],[class*="carbon"],[class*="chrome"],[class*="browser"],[class*="terminal"],[class*="showcase"],[class*="animation"],[aria-hidden="true"]');
    const fingerprint = (el) => el.tagName.toLowerCase() + ':'
      + Array.from(el.children).slice(0, 4).map(c => c.tagName.toLowerCase()).join(',');
    const selectorOf = (el) => {
      try {
        if (el.id) return '#' + CSS.escape(el.id);
        const parts = [];
        let cur = el;
        for (let i = 0; i < 5 && cur && cur !== document.body; i++) {
          const tag = cur.tagName.toLowerCase();
          const sibs = cur.parentElement
            ? Array.from(cur.parentElement.children).filter(c => c.tagName === cur.tagName) : [];
          parts.unshift(sibs.length > 1
            ? tag + ':nth-of-type(' + (sibs.indexOf(cur) + 1) + ')' : tag);
          if (cur.parentElement && cur.parentElement.id) {
            parts.unshift('#' + CSS.escape(cur.parentElement.id));
            return parts.join(' > ').slice(0, 160);
          }
          cur = cur.parentElement;
        }
        return ('body > ' + parts.join(' > ')).slice(0, 160);
      } catch (_) { return ''; }
    };
    const parseColor = (v) => { // -> [r,g,b,a] 0-255 / 0-1, best effort
      const m = /rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\)/.exec(v || '');
      if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
      if (v === 'transparent' || /rgba?\(.*,\s*0\)/.test(v || '')) return [0, 0, 0, 0];
      return null;
    };
    const px = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

    const RAWPROPS = ['backgroundColor', 'color', 'borderColor', 'borderWidth', 'borderStyle',
      'borderRadius', 'padding', 'fontSize', 'fontWeight', 'fontFamily', 'display',
      'boxShadow', 'gap', 'textTransform', 'letterSpacing', 'transitionProperty',
      'transitionDuration'];
    const readRaw = (s, r) => {
      const o = {};
      for (const p of RAWPROPS) { const v = s[p]; if (v && v !== 'none' && v !== 'normal' && v !== '0s') o[p] = v.slice(0, 90); }
      if (o.fontFamily) o.fontFamily = o.fontFamily.split(',')[0].replace(/"/g, '');
      // pill radii come back as huge calc values (e.g. 33554400px) — normalize
      if (o.borderRadius && r && r.height > 0 && px(o.borderRadius) >= r.height / 2) o.borderRadius = '9999px';
      return o;
    };
    // ~17-dim numeric style vector, each dim pre-scaled to ~0..1
    const readVec = (s) => {
      const bg = parseColor(s.backgroundColor) || [0, 0, 0, 0];
      const fg = parseColor(s.color) || [0, 0, 0, 1];
      const bc = parseColor(s.borderColor) || [0, 0, 0, 0];
      const rad = Math.min(px(s.borderRadius), 32) / 32; // 9999px pills clamp to 1
      return [
        bg[0] / 255, bg[1] / 255, bg[2] / 255, bg[3],
        fg[0] / 255, fg[1] / 255, fg[2] / 255,
        bc[0] / 255, bc[1] / 255, bc[2] / 255, Math.min(px(s.borderWidth), 4) / 4,
        rad,
        Math.min(px(s.fontSize), 48) / 48, Math.min(px(s.fontWeight) || 400, 900) / 900,
        Math.min(px(s.paddingLeft), 48) / 48, Math.min(px(s.paddingTop), 48) / 48,
        (s.boxShadow && s.boxShadow !== 'none') ? 1 : 0,
      ].map(n => Math.round(n * 1000) / 1000);
    };
    const HINT_RE = /^(primary|secondary|tertiary|ghost|outline|outlined|solid|soft|subtle|link|text|contained|destructive|danger|error|success|warning|info|accent|brand|inverse|dark|light|xs|sm|small|md|medium|lg|large|xl|icon)$/;
    const hintsOf = (el) => {
      const h = tokensOf(el).filter(t => HINT_RE.test(t));
      return h.length ? Array.from(new Set(h)).slice(0, 5) : undefined;
    };
    const slotsOf = (el, r) => {
      const s = {};
      try {
        const icon = el.querySelector('svg, img, i[class*="icon"], span[class*="icon"]');
        if (icon) {
          const ir = icon.getBoundingClientRect();
          if (ir.width > 0 && ir.width <= 40) s.icon = 1;
          if (ir.width > 100) s.media = 1;
        }
        const t = (el.textContent || '').trim();
        if (t) s.label = 1;
        if (el.querySelector('h1,h2,h3,h4')) s.heading = 1;
        if (el.querySelector('p') && r.width > 150) s.body = 1;
        s.kids = el.children.length;
      } catch (_) { }
      return s;
    };
    const INTERACTIVE_KINDS = ['button', 'icon-button', 'tab', 'checkbox', 'select'];
    const scoreOf = (el, kind, r, s, parentBg) => {
      if (inMock(el)) return -99;
      let score = 0;
      const tag = el.tagName.toLowerCase();
      const trulyInteractive = tag === 'button' || (tag === 'a' && el.href)
        || el.getAttribute('role') === 'button' || el.hasAttribute('tabindex')
        || ['input', 'select', 'textarea'].includes(tag);
      if (trulyInteractive) score += 2;
      // fake-interactive: class said "button" but nothing about the element is
      // clickable — the signature of DOM-built product demos (F1 redux)
      if (INTERACTIVE_KINDS.includes(kind) && !trulyInteractive) score -= 2;
      if (px(s.fontSize) > 0 && px(s.fontSize) < 10) score -= 2; // miniature mock UI
      const t = (el.textContent || '').trim();
      if (t && t.length <= 40 && !el.querySelector('p, h1, h2, h3') && !t.includes('\n')) score += 1;
      const bg = parseColor(s.backgroundColor);
      if (bg && bg[3] > 0 && s.backgroundColor !== parentBg) score += 1;
      if (s.borderRadius !== '0px' || (s.boxShadow && s.boxShadow !== 'none')) score += 0.5;
      if (r.top > innerHeight * 6) score -= 0.5; // far below fold: weaker evidence
      return score;
    };

    // ---------- 1. styling-regime detection --------------------------------
    try {
      const UTIL_RE = /^(flex|grid|block|inline|hidden|relative|absolute|fixed|sticky|top|bottom|left|right|z|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|w|h|min|max|size|text|font|leading|tracking|bg|border|rounded|shadow|ring|gap|space|items|justify|self|place|col|row|order|overflow|opacity|transition|duration|delay|ease|scale|rotate|translate|cursor|select|pointer|whitespace|break|truncate|object|aspect|basis|grow|shrink|divide|outline|decoration|underline|uppercase|lowercase|capitalize|antialiased|sr|not|group|peer|dark|hover|focus|active|disabled|first|last|odd|even|sm|md|lg|xl|2xl)$/;
      let total = 0, util = 0, hashed = 0;
      const els = Array.from(document.querySelectorAll('[class]')).slice(0, 600);
      for (const el of els) {
        const cls = String(el.className && el.className.baseVal !== undefined
          ? el.className.baseVal : el.className || '').split(/\s+/).filter(Boolean);
        for (const c of cls) {
          total++;
          const head = c.split(':').pop().split('-')[0].replace(/^!/, '');
          if (UTIL_RE.test(head) || /^-?[a-z]+-\[/.test(c)) util++;
          if (/^css-[a-z0-9]{4,}$/i.test(c) || /^sc-[a-zA-Z]+/.test(c) || /[a-zA-Z]__[a-zA-Z0-9]+_[a-z0-9]{4,}/.test(c)) hashed++;
        }
      }
      out.regime = {
        classTokens: total,
        tailwindDensity: total ? Math.round((util / total) * 1000) / 1000 : 0,
        hashedShare: total ? Math.round((hashed / total) * 1000) / 1000 : 0,
        mui: !!document.querySelector('[class*="Mui"]'),
        radix: !!document.querySelector('[data-radix-popper-content-wrapper],[data-radix-collection-item]'),
        chakra: !!document.querySelector('[class^="chakra-"],[class*=" chakra-"]'),
        antd: !!document.querySelector('[class*="ant-"]'),
      };
    } catch (e) { out.notes.push('regime: ' + e.message); }

    // ---------- 2. channel A — semantic sweep -------------------------------
    // kind -> [selector, classRegex (word tokens), geometry guard]
    const KINDS = {
      button: { sel: 'button, a[href], [role="button"], input[type="submit"]', cls: /^(btn|button|cta)$/, needCls: ['a'], g: (r) => r.width >= 24 && r.width <= 600 && r.height >= 18 && r.height <= 120 },
      'icon-button': { sel: 'button, [role="button"]', g: (r) => r.width <= 64 && r.height <= 64, extra: (el) => !((el.textContent || '').trim()) && !!el.querySelector('svg, img') },
      input: { sel: 'input:not([type="hidden"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]), textarea', g: (r) => r.width <= 700 },
      select: { sel: 'select, [role="combobox"], [role="listbox"]', g: (r) => r.width <= 700 },
      checkbox: { sel: 'input[type="checkbox"], input[type="radio"], [role="switch"], [role="checkbox"]', g: () => true },
      nav: { sel: 'nav, [role="navigation"]', g: (r) => r.width >= 100 },
      header: { sel: 'body > header, [role="banner"]', g: (r) => r.width >= innerWidth * 0.5 },
      footer: { sel: 'footer, [role="contentinfo"]', g: (r) => r.width >= innerWidth * 0.5 },
      card: { sel: 'article, li, div, a[href]', cls: /^(card|tile|panel|box)$/, needCls: ['div', 'a', 'li', 'article'], g: (r) => r.width >= 150 && r.width <= 900 && r.height >= 80 },
      badge: { sel: 'span, div, a[href]', cls: /^(badge|chip|pill|tag|label)$/, needCls: ['span', 'div', 'a'], g: (r) => r.width <= 300 && r.height <= 60 },
      avatar: { sel: 'img, span, div', cls: /^(avatar)$/, needCls: ['img', 'span', 'div'], g: (r) => r.width <= 120 && Math.abs(r.width - r.height) < 12 },
      alert: { sel: '[role="alert"], [role="status"], [class*="alert"], [class*="toast"], [class*="banner"]', g: (r) => r.width >= 200 },
      dialog: { sel: 'dialog, [role="dialog"], [aria-modal="true"]', g: () => true },
      tab: { sel: '[role="tab"]', g: () => true },
      tablist: { sel: '[role="tablist"]', g: () => true },
      menu: { sel: '[role="menu"], [role="menubar"]', g: () => true },
      accordion: { sel: 'details, [data-state][data-orientation]', g: (r) => r.width >= 150 },
      table: { sel: 'table, [role="table"], [role="grid"]', g: (r) => r.width >= 200 },
      form: { sel: 'form', g: (r) => r.width >= 150 && r.height >= 60 },
      tooltip: { sel: '[role="tooltip"]', g: () => true },
    };
    const seen = new WeakMap(); // el -> candidate index
    const byKind = {};
    const bodyBg = (() => { try { return getComputedStyle(document.body).backgroundColor; } catch (_) { return ''; } })();

    for (const kind in KINDS) {
      const K = KINDS[kind];
      try {
        let els = Array.from(document.querySelectorAll(K.sel));
        els = els.filter((el) => {
          if (!vis(el)) return false;
          const r = el.getBoundingClientRect();
          if (!K.g(r)) return false;
          if (K.extra && !K.extra(el)) return false;
          // class-gated kinds: generic tags only count with a matching class token
          if (K.cls && K.needCls && K.needCls.includes(el.tagName.toLowerCase())) {
            const toks = tokensOf(el);
            const tagOk = el.tagName.toLowerCase() === 'button'
              || el.getAttribute('role') === 'button'
              || (kind === 'button' && el.tagName.toLowerCase() === 'a' && toks.some(t => K.cls.test(t)));
            if (kind === 'button') { if (!tagOk && !toks.some(t => K.cls.test(t))) return false; }
            else if (!toks.some(t => K.cls.test(t))) return false;
          }
          return true;
        });
        if (!els.length) continue;
        const caps = CAPS[kind] || CAPS.defaultKind;
        const scored = [];
        for (const el of els) {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          const parentBg = el.parentElement ? getComputedStyle(el.parentElement).backgroundColor : bodyBg;
          const score = scoreOf(el, kind, r, s, parentBg);
          if (score <= -50) continue;
          scored.push({ el, r, s, score });
        }
        scored.sort((a, b) => b.score - a.score);
        byKind[kind] = scored.length;
        for (const c of scored.slice(0, caps)) {
          const cand = {
            kind, ch: 'A', hash: fingerprint(c.el), sel: selectorOf(c.el),
            text: (c.el.textContent || '').trim().slice(0, 40) || undefined,
            bbox: [Math.round(c.r.x), Math.round(c.r.y), Math.round(c.r.width), Math.round(c.r.height)],
            score: Math.round(c.score * 10) / 10,
            hints: hintsOf(c.el), slots: slotsOf(c.el, c.r),
            vec: readVec(c.s), raw: readRaw(c.s, c.r),
          };
          seen.set(c.el, out.candidates.length);
          out.candidates.push(cand);
        }
      } catch (e) { out.notes.push(kind + ': ' + e.message); }
    }
    out.kindTotals = byKind;

    // ---------- 3. channel B — structural fingerprinting --------------------
    try {
      const groups = new Map();
      const els = Array.from(document.querySelectorAll('[class]'));
      for (const el of els) {
        if (!vis(el) || inMock(el)) continue;
        const r = el.getBoundingClientRect();
        const area = r.width * r.height;
        if (area < 500 || area > innerWidth * innerHeight * 0.5) continue;
        if (el.children.length === 0 || el.children.length > 30) continue;
        const fp = fingerprint(el);
        if (fp.indexOf(':') === fp.length - 1) continue; // no children listed
        if (!groups.has(fp)) groups.set(fp, []);
        groups.get(fp).push({ el, r });
      }
      const repeated = Array.from(groups.entries())
        .filter(([, v]) => v.length >= 2)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, CAPS.groups);
      out.groupsTotal = repeated.length;
      for (const [fp, members] of repeated) {
        for (const m of members.slice(0, CAPS.groupMembers)) {
          if (seen.has(m.el)) { // already a channel-A candidate: mark and count
            out.candidates[seen.get(m.el)].ch = 'AB';
            out.candidates[seen.get(m.el)].groupSize = members.length;
            continue;
          }
          const s = getComputedStyle(m.el);
          const parentBg = m.el.parentElement ? getComputedStyle(m.el.parentElement).backgroundColor : bodyBg;
          out.candidates.push({
            kind: 'unknown', ch: 'B', hash: fp, groupSize: members.length,
            sel: selectorOf(m.el),
            text: (m.el.textContent || '').trim().slice(0, 40) || undefined,
            bbox: [Math.round(m.r.x), Math.round(m.r.y), Math.round(m.r.width), Math.round(m.r.height)],
            score: Math.round(scoreOf(m.el, 'unknown', m.r, s, parentBg) * 10) / 10,
            hints: hintsOf(m.el), slots: slotsOf(m.el, m.r),
            vec: readVec(s), raw: readRaw(s, m.r),
          });
        }
      }
    } catch (e) { out.notes.push('channelB: ' + e.message); }

    return out;
  });
}
