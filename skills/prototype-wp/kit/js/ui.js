/* PROTOTYPE KIT — DOM primitives: hyperscript, form controls, notices, modals.
   Throwaway prototype code. Not production. */
(function (global) {
  'use strict';

  /* A tag selector is a name, then any number of .class / #id tokens.
     Anything else — most commonly a space-separated class list — is a mistake. */
  var TAG = /^([a-zA-Z][a-zA-Z0-9-]*)?((?:[.#][A-Za-z0-9_-]+)*)$/;

  /**
   * h('div.wrap#main', {attrs}, children...)
   *
   * Throws on an unparseable tag rather than falling back to a bare <div>.
   * A silent fallback loses every class in the selector, which renders an
   * element that looks plausible in a screenshot and matches no CSS and no
   * query. That failure is invisible until something measures it.
   */
  function h(tag) {
    var rest = Array.prototype.slice.call(arguments, 1);
    var attrs = (rest[0] && rest[0].constructor === Object && !(rest[0] instanceof Node)) ? rest.shift() : {};
    var m = String(tag).match(TAG);
    if (!m) {
      throw new Error('h(): cannot parse tag "' + tag + '". Use "div.a.b" for classes, ' +
        'or pass {class: "a b"} — a space-separated list inside the tag is not a selector.');
    }
    var el = document.createElement(m[1] || 'div');
    if (m[2]) {
      m[2].split(/(?=[.#])/).forEach(function (tok) {
        if (tok[0] === '.') el.classList.add(tok.slice(1));
        else el.id = tok.slice(1);
      });
    }
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') String(v).split(/\s+/).filter(Boolean).forEach(function (c) { el.classList.add(c); });
      else if (k === 'style' && typeof v === 'object') style(el, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
      else el.setAttribute(k, v);
    });
    append(el, rest);
    return el;
  }

  /**
   * Apply a style object. Custom properties go through setProperty().
   *
   * Object.assign(el.style, {'--size': '96px'}) drops the property silently.
   * Any setting plumbed through a CSS variable then has no effect on anything
   * while the page continues to render a plausible result.
   */
  function style(el, obj) {
    Object.keys(obj).forEach(function (prop) {
      if (prop.slice(0, 2) === '--') el.style.setProperty(prop, obj[prop]);
      else el.style[prop] = obj[prop];
    });
    return el;
  }

  function append(el, children) {
    children.forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) return append(el, c);
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return el;
  }

  function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; }
  function frag() { return document.createDocumentFragment(); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ------------------------------------------------------------ form bits */

  function select(opts) {
    var el = h('select', { onchange: opts.onchange, id: opts.id, 'aria-label': opts.ariaLabel, disabled: !!opts.disabled });
    (opts.options || []).forEach(function (o) {
      el.appendChild(h('option', { value: o.value, selected: String(o.value) === String(opts.value) }, o.label));
    });
    el.value = opts.value;
    if (opts.error) el.classList.add('has-error');
    return el;
  }

  function text(opts) {
    return h('input', {
      type: 'text',
      class: (opts.size || 'regular-text') + (opts.error ? ' has-error' : ''),
      value: opts.value === null || opts.value === undefined ? '' : opts.value,
      placeholder: opts.placeholder,
      disabled: !!opts.disabled,
      oninput: opts.oninput
    });
  }

  function switchControl(opts) {
    var input = h('input', {
      type: 'checkbox', checked: !!opts.checked, disabled: !!opts.disabled,
      onchange: function (e) { opts.onchange && opts.onchange(e.target.checked); }
    });
    return h('label.wp-switch', input, h('span.track'), opts.label ? h('span.switch-label', opts.label) : null);
  }

  /* One row of a .form-table, the standard WordPress settings layout. */
  function field(labelText, control, description) {
    return h('tr',
      h('th', h('label', labelText)),
      h('td', control, description ? h('p.description', description) : null));
  }

  function fieldError(message) { return message ? h('span.field-error', message) : null; }

  /* ------------------------------------------------------------- notices */

  function notice(type, message, opts) {
    opts = opts || {};
    var el = h('div', { class: 'notice notice-' + type + (opts.dismissible === false ? '' : ' is-dismissible') });
    if (typeof message === 'string') el.appendChild(h('p', message));
    else append(el, [message]);
    if (opts.actions) el.appendChild(h('p.kit-flex', opts.actions));
    if (opts.dismissible !== false) {
      el.appendChild(h('button.notice-dismiss', { type: 'button', title: 'Dismiss', onclick: function () { el.remove(); } }, '✕'));
    }
    return el;
  }

  /* --------------------------------------------------------------- modal */

  function modalRoot() {
    var el = document.getElementById('modal-root');
    if (!el) throw new Error('ui.js: no #modal-root in the document — add it to index.html.');
    return el;
  }

  function modal(opts) {
    var body = h('div.wp-modal-body');
    append(body, [opts.body]);

    var footer = h('div.wp-modal-footer');
    if (opts.footerLeft) footer.appendChild(h('div.footer-left', opts.footerLeft));
    (opts.buttons || []).forEach(function (b) {
      footer.appendChild(h('button', {
        class: 'button ' + (b.primary ? 'button-primary' : '') + (b.danger ? ' delete' : ''),
        type: 'button', disabled: !!b.disabled,
        onclick: function () { b.onclick && b.onclick(close); }
      }, b.label));
    });

    var box = h('div.wp-modal' + (opts.small ? '.is-small' : ''),
      h('div.wp-modal-header',
        h('h2', opts.title),
        h('button.wp-modal-close', { type: 'button', 'aria-label': 'Close', onclick: function () { close(); } }, '✕')),
      body,
      (opts.buttons || opts.footerLeft) ? footer : null);

    var backdrop = h('div.wp-modal-backdrop', {
      onclick: function (e) { if (e.target === backdrop && opts.backdropClose !== false) close(); }
    }, box);

    function onKey(e) { if (e.key === 'Escape') close(); }
    function close(result) {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      opts.onClose && opts.onClose(result);
    }

    document.addEventListener('keydown', onKey);
    modalRoot().appendChild(backdrop);
    if (opts.autofocus !== false) {
      var f = box.querySelector('input, select, textarea, button.button-primary');
      if (f) setTimeout(function () { f.focus(); }, 20);
    }
    return { close: close, body: body, box: box };
  }

  /* Destructive actions confirm before acting. */
  function confirm(opts) {
    return modal({
      title: opts.title || 'Are you sure?',
      small: true,
      body: h('div', h('p', opts.message), opts.detail ? h('p.description', opts.detail) : null),
      buttons: [
        { label: opts.cancelLabel || 'Cancel', onclick: function (close) { close(); opts.onCancel && opts.onCancel(); } },
        { label: opts.confirmLabel || 'Confirm', primary: !opts.danger, danger: !!opts.danger,
          onclick: function (close) { close(); opts.onConfirm && opts.onConfirm(); } }
      ]
    });
  }

  /* ---------------------------------------------------------------- icons */
  /* Inline SVG rather than dashicons or emoji, so the chrome renders
     identically on every machine — emoji fall back to tofu on bare systems. */
  var ICONS = {
    dashboard: 'M3 3h7v7H3zM11 3h7v4h-7zM11 8h7v9h-7zM3 11h7v6H3z',
    media: 'M3 4h15v13H3zm2 9l3.5-4 2.5 3 3-3.5L16 15H5z M6.5 7.5a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4z',
    pages: 'M5 2h7l4 4v13H5zM12 2v4h4',
    posts: 'M4 3h12v14H4zm2 3h8M6 9h8M6 12h5',
    products: 'M4 7h13l-1 11H5zM7.5 7a3 3 0 016 0',
    cart: 'M2 5h17v9a2 2 0 01-2 2H8l-4 3v-3H2z',
    plugins: 'M8 2v4H5v6a4 4 0 004 4h2a4 4 0 004-4V6h-3V2h-1v4H9V2z',
    users: 'M10 3a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM3 18c0-3.6 3.1-6 7-6s7 2.4 7 6z',
    tools: 'M13 2a5 5 0 00-4.6 7L2 15.4 4.6 18l6.4-6.4A5 5 0 1013 2z',
    settings: 'M10 6.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm8 3.5l-1.9-.5a6 6 0 00-.6-1.5l1-1.7-1.8-1.8-1.7 1a6 6 0 00-1.5-.6L11 3H9l-.5 1.9a6 6 0 00-1.5.6l-1.7-1L3.5 6.3l1 1.7a6 6 0 00-.6 1.5L2 10v2l1.9.5a6 6 0 00.6 1.5l-1 1.7 1.8 1.8 1.7-1a6 6 0 001.5.6L9 19h2l.5-1.9a6 6 0 001.5-.6l1.7 1 1.8-1.8-1-1.7a6 6 0 00.6-1.5L18 12z'
  };

  function icon(name) {
    var span = h('span.menu-icon');
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICONS[name] || ICONS.dashboard);
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    span.appendChild(svg);
    return span;
  }

  /* ------------------------------------------------ deferred mount queue */
  /* Work that needs the element to be in the document — measuring a box,
     starting an observer, binding pointer capture — runs after the render. */
  var mounts = [];
  function onMount(fn) { mounts.push(fn); }
  function flushMounts() { var m = mounts; mounts = []; m.forEach(function (f) { f(); }); }

  global.UI = {
    h: h, style: style, append: append, clear: clear, frag: frag, $: $, $$: $$,
    select: select, text: text, switchControl: switchControl, field: field, fieldError: fieldError,
    notice: notice, modal: modal, confirm: confirm, icon: icon, ICONS: ICONS,
    onMount: onMount, flushMounts: flushMounts
  };
})(window);
