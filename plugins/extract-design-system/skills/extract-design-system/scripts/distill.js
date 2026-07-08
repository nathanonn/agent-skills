// distill.js — stage-5/6 component distillation for `playwright-cli run-code`.
//
// Per curated component: simplified HTML (<=12 descendants, placeholder media),
// default-diffed computed CSS per kept node (ladder-3, always works), CDP
// authored rules for the root (ladder-1, ground truth incl. :hover/@media),
// and CDP-forced hover/focus state diffs + transition (stage 6, D4 scope).
//
// The skill substitutes the "COMPONENTS placeholder" (double-underscore token
// used once, below in the code) with a JSON array before invocation:
//   [{ "name": "button--primary", "sel": "#site-header ... a", "expectText": "Download" }]
// Run once per page (only that page's components in the array). Compose with
// node: fs.readFile both, tpl.replace(token, json), write a run script, then
//   playwright-cli -s=dsys run-code "$(cat distill-run.js)" | bash slice-result.sh
//
// Every component is independently try/caught: one failure -> {name, error},
// never a thrown run.

async (page) => {
  const COMPONENTS = __COMPONENTS__;
  const results = [];

  let client = null;
  try {
    client = await page.context().newCDPSession(page);
    await client.send('DOM.enable');
    await client.send('CSS.enable');
  } catch (e) { /* CDP unavailable -> ladder 2/3 only */ }

  for (const comp of COMPONENTS) {
    const out = { name: comp.name, sel: comp.sel };
    try {
      // ---- 1. in-page: resolve, simplify, default-diffed computed CSS ------
      const data = await page.evaluate((c) => {
        const res = { notes: [] };
        let el = null;
        try { el = document.querySelector(c.sel); } catch (_) { }
        // brittle-selector fallback: re-find by expected text among same tag
        if ((!el || (c.expectText && !(el.textContent || '').trim().startsWith(c.expectText)))
          && c.expectText) {
          const tag = (c.sel.match(/([a-z0-9]+)(?::nth[^ >]*)?$/i) || [])[1] || '*';
          el = Array.from(document.querySelectorAll(tag)).find((e) => {
            const t = (e.textContent || '').trim();
            return t.startsWith(c.expectText) && e.getClientRects().length;
          }) || el;
          if (el) res.notes.push('resolved by text fallback');
        }
        if (!el) return { error: 'not found' };
        el.setAttribute('data-dsys', c.name);

        // -- style capture helpers --
        const WHITELIST = ['display', 'flex-direction', 'align-items', 'justify-content',
          'gap', 'padding', 'margin', 'background-color', 'background-image', 'color',
          'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
          'text-transform', 'text-decoration-line', 'white-space', 'border', 'border-radius',
          'box-shadow', 'opacity', 'cursor', 'transition', 'overflow', 'text-align',
          'width', 'height', 'max-width', 'grid-template-columns', 'position', 'backdrop-filter',
          'appearance', 'clip', 'clip-path', 'list-style-type'];
        const INHERITED = new Set(['color', 'font-family', 'font-size', 'font-weight',
          'line-height', 'letter-spacing', 'text-transform', 'white-space', 'text-align', 'cursor']);
        // defaults iframe (SnappySnippet trick): unstyled doc for per-tag defaults
        const fr = document.createElement('iframe');
        fr.style.cssText = 'position:absolute;left:-9999px;width:100px;height:100px';
        document.body.appendChild(fr);
        fr.contentDocument.write('<body>');
        const defCache = {};
        const defaultsFor = (node) => {
          // probe must carry UA-relevant attributes: <a href> underlines,
          // <input type=radio> renders natively — bare probes miss both
          const tag = node.tagName.toLowerCase();
          const type = node.getAttribute && node.getAttribute('type');
          const href = node.hasAttribute && node.hasAttribute('href');
          const key = tag + '|' + (type || '') + '|' + (href ? 'h' : '');
          if (!defCache[key]) {
            const d = fr.contentDocument.createElement(tag);
            if (type) d.setAttribute('type', type);
            if (href) d.setAttribute('href', '#');
            fr.contentDocument.body.appendChild(d);
            defCache[key] = fr.contentWindow.getComputedStyle(d);
          }
          return defCache[key];
        };
        const sizedOk = (prop, node) => {
          // width/height only for compact fixed things (icons, toggles), never text blocks
          if (prop !== 'width' && prop !== 'height') return true;
          const r = node.getBoundingClientRect();
          return r.width <= 80 && r.height <= 80;
        };
        const styleOf = (node, parentStyle) => {
          const s = getComputedStyle(node);
          const d = defaultsFor(node);
          const o = {};
          for (const p of WHITELIST) {
            const v = s.getPropertyValue(p);
            if (!v || v === '0s') continue;
            if (INHERITED.has(p) && parentStyle && v === parentStyle.getPropertyValue(p)) continue;
            // diff against the unstyled-iframe default — 'none'/'normal' values
            // are only skipped when the UA default already IS that value, so
            // resets like `text-decoration: none` on <a> survive
            const dv = d.getPropertyValue(p);
            if (v === dv) continue;
            if (!sizedOk(p, node)) continue;
            if (p === 'margin' && /^0px( 0px)*$/.test(v)) continue;
            if (p === 'border' && /0px/.test(v.split(' ')[0])) continue;
            o[p] = v;
          }
          // pill normalization
          if (o['border-radius']) {
            const r = node.getBoundingClientRect();
            if (parseFloat(o['border-radius']) >= r.height / 2 && r.height > 0) o['border-radius'] = '9999px';
          }
          return o;
        };

        // -- simplified clone build (breadth-first, budget 12 descendants) --
        const css = {}; // outSelector -> props
        let budget = c.budget || 12, partIdx = 0; // sections pass budget: 40
        const build = (node, outCls, parentComputed, depth) => {
          const tag = node.tagName.toLowerCase();
          if (['script', 'style', 'noscript', 'iframe'].includes(tag)) return '';
          const props = styleOf(node, parentComputed);
          if (Object.keys(props).length) css[outCls.sel] = props;
          let inner = '';
          if (tag === 'img') {
            const r = node.getBoundingClientRect();
            return '<img class="' + outCls.cls + '" alt="" width="' + Math.round(r.width)
              + '" height="' + Math.round(r.height)
              + '" src="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27'
              + Math.round(r.width) + '%27 height=%27' + Math.round(r.height)
              + '%27%3E%3Crect width=%27100%25%27 height=%27100%25%27 fill=%27%23d0cfc9%27/%3E%3C/svg%3E">';
          }
          if (tag === 'svg') {
            const r = node.getBoundingClientRect();
            const nodes = node.querySelectorAll('*').length;
            if (nodes > 20) {
              return '<svg class="' + outCls.cls + '" width="' + Math.round(r.width) + '" height="'
                + Math.round(r.height) + '" viewBox="0 0 ' + Math.round(r.width) + ' ' + Math.round(r.height)
                + '"><rect width="100%" height="100%" fill="currentColor" opacity="0.25"/><!-- svg stub: '
                + nodes + ' nodes --></svg>';
            }
            const cl = node.cloneNode(true);
            cl.removeAttribute('class'); cl.setAttribute('class', outCls.cls);
            for (const a of ['data-dsys']) cl.removeAttribute(a);
            const svgHtml = cl.outerHTML;
            if (svgHtml.length > 1500) { // few nodes but huge path data (logos)
              return '<svg class="' + outCls.cls + '" width="' + Math.round(r.width) + '" height="'
                + Math.round(r.height) + '" viewBox="0 0 ' + Math.round(r.width) + ' ' + Math.round(r.height)
                + '"><rect width="100%" height="100%" fill="currentColor" opacity="0.25"/><!-- svg stub: '
                + svgHtml.length + ' bytes --></svg>';
            }
            return svgHtml;
          }
          const myComputed = getComputedStyle(node);
          for (const child of Array.from(node.childNodes)) {
            if (child.nodeType === 3) {
              const t = child.textContent.replace(/\s+/g, ' ');
              if (t.trim()) inner += t.trim().slice(0, 60);
            } else if (child.nodeType === 1) {
              const cs = getComputedStyle(child);
              if (cs.display === 'none' || cs.visibility === 'hidden') continue;
              if (budget <= 0) { inner += '<!-- trimmed -->'; break; }
              budget--;
              partIdx++;
              const childCls = 'p' + partIdx;
              inner += build(child, { cls: childCls, sel: outCls.rootSel + ' .' + childCls, rootSel: outCls.rootSel },
                myComputed, depth + 1);
            }
          }
          const srcCls = String(node.className && node.className.baseVal !== undefined
            ? node.className.baseVal : node.className || '').slice(0, 200);
          const keepAttrs = ['href', 'type', 'placeholder', 'role', 'aria-expanded', 'aria-checked', 'checked', 'disabled'];
          let attrs = ' class="' + outCls.cls + '"';
          for (const a of keepAttrs) {
            if (node.hasAttribute && node.hasAttribute(a)) {
              const v = a === 'href' ? '#' : node.getAttribute(a);
              attrs += ' ' + a + (v === '' || v === null ? '' : '="' + String(v).replace(/"/g, '&quot;') + '"');
            }
          }
          if (srcCls) attrs += ' data-src-class="' + srcCls.replace(/"/g, '&quot;') + '"';
          const VOID = ['input', 'br', 'hr'];
          if (VOID.includes(tag)) return '<' + tag + attrs + '>';
          return '<' + tag + attrs + '>' + inner + '</' + tag + '>';
        };
        const rootCls = c.name.replace(/[^a-z0-9_-]/gi, '');
        // root gets parentComputed=null: inherited props must be explicit on the
        // root (the snippet has no page parent to inherit from)
        res.html = build(el, { cls: rootCls, sel: '.' + rootCls, rootSel: '.' + rootCls },
          null, 0);
        res.css = css;
        res.text = (el.textContent || '').trim().slice(0, 60);
        const rb = el.getBoundingClientRect();
        res.bbox = [Math.round(rb.x), Math.round(rb.y), Math.round(rb.width), Math.round(rb.height)];
        res.transition = (() => {
          const s = getComputedStyle(el);
          return s.transitionDuration !== '0s'
            ? { property: s.transitionProperty, duration: s.transitionDuration, easing: s.transitionTimingFunction }
            : null;
        })();
        fr.remove();
        return res;
      }, comp);

      if (data.error) { results.push({ name: comp.name, error: data.error }); continue; }
      Object.assign(out, data);

      // ---- 2. CDP: authored rules + forced-state diffs ---------------------
      if (client) {
        try {
          const doc = await client.send('DOM.getDocument', { depth: -1 });
          const node = await client.send('DOM.querySelector',
            { nodeId: doc.root.nodeId, selector: '[data-dsys="' + comp.name + '"]' });
          if (node.nodeId) {
            // authored rules (regular origin only), root element
            try {
              const ms = await client.send('CSS.getMatchedStylesForNode', { nodeId: node.nodeId });
              out.authoredRules = (ms.matchedCSSRules || [])
                .filter((m) => m.rule.origin === 'regular')
                .map((m) => ({
                  selector: (m.rule.selectorList && m.rule.selectorList.text || '').slice(0, 200),
                  css: (m.rule.style && m.rule.style.cssText || '').replace(/\s+/g, ' ').trim().slice(0, 600),
                })).slice(-25); // last = highest specificity wins; keep the tail
              out.pseudoRules = (ms.pseudoElements || []).flatMap((p) =>
                (p.matches || []).filter((m) => m.rule.origin === 'regular').map((m) => ({
                  pseudo: p.pseudoType,
                  selector: (m.rule.selectorList && m.rule.selectorList.text || '').slice(0, 200),
                  css: (m.rule.style && m.rule.style.cssText || '').replace(/\s+/g, ' ').trim().slice(0, 400),
                }))).slice(0, 10);
            } catch (e) { out.notes = (out.notes || []).concat('matchedStyles: ' + e.message); }

            // forced-state diffs on ~11 tracked props
            const TRACKED = ['background-color', 'color', 'border-color', 'box-shadow',
              'outline-width', 'outline-style', 'outline-color', 'outline-offset',
              'text-decoration-line', 'opacity', 'transform', 'filter', 'border-width'];
            const readTracked = () => page.evaluate((args) => {
              const el2 = document.querySelector('[data-dsys="' + args.name + '"]');
              if (!el2) return null;
              const s = getComputedStyle(el2);
              const o = {};
              for (const p of args.props) o[p] = s.getPropertyValue(p);
              return o;
            }, { name: comp.name, props: TRACKED });
            const baseState = await readTracked();
            out.states = {};
            for (const pseudo of [['hover'], ['focus', 'focus-visible']]) {
              try {
                await client.send('CSS.forcePseudoState',
                  { nodeId: node.nodeId, forcedPseudoClasses: pseudo });
                await page.waitForTimeout(80);
                const st = await readTracked();
                const diff = {};
                for (const p in st) if (st[p] !== baseState[p]) diff[p] = st[p];
                out.states[pseudo[0]] = Object.keys(diff).length ? diff : 'no visual change';
              } catch (e) {
                out.states[pseudo[0]] = 'capture failed: ' + e.message;
              }
            }
            await client.send('CSS.forcePseudoState', { nodeId: node.nodeId, forcedPseudoClasses: [] });
          }
        } catch (e) { out.notes = (out.notes || []).concat('cdp: ' + e.message); }
      }
      results.push(out);
    } catch (e) {
      results.push({ name: comp.name, error: e.message });
    }
  }
  return results;
}
