/* PROTOTYPE KIT — hash router, render loop and unsaved-changes guard.
   Throwaway prototype code. Not production. */
(function (global) {
  'use strict';

  var h = UI.h;

  var routes = {};          // first path segment -> render(route) -> {name, el, ...}
  var fallback = null;      // render for an unmatched path
  var guard = null;         // (nextHash, currentHash) -> boolean
  var beforeRender = null;
  var afterRender = null;
  var appEl = null;
  var currentHash = null;
  var bypassGuard = false;
  var revertTo = null;      // hash the router is putting back after a rejected move

  function configure(opts) {
    opts = opts || {};
    if (opts.app) appEl = document.getElementById(opts.app);
    if (opts.guard) guard = opts.guard;
    if (opts.beforeRender) beforeRender = opts.beforeRender;
    if (opts.afterRender) afterRender = opts.afterRender;
    if (opts.fallback) fallback = opts.fallback;
    Object.keys(opts.routes || {}).forEach(function (k) { routes[k] = opts.routes[k]; });
  }

  /**
   * Parse the hash into {path, parts, query}.
   *
   * Every screen and every meaningful sub-state is addressed here. Deep links
   * are what make the verification loop cheap: a state that can only be reached
   * by clicking through three screens gets checked once; a state with a URL gets
   * checked on every pass.
   */
  function parse() {
    var raw = location.hash.replace(/^#/, '') || defaultPath();
    var qIndex = raw.indexOf('?');
    var path = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
    var query = {};
    if (qIndex >= 0) {
      raw.slice(qIndex + 1).split('&').forEach(function (pair) {
        if (!pair) return;
        var kv = pair.split('=');
        query[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
      });
    }
    return { path: path, parts: path.split('/').filter(Boolean), query: query, hash: '#' + raw };
  }

  var defaultHash = '#/dashboard';
  function setDefault(hash) { defaultHash = hash; }
  function defaultPath() { return defaultHash.replace(/^#/, ''); }

  function render() {
    var route = parse();
    if (beforeRender) beforeRender(route);

    var screen;
    try {
      var fn = routes[route.parts[0]] || fallback;
      screen = fn ? fn(route) : null;
      if (!screen) throw new Error('No route for "' + route.path + '".');
    } catch (err) {
      /* A thrown render is shown on the page, not just in the console — an
         error that only reaches devtools looks like a blank screen in a
         screenshot and reads as a layout bug. */
      screen = { name: 'error', el: h('div.wrap', UI.notice('error', 'Prototype error: ' + err.message, { dismissible: false })) };
      if (global.console) console.error(err);
    }

    UI.clear(appEl);
    appEl.appendChild(screen.el);
    Chrome.renderAdminBar(screen);
    UI.flushMounts();
    if (afterRender) afterRender(screen, route);
    return screen;
  }

  /* Navigate without triggering the guard — for a confirmed discard.
     A hash equal to the current one fires no hashchange, so bypassGuard would
     stay armed and the next real navigation would skip the guard. */
  function force(hash) {
    if (hash === location.hash) return render();
    bypassGuard = true; location.hash = hash;
  }

  /**
   * Put the address bar back after the guard refuses a move.
   *
   * Returning early without this leaves the URL on a screen that is not
   * displayed, so a reload lands somewhere the user was never looking — and
   * every state being deep-linkable is the whole point of hash routing here.
   * Fixed once, in the router, so no screen author has to remember it.
   *
   * replaceState does not re-enter onHashChange and does not add a history
   * entry. Where it is unavailable (a prototype opened over file://) the
   * assignment fallback fires one hashchange, which `revertTo` swallows.
   */
  function restoreHash() {
    if (currentHash === null || location.hash === currentHash) return;
    try {
      history.replaceState(null, '', currentHash || location.pathname + location.search);
    } catch (e) {
      revertTo = currentHash;
      location.hash = currentHash;
    }
  }

  function onHashChange() {
    var next = location.hash;
    if (revertTo !== null) {
      var wasRevert = next === revertTo;
      revertTo = null;
      if (wasRevert) return;      // our own revert, already rendered
    }
    if (bypassGuard) { bypassGuard = false; currentHash = next; return render(); }
    if (guard && guard(next, currentHash) === false) return restoreHash();
    currentHash = next;
    render();
  }

  function start() {
    if (!appEl) appEl = document.getElementById('app');
    window.addEventListener('hashchange', onHashChange);
    WP.subscribe(function () { render(); });
    if (!location.hash) location.hash = defaultHash;
    currentHash = location.hash;
    render();
  }

  global.Router = {
    configure: configure, setDefault: setDefault, parse: parse,
    render: render, start: start, force: force,
    current: function () { return currentHash; }
  };
})(window);
