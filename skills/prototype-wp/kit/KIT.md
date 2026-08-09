# The asset kit

Copy these files. Do not re-derive them. Everything `app.js` has to supply is
specified here — the three declarative shapes, the state shape, the guard
contract — so the kit sources are reference, not required reading.

The spine is identical for every WordPress plugin and is the largest single
re-derivation cost — in the run this was extracted from, ~86% of the admin CSS
(≈480 of 557 lines) was plugin-agnostic. But that is the weaker reason.

**The stronger reason: an asset kit is how a skill remembers a bug.** Two of the
four real defects in that run were primitive-level traps that would recur on any
re-implementation, by anyone, at any level of care. They are fixed here, with the
reasoning in the comment beside each fix. Shipping the fixed primitive removes
them structurally instead of relying on remembering. A third — pruning that ran
on the failure path — is closed in `saveSettings()`; the fourth is a rule for the
engine you write, not a kit file, and lives in [`../BUILD.md`](../BUILD.md).

## Provenance

| | |
| --- | --- |
| Extracted from | A 4,916-line WooCommerce gallery-plugin prototype built from a written spec |
| Extraction date | 2026-08-06 |
| Kit version | 1.1.0 — eight runtime defects fixed 2026-08-09, in the six trap classes below |
| Size | 1,784 lines — 1,206 JS, 505 CSS, 73 HTML/JSON |
| Verified | Smoke-tested against a scratch prototype: both hardened primitives, all four settings behaviours, a 16-case validation matrix, precedence, dependency and capability gating, four routes with zero console errors |
| Re-verified | 1.1.0 in Chromium against a scratch harness: every fix below reproduced before and re-tested after, plus a full sweep — five routes, deep-link reload, back/forward, all four settings behaviours, capability and dependency gating, menu hiding, clear-all, the modal primitive, the responsive breakpoint. Zero console messages and zero failed requests across the sweep |

That build is **the source run** — the phrase every document in this skill uses
for it.

## What each file gives you

| File | Layer | Contents |
| --- | --- | --- |
| `index.html` | spine | Mount points and script order. The ids are looked up by name — renaming them breaks the kit. The prototype script tags are commented out and a placeholder boot renders a visible shell; P2 uncomments the tags and deletes that block. |
| `package.json` | spine | Aliases the static server. No dependencies, no build step. |
| `css/wp-admin.css` | spine | Admin bar, menu, notices, buttons, forms, `.form-table`, list tables, pills, postboxes, modal, media grid, driver panel, one responsive breakpoint. |
| `css/woo.css` | overlay | WooCommerce settings cards, product-data metabox, variations, native image boxes. Delete when there is no host plugin. |
| `js/ui.js` | spine | `h()`, `style()`, form controls, notices, modal, confirm, inline SVG icons, deferred mount queue. |
| `js/wp.js` | spine | Store, roles and capabilities, version comparison, dependency gate, settings validate / normalise / save / precedence. No DOM. |
| `js/chrome.js` | spine | Admin bar, left menu, screen wrapper, Plugins screen, Media Library, no-capability screen. `screenMedia({hidden, missing, notice})` — `hidden` removes a tile, `missing` renders it unavailable. |
| `js/router.js` | spine | Hash router, render loop, unsaved-changes guard. |
| `js/devpanel.js` | spine | Driver panel: declarative environment / role / simulation groups, reset and clear-all. Updates in place; only collapsing or expanding rebuilds. |
| `media/placeholder-*.svg` | spine | Image, video and unavailable placeholders. All three are wired: image and video back a tile with no file of its own, unavailable backs both the `missing` predicate and any source the browser fails to load. |
| `README.template.md` | — | The seven README sections, with the three honest-limits lists. |
| `RECIPES.md` | — | Media generation commands, with fallbacks. |

## Where the files go

The **prototype root** is the directory chosen in P2 — named as a prototype, in
the repository the plugin belongs to, never inside the plugin's own source tree.
`kit/css`, `kit/js` and `kit/media` are copied to `assets/css`, `assets/js` and
`assets/media` under it. `index.html` and `package.json` sit at the root itself.
Nothing else in the kit is renamed on the way.

| Kit file | Prototype |
| --- | --- |
| `index.html`, `package.json` | root, same names |
| `css/*`, `js/*`, `media/*` | `assets/css/*`, `assets/js/*`, `assets/media/*` |
| `README.template.md` | becomes the prototype's `README.md` |
| `KIT.md`, `RECIPES.md` | stay in the skill — they are instructions to the builder, not prototype files |
| — | `assets/video/*` — generated per [`RECIPES.md`](RECIPES.md), nothing in the kit to copy |

`Chrome.configure({ mediaPath })` is the one place that hard-codes the layout;
change it if the media directory moves.

## Wiring it up

Four configure calls, all in `app.js`, all before `Router.start()`:

```js
WP.configure({
  fixtures: DATA.initialState,     // function () -> the whole store
  roles: DATA.ROLES,               // key -> {label, <cap>: true}
  requires: {
    name: 'My Plugin', version: '1.0.0', wp: '6.5', php: '8.1',
    plugins: [{ key: 'woocommerce', label: 'WooCommerce', min: '8.0' }]
  },
  settingFields: ENGINE.SETTING_FIELDS,
  labels: ENGINE.LABELS
});

Chrome.configure({ site: 'Example Store', menu: MENU, manageCap: 'manage_woocommerce',
                   mediaPath: 'assets/media/' });
Driver.configure({ environment: [...], role: {...}, simulations: [...] });
Router.configure({ routes: {...}, guard: guardUnsaved, afterRender: Driver.render });
Router.setDefault('#/dashboard');
Router.start();
```

The state shape `wp.js` expects:

```js
{
  env: {
    wpVersion: '6.7', phpVersion: '8.2',
    self: { active: true },
    plugins: { woocommerce: { active: true, version: '9.4' } },
    role: 'administrator'
  },
  sim: { /* one boolean per simulation */ },
  settings: { /* one entry per settingFields key */ },
  obsoleteOptions: ['old_key_1'],   // pruned on a clean save
  attachments: [ { id, type, title, file, alt, poster } ],
  /* everything else is yours */
}
```

`poster` is the still shown for a `type: 'video'` attachment; without one the
video placeholder stands in.

## The three declarative shapes

`settingFields`, `menu` and the driver groups are the vocabularies `app.js` and
the engine are written against. A wrong one fails at the layer that consumes it,
not at the call — a `kind` the kit does not know rejects every value the field
ever sees.

### Setting fields — `WP.configure({ settingFields })`

```js
ENGINE.SETTING_FIELDS = {
  layout:   { label: 'Layout', kind: 'enum', values: ['grid', 'carousel'], def: 'grid' },
  captions: { label: 'Show captions', kind: 'bool', def: true },
  columns:  { label: 'Columns', kind: 'int', def: 4, min: 1, max: 8 },
  gap:      { label: 'Gap (rem)', kind: 'float', def: 1.5, min: 0, exclusiveMin: true },
  ratio:    { label: 'Thumbnail ratio', kind: 'ratio', def: '4:3' },
  heading:  { label: 'Heading', kind: 'text', def: '', required: true }
};
```

| `kind` | Accepts | Stores |
| --- | --- | --- |
| `enum` | a member of `values` | the value |
| `bool` | a boolean, or the strings `'true'` / `'false'` | a boolean |
| `int` | digits with an optional leading minus — decimals, text and empty are rejected | a number |
| `float` | anything `parseFloat` reads | a number |
| `ratio` | `W:H`, both positive | the string, whitespace stripped |
| `text` | any string | the string |

| Key | Applies to | Meaning |
| --- | --- | --- |
| `label` | all | What the settings screen renders beside the control |
| `kind` | all | One of the six above; anything else rejects every value |
| `def` | all | What `normaliseSettings()` falls back to when a stored value fails |
| `values` | `enum` | Accepted values; the rejection message lists them through `labels` |
| `min`, `max` | `int`, `float` | Inclusive bounds, either usable alone |
| `exclusiveMin` | `int`, `float` | Makes `min` exclusive |
| `required` | `text` | Rejects the empty string |
| `validate` | all | `function (raw, field)` returning `{ok: true, value}` or `{ok: false, message}` — replaces the `kind` check entirely |

String input is trimmed before the `kind` checks; a `validate` function receives
the raw value. `labels` — `{ layout: { grid: 'Grid' } }` — supplies display
names for enum values and is what `WP.labelFor()` reads.

### Menu — `Chrome.configure({ menu })`

```js
var MENU = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', route: '#/dashboard' },
  { sep: true },
  { key: 'settings', label: 'My Plugin', icon: 'settings', route: '#/settings',
    requires: 'woocommerce',
    sub: [{ key: 'settings', label: 'Settings', route: '#/settings' },
          { key: 'tools', label: 'Tools', route: '#/tools' }] }
];
```

- `key` is matched against the current-screen key a screen passes to
  `Chrome.chrome(key, children)`. A top-level item is current when its own key
  matches or any `sub` key does, and only a current item renders its submenu.
- `route` becomes a real `href`. `icon` names an entry in `UI.ICONS` —
  `dashboard`, `media`, `pages`, `posts`, `products`, `cart`, `plugins`, `users`,
  `tools`, `settings` — and an unknown name falls back to `dashboard`.
- `requires` is a dependency plugin key; the item disappears while that plugin is
  inactive, the way a menu registered by a host plugin does.
- `{ sep: true }` is a separator and carries nothing else.

### Driver groups — `Driver.configure()`

```js
Driver.configure({
  environment: [
    { type: 'check', label: 'WooCommerce active', def: true,
      get: function () { return WP.get().env.plugins.woocommerce.active; },
      set: function (v) { WP.get().env.plugins.woocommerce.active = v; } },
    { type: 'select', label: 'WordPress version', def: '6.7', options: ['6.4', '6.7'],
      get: function () { return WP.get().env.wpVersion; },
      set: function (v) { WP.get().env.wpVersion = v; } },
    { type: 'note', text: 'Deactivating the plugin is expected and raises no notice.' }
  ],
  role: { def: 'administrator', note: 'Roles come from WP.configure({roles}).' },
  simulations: [
    { key: 'attachmentDeleted', label: 'Referenced attachment deleted',
      note: 'The tile renders the unavailable placeholder.',
      onToggle: function (on, state) { /* mutate the store */ } }
  ]
});
```

| Field | Where | Meaning |
| --- | --- | --- |
| `type` | environment | `check`, `select` or `note` |
| `get`, `set` | environment `check` / `select` | Read and write the store — `check` deals in booleans, `select` in option values |
| `def` | environment | The healthy default. An entry without one never counts toward the collapsed pill and **Clear all simulations** does not restore it |
| `options` | environment `select` | Strings, or `{value, label}` objects |
| `text` | environment `note` | Panel prose, no control |
| `def`, `note` | role | Default role key — falling back to the first key in `WP.configure({roles})` — and an optional caption |
| `key` | simulations | Indexes `state.sim`; the switch reads and writes `state.sim[key]` |
| `onToggle` | simulations | `(on, state)` — mutate the store, so the condition is real rather than a printed symptom |
| `label` | environment `check` / `select`, simulations | Control label — also the source of its DOM id |
| `note` | simulations | Optional line beneath the switch |
| `caption`, `onReset`, `onClear` | top level | Panel caption; extra teardown before `WP.reset()`; extra teardown after a clear |

## The guard contract

`Router.configure({ guard })` runs `guard(nextHash, currentHash)` on every
navigation. Return `false` to refuse it.

**The router puts the URL back.** A refused move that leaves the address bar on
the screen it did not go to breaks deep linking: reload lands somewhere the user
was never looking. Screen authors do not handle this — it happens once, in
`onHashChange`.

Confirm the discard, then call `Router.force(nextHash)` — that is the one
navigation the guard does not see. `force()` to the hash already showing renders
directly rather than arming the bypass and leaving it armed.

Chrome navigation is real `<a href="#/route">`, so it is focusable and tabbable
and the guard still intercepts on hashchange. `Chrome.go()` remains for
programmatic navigation.

## The two hardened primitives

Do not "simplify" either of these. Both bugs rendered a plausible page.

**`h()` throws on a tag it cannot parse.** A space-separated class list inside
the tag selector — `h('div.notice.notice-error is-dismissible')` — made the tag
regex return null. The old fallback built a bare `<div>`, so *every admin notice
in the source run rendered with no classes at all*: unstyled, and invisible to
`.notice-error` queries. Every screenshot looked correct.

**Style application routes `--` keys through `setProperty()`.** `Object.assign
(el.style, {'--thumb-size': '96px'})` drops custom properties silently. In the
source run this meant two specified settings had no effect on anything, while
the page rendered a plausible result throughout.

Both are invisible to screenshot review and obvious to one `eval`. That is the
whole argument for the measurement pass.

## Six more traps, closed in 1.1.0

Same class: each rendered a plausible page. Each is fixed at the primitive, so
no screen has to remember. Six rows, eight defects — the video row and the
driver-panel row each close two.

| Trap | What it looked like | Closed by |
| --- | --- | --- |
| `force()` left the guard bypass armed when the hash was unchanged | one unrelated navigation later, an unsaved form was discarded with no prompt | `force()` renders directly for an unchanged hash |
| A refused navigation never restored the URL | the address bar named a screen that was not on the page | the router restores it |
| A declared dependency absent from `env.plugins` was a throwaway literal | Activate was a dead click; the notice never cleared | the record is materialised in the store, at the declared minimum version |
| `<video>` in the media grid | blank white tile, `videoWidth: 0`, no console output | tiles render a poster image with a play affordance; a source that fails to load logs, swaps in the unavailable placeholder and marks the tile `.is-missing`. Real playback stays on the screen that plays something, with a real file — see `RECIPES.md` |
| Chrome nav anchors had no `href` | not focusable, not tabbable, `generic` rather than `link` in the a11y tree | `href="#/route"`, no click handler |
| The driver panel rebuilt wholesale on every toggle | focus fell to `<body>`; automated drivers held detached nodes; labels differing only in punctuation shared one id | in-place update, rebuild only on collapse/expand; ids slugged and numbered |

## Four settings behaviours that look like details

They are the rules an agent under time pressure simplifies away. Three are
`saveSettings()`; the other is `normaliseSettings()`, which `saveSettings()`
never calls — it is reached through `effectiveSettings()`:

1. `saveSettings()` — a rejected field keeps its last valid stored value;
2. `saveSettings()` — valid siblings on the same screen still save;
3. `normaliseSettings()` — unrecognised stored values normalise to the default
   **and are reported**;
4. `saveSettings()` — obsolete option keys are pruned **only on a clean save**.

The fourth was itself a bug in the source run — pruning ran on the failure path,
so the message announcing it could never appear in the flow meant to show it.

The store change is synchronous; the notification is not. `saveSettings()`
defers its emit to the end of the caller's turn, so the render it triggers sees
the result the call returned — including the denied case, which notifies too. A
screen can therefore render its save message straight from the return value:

```js
lastSave = WP.saveSettings(draft, { cap: 'manage_options' });   // one render, and it shows this
```

Emitting inline instead puts the render before the assignment, which shows the
message one render late — a save that only announces itself when something else
happens to re-render.

## The kit is a starting point, not a constraint

It biases toward the choices its source run made: classic scripts, `window`
globals, hash routing, hyperscript instead of templates, no build step. Those
choices are good for a throwaway artifact and are not the only ones that work.

Where a plugin genuinely needs a different shape, **say so and depart from the
kit.** Bending the plugin to fit the kit is the failure this note exists to
prevent. Delete every kit file the prototype does not use — a prototype shipping
dead scaffolding invites a reader to wonder what it was for.
