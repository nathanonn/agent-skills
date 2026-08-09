/* PROTOTYPE KIT — WordPress admin chrome: admin bar, left menu, screen wrapper,
   Plugins screen, Media Library, the no-capability screen.
   Throwaway prototype code. Not production. */
(function (global) {
  'use strict';

  var h = UI.h;

  var config = {
    site: 'Prototype Site',       // admin bar brand
    menu: [],                     // see MENU shape below
    home: '#/dashboard',          // where the brand and Dashboard items go
    manageCap: 'manage_options',  // capability that sees administrative notices
    issuesRoute: '#/plugins',     // where the admin-bar issue badge points
    mediaPath: 'assets/media/'    // where the placeholder SVGs live
  };

  /* MENU shape — one entry per top-level item:
     { key, label, icon, route, requires: 'pluginKey', sub: [{key, label, route}] }
     { sep: true }
     `requires` hides the item when that dependency plugin is inactive, the way
     a real menu registered by a host plugin disappears with it. */
  function configure(opts) { Object.assign(config, opts); }

  function go(hash) { location.hash = hash; }

  /* Every chrome navigation is a real <a href>. An anchor without href is not
     focusable, not tabbable, and reads as `generic` rather than `link` in the
     accessibility tree — a nav nobody can reach with a keyboard, which no
     screenshot shows. These are hash routes, so the href IS the navigation:
     no click handler, nothing to double-fire, and the router's guard still
     intercepts on hashchange. `go()` stays for programmatic navigation. */

  /* ------------------------------------------------------------ admin bar */

  function renderAdminBar(screen) {
    var bar = document.getElementById('wpadminbar');
    UI.clear(bar);

    bar.appendChild(h('a.ab-item.is-logo', { href: config.home }, '▣ ' + config.site));
    bar.appendChild(h('a.ab-item', { href: config.home }, 'Dashboard'));

    (config.barItems || []).forEach(function (item) {
      var resolved = typeof item === 'function' ? item(screen) : item;
      if (resolved) bar.appendChild(h('a.ab-item', { href: resolved.route }, resolved.label));
    });

    bar.appendChild(h('span.ab-spacer'));

    var deps = WP.dependencies();
    if (deps.blocking.length && WP.can(config.manageCap)) {
      bar.appendChild(h('a.ab-item', { href: config.issuesRoute },
        h('span.ab-badge', deps.blocking.length), 'Issues'));
    }
    bar.appendChild(h('span.ab-item', 'Howdy, ' + WP.role().label));
  }

  /* ------------------------------------------------------------- the menu */

  function renderMenu(current) {
    var env = WP.get().env;
    var ul = h('ul#adminmenu');

    config.menu.forEach(function (m) {
      if (m.sep) { ul.appendChild(h('li.menu-sep')); return; }
      if (m.requires && !((env.plugins || {})[m.requires] || {}).active) return;

      var isCurrent = current === m.key || (m.sub || []).some(function (s) { return s.key === current; });
      var li = h('li', { class: isCurrent ? 'current wp-has-current-submenu' : '' },
        h('a', { href: m.route }, UI.icon(m.icon), h('span', m.label)));

      if (m.sub && isCurrent) {
        var sub = h('ul.wp-submenu');
        m.sub.forEach(function (s) {
          sub.appendChild(h('li', { class: s.key === current ? 'current' : '' },
            h('a', { href: s.route }, s.label)));
        });
        li.appendChild(sub);
      }
      ul.appendChild(li);
    });

    return h('div#adminmenuwrap', ul);
  }

  /**
   * Wrap a screen in the admin chrome.
   *
   * Administrative notices are gated on the management capability: a user who
   * cannot act on a dependency problem is not told about it. Showing every
   * notice to every role is the most common way a prototype misrepresents what
   * a shop assistant would actually see.
   */
  function chrome(currentMenu, children) {
    var body = h('div#wpbody');
    var deps = WP.dependencies();

    if (WP.can(config.manageCap)) {
      deps.blocking.forEach(function (p) {
        body.appendChild(UI.notice('error', h('span', h('strong', (WP.config.requires.name || 'Plugin') + ': '), p.text)));
      });
    }
    (children || []).forEach(function (c) { if (c) body.appendChild(c); });

    return h('div.wp-admin-wrap', renderMenu(currentMenu), body);
  }

  function noCapScreen(message) {
    return h('div.no-cap-screen',
      h('h2', 'Sorry, you are not allowed to access this page.'),
      h('p.description', message));
  }

  /* Standard screen header: title, optional action button, the hr WP uses to
     anchor notices below the heading. */
  function heading(title, action) {
    return [
      h('h1.wp-heading-inline', title),
      action ? h('a.page-title-action', { onclick: action.onclick }, action.label) : null,
      h('hr.wp-header-end')
    ];
  }

  /* --------------------------------------------------------------- Plugins */

  /**
   * The Plugins screen, driven by WP.config.requires plus the plugin itself.
   * Activation and deactivation here are the same switches the driver panel
   * exposes — one state, two ways in, which is what makes deactivation
   * behaviour demonstrable rather than described.
   */
  function screenPlugins(opts) {
    opts = opts || {};
    var st = WP.get();

    if (!WP.can(config.manageCap)) {
      return chrome('plugins', [h('div.wrap', heading('Plugins'),
        noCapScreen('Managing plugins requires an administrator account.'))]);
    }

    var rows = [];
    (WP.config.requires.plugins || []).forEach(function (p) {
      /* Materialise the record: a declared-but-absent dependency must live in
         the store, or Activate mutates a throwaway and the notice never clears.
         The version matters as much as the record — seeded with '—' the row
         activates and immediately trips the minimum-version check instead. */
      var installed = st.env.plugins || (st.env.plugins = {});
      var inst = installed[p.key] || (installed[p.key] = { active: false, version: p.min || '—' });
      rows.push(pluginRow({
        name: p.label, version: inst.version, author: p.author || '—', active: inst.active,
        description: p.description || '',
        toggle: function () { inst.active = !inst.active; WP.emit(); }
      }));
    });

    rows.push(pluginRow({
      name: WP.config.requires.name || 'This plugin',
      version: WP.config.requires.version || '1.0.0',
      author: WP.config.requires.author || '—',
      active: st.env.self.active,
      description: WP.config.requires.description || '',
      note: opts.selfNote ? opts.selfNote(st.env.self.active) : null,
      toggle: function () { st.env.self.active = !st.env.self.active; WP.emit(); }
    }));

    return chrome('plugins', [
      h('div.wrap',
        heading('Plugins'),
        opts.notices ? opts.notices() : null,
        h('table.wp-list-table.widefat.plugins',
          h('thead', h('tr', h('th', 'Plugin'), h('th', 'Description'))),
          h('tbody', rows)))
    ]);
  }

  function pluginRow(p) {
    return h('tr', { class: p.active ? 'active' : 'inactive' },
      h('td', { style: { width: '260px' } },
        h('strong.plugin-title', p.name),
        h('div.row-actions', { style: { visibility: 'visible' } },
          h('span', h('a', { onclick: p.toggle }, p.active ? 'Deactivate' : 'Activate')))),
      h('td',
        h('div', p.description),
        h('div.plugin-version-author-uri', 'Version ' + p.version + ' | By ' + p.author),
        p.note ? h('div', { style: { marginTop: '8px' } }, p.note) : null));
  }

  /* ---------------------------------------------------------------- Media */

  /**
   * A thumbnail that fails loudly.
   *
   * A source the browser cannot decode paints nothing, reports nothing and
   * leaves a blank tile that reads as a styling problem. Here the error swaps
   * in the unavailable placeholder, marks the tile `.is-missing` and says so on
   * the console — the failure is visible on the page and greppable in a log.
   */
  function thumb(src, alt) {
    var img = h('img', { src: src, alt: alt || '' });
    img.addEventListener('error', function () {
      if (img.dataset.failed) return;         // the placeholder itself must not loop
      img.dataset.failed = '1';
      var msg = 'media failed to load: ' + src;
      if (global.console) console.error('[prototype] ' + msg);
      img.src = config.mediaPath + 'placeholder-unavailable.svg';
      var item = img.parentNode;
      if (item && item.classList) { item.classList.add('is-missing'); item.title = msg; }
    });
    return img;
  }

  /**
   * One Media Library tile.
   *
   * Video renders as its poster with a play affordance, the way the real grid
   * does — not as a <video> element. A <video> pointed at anything the browser
   * cannot demux (an SVG placeholder, an mp4 that was never generated) yields
   * videoWidth 0, a blank white tile and zero console output. Real playback
   * belongs on the screen that is about to play something, with a real file.
   */
  function mediaTile(a, missing) {
    var isVideo = a.type === 'video';
    var src = missing ? config.mediaPath + 'placeholder-unavailable.svg'
      : isVideo ? (a.poster || config.mediaPath + 'placeholder-video.svg')
      : (a.file || config.mediaPath + 'placeholder-image.svg');

    var item = h('div.media-item' + (missing ? '.is-missing' : ''), { title: a.title });
    item.appendChild(thumb(src, a.alt || a.title || ''));
    if (isVideo && !missing) item.appendChild(h('span.media-play', { 'aria-hidden': 'true' }, '▶'));
    item.appendChild(h('span.media-kind', a.type));
    item.appendChild(h('span.media-name', a.title + ' (#' + a.id + ')'));
    return item;
  }

  /**
   * Media Library grid over state.attachments.
   * `hidden` lets a simulation remove an attachment from the library without
   * deleting it from the fixture, so the condition is reversible. `missing`
   * marks one that is still catalogued but no longer on disk — the deleted
   * attachment, which renders the unavailable placeholder rather than a gap.
   */
  function screenMedia(opts) {
    opts = opts || {};
    var st = WP.get();
    var grid = h('div.media-grid', { style: { maxWidth: '1100px' } });

    st.attachments.forEach(function (a) {
      if (opts.hidden && opts.hidden(a)) return;
      grid.appendChild(mediaTile(a, !!(opts.missing && opts.missing(a))));
    });

    return chrome('media', [
      h('div.wrap',
        heading('Media Library'),
        opts.notice ? opts.notice() : null,
        grid)
    ]);
  }

  global.Chrome = {
    configure: configure, go: go,
    renderAdminBar: renderAdminBar, renderMenu: renderMenu, chrome: chrome,
    heading: heading, noCapScreen: noCapScreen,
    screenPlugins: screenPlugins, screenMedia: screenMedia, pluginRow: pluginRow,
    mediaTile: mediaTile, thumb: thumb
  };
})(window);
