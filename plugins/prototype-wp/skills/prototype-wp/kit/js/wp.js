/* PROTOTYPE KIT — WordPress spine: in-memory store, roles and capabilities,
   version and dependency gating, settings validation / normalisation / save /
   precedence. No DOM here. Throwaway prototype code. Not production. */
(function (global) {
  'use strict';

  /* Filled by configure(). Everything plugin-specific arrives through here. */
  var config = {
    fixtures: null,     // function () -> the initial state object
    roles: {},          // key -> { label, <capability>: true, ... }
    requires: {},       // { wp: '6.5', php: '8.1', plugins: [{key, label, min}] }
    settingFields: {},  // key -> { label, kind, values, def, min, max }
    labels: {}          // key -> { value: 'Display label' }
  };

  function configure(opts) { Object.assign(config, opts); reset(); }

  /* ==================================================================== *
   * Store — in memory, resets to fixtures on reload
   * ==================================================================== */

  var listeners = [];
  var state = {};

  function reset() {
    if (!config.fixtures) throw new Error('wp.js: configure({fixtures}) before use.');
    state = config.fixtures();
    return state;
  }

  function get() { return state; }
  function subscribe(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }
  function emit() { listeners.forEach(function (fn) { fn(state); }); }

  /**
   * Emit at the end of the caller's turn instead of in the middle of it.
   *
   * A store call that emits before it returns renders before the caller has
   * stored the value the call is about to return, so a screen showing a result
   * — "Settings saved.", the list of normalised keys, the count of pruned
   * options — is one render behind and the message only appears the next time
   * something else happens to re-render. Deferring by a microtask keeps it to a
   * single render and puts that render after the assignment.
   */
  var emitQueued = false;
  var defer = (global.Promise
    ? function (fn) { Promise.resolve().then(fn); }
    : function (fn) { setTimeout(fn, 0); });

  function emitSoon() {
    if (emitQueued) return;
    emitQueued = true;
    defer(function () { emitQueued = false; emit(); });
  }

  /* ==================================================================== *
   * Roles and capabilities
   * ==================================================================== */

  function role() { return config.roles[state.env.role] || { label: 'Unknown role' }; }
  function can(cap) { return !!role()[cap]; }
  function roleOptions() {
    return Object.keys(config.roles).map(function (k) { return { value: k, label: config.roles[k].label }; });
  }

  /* ==================================================================== *
   * Versions and dependencies
   * ==================================================================== */

  function cmpVersion(a, b) {
    var x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      var dx = x[i] || 0, dy = y[i] || 0;
      if (dx !== dy) return dx > dy ? 1 : -1;
    }
    return 0;
  }

  /**
   * The environment gate. Returns {satisfied, problems, blocking}.
   *
   * `blocking` excludes the plugin being switched off, because the two are
   * different events: an administrator deactivating the plugin is expected and
   * raises no notice, while a missing dependency or an unmet minimum is
   * unexpected and does. Conflating them produces a prototype that nags the
   * user for doing something deliberate.
   */
  function dependencies() {
    var e = state.env, r = config.requires || {};
    var problems = [];
    var me = r.name || 'This plugin';

    if (e.self && e.self.active === false) {
      problems.push({ code: 'self-inactive', text: me + ' is deactivated.' });
    }
    (r.plugins || []).forEach(function (p) {
      var inst = (e.plugins || {})[p.key];
      if (!inst || !inst.active) {
        problems.push({ code: p.key + '-missing',
          text: me + ' requires ' + p.label + ' to be installed and active.' });
      } else if (p.min && cmpVersion(inst.version, p.min) < 0) {
        problems.push({ code: p.key + '-version',
          text: me + ' requires ' + p.label + ' ' + p.min + ' or later. This site runs ' + p.label + ' ' + inst.version + '.' });
      }
    });
    if (r.wp && cmpVersion(e.wpVersion, r.wp) < 0) {
      problems.push({ code: 'wp-version',
        text: me + ' requires WordPress ' + r.wp + ' or later. This site runs WordPress ' + e.wpVersion + '.' });
    }
    if (r.php && cmpVersion(e.phpVersion, r.php) < 0) {
      problems.push({ code: 'php-version',
        text: me + ' requires PHP ' + r.php + ' or later. This server runs PHP ' + e.phpVersion + '.' });
    }

    return {
      satisfied: problems.length === 0,
      problems: problems,
      blocking: problems.filter(function (p) { return p.code !== 'self-inactive'; })
    };
  }

  /* Native visibility rules for a post-like record. A private post is readable
     by `read_private_posts`, which is the capability core checks — `edit_posts`
     is a different question and a different set of roles. */
  function isPubliclyViewable(post, readCap) {
    if (!post) return false;
    if (post.status === 'publish') return true;
    if (post.status === 'private') return can(readCap || 'read_private_posts');
    return false;
  }

  /* ==================================================================== *
   * Settings
   * ==================================================================== */

  function labelFor(key, value) {
    var map = config.labels[key];
    if (map && map[value] !== undefined) return map[value];
    return String(value);
  }

  function parseRatio(raw) {
    var m = String(raw == null ? '' : raw).trim().match(/^(\d*\.?\d+)\s*:\s*(\d*\.?\d+)$/);
    if (!m) return null;
    var w = parseFloat(m[1]), h = parseFloat(m[2]);
    if (!(w > 0) || !(h > 0)) return null;
    return { w: w, h: h };
  }

  /**
   * Validate one field against its declared kind.
   * Returns {ok:true, value} or {ok:false, message}.
   *
   * Messages name the accepted shape rather than restating the rejection,
   * because that is what the settings screen shows beside the field.
   */
  function validateField(key, raw) {
    var f = config.settingFields[key];
    if (!f) return { ok: false, message: 'Unknown setting.' };
    if (typeof f.validate === 'function') return f.validate(raw, f);

    var v = typeof raw === 'string' ? raw.trim() : raw;

    switch (f.kind) {
      case 'enum':
        if (f.values.indexOf(v) === -1) {
          return { ok: false, message: 'Choose one of: ' + f.values.map(function (x) { return labelFor(key, x); }).join(', ') + '.' };
        }
        return { ok: true, value: v };

      case 'bool':
        if (typeof v === 'boolean') return { ok: true, value: v };
        if (v === 'true' || v === 'false') return { ok: true, value: v === 'true' };
        return { ok: false, message: 'Expected a yes or no value.' };

      case 'int':
        if (v === '' || v === null || v === undefined) return { ok: false, message: 'Enter a whole number' + range(f) + '.' };
        if (!/^-?\d+$/.test(String(v))) {
          return { ok: false, message: 'Enter a whole number' + range(f) + '. Decimals, text and empty values are not accepted.' };
        }
        return bounded(parseInt(v, 10), f);

      case 'float':
        if (v === '' || v === null || isNaN(parseFloat(v))) return { ok: false, message: 'Enter a number' + range(f) + '.' };
        return bounded(parseFloat(v), f);

      case 'ratio':
        if (!parseRatio(v)) return { ok: false, message: 'Use a positive W:H ratio, for example 1:1, 4:3 or 3:4.' };
        return { ok: true, value: String(v).replace(/\s+/g, '') };

      case 'text':
        if (f.required && !String(v || '').length) return { ok: false, message: 'This field cannot be empty.' };
        return { ok: true, value: String(v == null ? '' : v) };

      default:
        return { ok: false, message: 'Unsupported setting kind: ' + f.kind + '.' };
    }
  }

  function range(f) {
    if (f.min !== undefined && f.max !== undefined) return ' between ' + f.min + ' and ' + f.max;
    if (f.min !== undefined) return ' greater than ' + (f.exclusiveMin ? f.min : 'or equal to ' + f.min);
    if (f.max !== undefined) return ' no greater than ' + f.max;
    return '';
  }

  function bounded(n, f) {
    if (f.min !== undefined) {
      if (f.exclusiveMin ? !(n > f.min) : !(n >= f.min)) return { ok: false, message: 'Enter a number' + range(f) + '.' };
    }
    if (f.max !== undefined && n > f.max) return { ok: false, message: 'Enter a number' + range(f) + '.' };
    return { ok: true, value: n };
  }

  /**
   * Normalise stored values.
   *
   * A value written by an older version that no longer exists resolves to the
   * specified default and is reported, so the screen can say what happened
   * rather than silently showing a default the user never chose.
   */
  function normaliseSettings(raw) {
    var out = {}, normalised = [];
    Object.keys(config.settingFields).forEach(function (key) {
      var r = validateField(key, (raw || {})[key]);
      if (r.ok) out[key] = r.value;
      else { out[key] = config.settingFields[key].def; normalised.push(key); }
    });
    return { values: out, normalised: normalised };
  }

  /**
   * Save a settings screen.
   *
   * Three behaviours that look like details and are not — each one is a rule a
   * spec usually states and an implementation usually loses:
   *
   *   1. a rejected field keeps its last valid stored value;
   *   2. valid siblings on the same screen still save;
   *   3. obsolete option keys are pruned only on a clean save — pruning on the
   *      failure path means the message announcing it can never appear in the
   *      flow that is supposed to demonstrate it.
   *
   * The fourth rule of the set — unrecognised stored values normalising to the
   * default and being reported — is normaliseSettings(), which this function
   * never calls; it is reached through effectiveSettings().
   *
   * The store change is applied synchronously; the notification is deferred to
   * the end of the caller's turn (see emitSoon) so the render that follows can
   * see the result this call returns. A caller that renders for itself is
   * unaffected — the emit coalesces into one render either way.
   */
  function saveSettings(input, opts) {
    opts = opts || {};
    /* A denied save notifies too. Returning without an emit leaves the screen
       exactly as it was, so a role that cannot save appears to have saved. */
    if (opts.cap && !can(opts.cap)) { emitSoon(); return { ok: false, denied: true, errors: {} }; }

    var errors = {};
    var next = Object.assign({}, state.settings);

    Object.keys(config.settingFields).forEach(function (key) {
      if (!(key in input)) return;
      var r = validateField(key, input[key]);
      if (r.ok) next[key] = r.value;    // valid values are stored
      else errors[key] = r.message;     // invalid values leave the stored value alone
    });

    state.settings = next;
    var ok = Object.keys(errors).length === 0;

    var pruned = 0;
    if (ok && state.obsoleteOptions && state.obsoleteOptions.length) {
      pruned = state.obsoleteOptions.length;
      state.obsoleteOptions = [];
    }

    emitSoon();
    return { ok: ok, errors: errors, saved: next, pruned: pruned };
  }

  /**
   * Resolve effective values across precedence layers.
   *
   * layers is ordered most-specific first, e.g.
   *   effectiveSettings([{name: 'post', values: overrides}])
   * An empty string, null or undefined means "not set at this layer" and falls
   * through. A value that is set but invalid also falls through, so a bad
   * override degrades to the layer below instead of breaking the screen.
   *
   * Returns {values, source} — source names the layer each value came from,
   * which is what lets a prototype prove precedence rather than assert it.
   */
  function effectiveSettings(layers) {
    var base = normaliseSettings(state.settings).values;
    var out = {}, source = {};

    Object.keys(config.settingFields).forEach(function (key) {
      var resolved = false;
      (layers || []).forEach(function (layer) {
        if (resolved) return;
        var raw = (layer.values || {})[key];
        if (raw === '' || raw === null || raw === undefined) return;
        var v = validateField(key, raw);
        if (v.ok) { out[key] = v.value; source[key] = layer.name; resolved = true; }
      });
      if (!resolved) { out[key] = base[key]; source[key] = 'global'; }
    });

    return { values: out, source: source };
  }

  global.WP = {
    configure: configure, config: config,
    get: get, reset: reset, subscribe: subscribe, emit: emit, emitSoon: emitSoon,
    role: role, can: can, roleOptions: roleOptions,
    cmpVersion: cmpVersion, dependencies: dependencies, isPubliclyViewable: isPubliclyViewable,
    labelFor: labelFor, parseRatio: parseRatio,
    validateField: validateField, normaliseSettings: normaliseSettings,
    saveSettings: saveSettings, effectiveSettings: effectiveSettings
  };
})(window);
