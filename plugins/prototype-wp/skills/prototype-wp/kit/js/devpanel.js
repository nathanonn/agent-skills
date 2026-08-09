/* PROTOTYPE KIT — the driver panel. Drives environment, role and failure
   conditions that a healthy install cannot produce on demand.
   NOT part of the simulated plugin. Throwaway prototype code. Not production. */
(function (global) {
  'use strict';

  var h = UI.h;

  var config = {
    caption: 'These switches are not part of the plugin. They drive the environment, ' +
             'role and failure conditions the specification describes.',
    environment: [],   // [{type:'check'|'select'|'note', label, get, set, def, options, text}]
    role: null,        // {def, note} — rendered from WP.roleOptions()
    simulations: [],   // [{key, label, note, onToggle}]
    onReset: null,     // extra teardown before the store resets
    onClear: null
  };

  var open = false;
  var mounted = null;   // {mode, root, update} — the panel currently in the DOM

  function configure(opts) { Object.assign(config, opts); }

  function apply() { WP.emit(); }

  /* ------------------------------------------------------------- counting */

  /**
   * How many conditions are away from a healthy default.
   *
   * The collapsed pill shows this number. Without it, a prototype left with a
   * simulation switched on looks like a prototype with a bug — the count is
   * what makes "this is being driven" visible before the panel is opened.
   *
   * The role counts too. A prototype left acting as a subscriber gates every
   * screen it has, which reads as broken navigation; a count of zero beside
   * that is worse than no count at all.
   */
  function activeCount() {
    var st = WP.get();
    var n = 0;
    config.environment.forEach(function (c) {
      if (c.type === 'note' || c.def === undefined) return;
      if (c.get() !== c.def) n++;
    });
    if (config.role && defaultRole() && st.env.role !== defaultRole()) n++;
    config.simulations.forEach(function (s) { if (st.sim[s.key]) n++; });
    return n;
  }

  /* Falls back to the first declared role, which is the most privileged one by
     convention — a prototype whose roles are listed least-privileged-first
     should set `def` explicitly. */
  function defaultRole() {
    if (config.role && config.role.def) return config.role.def;
    var keys = Object.keys(WP.config.roles || {});
    return keys.length ? keys[0] : null;
  }

  /* ------------------------------------------------------------ rendering */

  /**
   * Render the panel, updating in place whenever it is already mounted.
   *
   * The panel re-renders after every route render, so rebuilding it wholesale
   * meant every toggle replaced the control that was just operated: focus fell
   * back to <body>, a keyboard user lost their place at the bottom of the
   * document, and an automated driver was left holding a detached node. Only a
   * change of shape — collapsed to expanded — rebuilds.
   */
  function render() {
    var host = document.getElementById('driver-panel');
    if (!host) throw new Error('devpanel.js: no #driver-panel in the document.');

    var mode = open ? 'panel' : 'toggle';
    if (mounted && mounted.mode === mode && mounted.root.parentNode === host) {
      mounted.update();
      return;
    }

    UI.clear(host);
    mounted = open ? buildPanel() : buildToggle();
    host.appendChild(mounted.root);
  }

  function buildToggle() {
    var dot = h('span.dot');
    var count = h('span');
    var root = h('button.driver-toggle', {
      type: 'button', onclick: function () { open = true; render(); }
    }, dot, 'Prototype controls', count);

    function update() {
      var n = activeCount();
      dot.className = 'dot' + (n ? ' warn' : '');
      count.textContent = n ? '(' + n + ')' : '';
    }
    update();
    return { mode: 'toggle', root: root, update: update };
  }

  function buildPanel() {
    var updaters = [];
    idSeq = 0;
    var root = h('div.driver-panel',
      h('div.driver-head',
        h('strong', 'Prototype controls'),
        h('button', { type: 'button', title: 'Collapse', onclick: function () { open = false; render(); } }, '✕')),
      h('p.driver-note', { style: { padding: '10px 14px 0', margin: 0 } }, config.caption),
      envGroup(updaters),
      roleGroup(updaters),
      simGroup(updaters),
      buttons());

    function update() { updaters.forEach(function (f) { f(); }); }
    update();
    return { mode: 'panel', root: root, update: update };
  }

  /* Ids are the label slugged, then numbered. 'dp-' + label with the non-word
     characters stripped collides for two labels differing only in punctuation:
     one id on two inputs, and the second <label for> toggles the first
     checkbox. The counter resets per build, so ids are stable across renders. */
  var idSeq = 0;
  function domId(label) {
    var slug = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return 'dp-' + (slug || 'control') + '-' + (++idSeq);
  }

  function row(label, control) {
    var id = control.id || (control.id = domId(label));
    return h('div.driver-row', h('label', { for: id }, label), control);
  }

  function check(label, get, onchange, updaters) {
    var id = domId(label);
    var input = h('input', {
      type: 'checkbox', id: id, checked: !!get(),
      onchange: function (e) { onchange(e.target.checked); }
    });
    updaters.push(function () { input.checked = !!get(); });
    return h('div.driver-row', h('label', { for: id }, label), input);
  }

  function envGroup(updaters) {
    if (!config.environment.length) return null;
    var g = h('div.driver-group', h('h4', 'Environment'));
    config.environment.forEach(function (c) {
      if (c.type === 'note') { g.appendChild(h('p.driver-note', c.text)); return; }
      if (c.type === 'select') {
        var sel = UI.select({
          value: c.get(),
          options: (c.options || []).map(function (v) {
            return typeof v === 'object' ? v : { value: v, label: String(v) };
          }),
          onchange: function (e) { c.set(e.target.value); apply(); }
        });
        updaters.push(function () { sel.value = c.get(); });
        g.appendChild(row(c.label, sel));
        return;
      }
      g.appendChild(check(c.label, c.get, function (v) { c.set(v); apply(); }, updaters));
    });
    return g;
  }

  function roleGroup(updaters) {
    if (!config.role) return null;
    var sel = UI.select({
      value: WP.get().env.role,
      options: WP.roleOptions(),
      onchange: function (e) { WP.get().env.role = e.target.value; apply(); }
    });
    updaters.push(function () { sel.value = WP.get().env.role; });
    return h('div.driver-group', h('h4', 'Acting as'),
      row('Role', sel),
      config.role.note ? h('p.driver-note', config.role.note) : null);
  }

  function simGroup(updaters) {
    if (!config.simulations.length) return null;
    var g = h('div.driver-group', h('h4', 'Simulate'));
    config.simulations.forEach(function (s) {
      g.appendChild(check(s.label, function () { return !!WP.get().sim[s.key]; },
        function (v) { toggle(s, v); }, updaters));
      if (s.note) g.appendChild(h('p.driver-note', s.note));
    });
    return g;
  }

  /**
   * Toggle one simulation.
   *
   * `onToggle` exists for conditions that need to mutate the store to be real —
   * writing stale option values, removing a record. A simulation that only sets
   * a flag the UI reads to print an error message is a hard-coded symptom, not
   * a simulated condition, and proves nothing about the rule it is meant to
   * exercise.
   */
  function toggle(sim, on) {
    var st = WP.get();
    st.sim[sim.key] = on;
    if (sim.onToggle) sim.onToggle(on, st);
    apply();
  }

  function buttons() {
    return h('div.driver-buttons',
      h('button.driver-btn', {
        type: 'button',
        onclick: function () {
          if (config.onReset) config.onReset();
          WP.reset();
          open = true;
          /* force() renders directly when the hash is unchanged, so a second
             render() here would be a duplicate, not a safety net. */
          Router.force(Router.parse().hash);
        }
      }, 'Reset prototype data'),
      h('button.driver-btn', {
        type: 'button',
        onclick: function () {
          var st = WP.get();
          config.simulations.forEach(function (s) {
            if (st.sim[s.key]) { st.sim[s.key] = false; if (s.onToggle) s.onToggle(false, st); }
          });
          config.environment.forEach(function (c) {
            if (c.type !== 'note' && c.def !== undefined) c.set(c.def);
          });
          if (config.role && defaultRole()) st.env.role = defaultRole();
          if (config.onClear) config.onClear();
          apply();
        }
      }, 'Clear all simulations'));
  }

  global.Driver = { configure: configure, render: render, activeCount: activeCount };
})(window);
