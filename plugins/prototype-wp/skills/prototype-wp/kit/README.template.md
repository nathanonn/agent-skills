# {{Plugin name}} — THROWAWAY PROTOTYPE

**This is not production code.** It is a browser simulation of {{plugin name}},
built from `{{path/to/spec}}` to answer one question: *does this specified plugin
hold together as a product?* No PHP, no database, no WordPress.

- **Mode:** {{full-coverage | focused}}
- **Spec:** `{{path}}` — {{n}} sections, {{n}} rules
- **Built:** {{YYYY-MM-DD}}

## Run

```bash
cd {{prototype-dir}}
python3 -m http.server 4174
```

Open <http://localhost:4174/>.

State lives in memory. **Reload resets everything to fixtures** — that is the
undo button.

## Where to start

Ordered by what is most likely to be wrong, not by spec order.

1. **{{Settings screen}}** — `#/{{route}}`. {{The validation and precedence rules
   are the densest part of the spec; this is where a contradiction shows first.}}
2. **{{The resolution model}}** — `#/{{route}}`. {{What the engine derives, and
   from what.}}
3. **{{The entity editor}}** — `#/{{route}}`. {{The largest surface.}}
4. **{{The front-end}}** — `#/{{route}}`.
5. **Prototype controls**, bottom-right — switch on a failure condition and
   watch a screen above change.

## Prototype controls

The dark panel in the bottom-right corner. **Not part of the plugin.** It sets
conditions a healthy install cannot produce on demand.

| Control | Group | What it does |
| --- | --- | --- |
| {{…}} | Environment | {{…}} |
| {{…}} | Acting as | {{…}} |
| {{…}} | Simulate | {{…}} |

**Reset prototype data** restores the fixtures. **Clear all simulations**
returns every condition to its healthy default.

## Fixtures

Each entity exists to exercise something specific.

| Entity | Route | Exercises |
| --- | --- | --- |
| {{name}} | `#/{{route}}` | {{the rule cluster — "spec §6.3 worked example, verbatim", "every item hidden", "a single item", "a derived item colliding with an existing one"}} |

## Coverage

By the spec's own sections, so this can be read against the document rather than
against a narrative.

| Spec § | Subject | Where to see it | Status |
| --- | --- | --- | --- |
| {{§1}} | {{…}} | `#/{{route}}` | {{built / partial / not built}} |

## Honest limits

### Simulated

- {{Each fake, described precisely enough that a reader knows where the seam is.
  Not "remote images are faked" but: "Remote URLs are never fetched. Validation
  is real and synchronous; the redirect chain comes from a fixed table. Saved
  addresses are mapped to bundled files so they render, and the address the user
  sees and saves is always the remote one."}}

### Genuine

- {{Real browser behaviour that can be trusted — video playback and autoplay
  rejection, pointer capture, CSS layout at the widths that were rendered,
  computed styles, form validation.}}

### Not verified

- {{Anything the harness could not exercise, named rather than assumed —
  `file://` operation, real touch and pinch gestures, real OS file drag-and-drop,
  responsive breakpoints that were never rendered.}}
- {{Every assumption recorded where the spec was silent.}}

## Layout

```
{{prototype-dir}}/
  index.html
  assets/
    css/
      wp-admin.css      admin chrome            [kit, spine]
      woo.css           host-plugin chrome      [kit, overlay]
      {{plugin}}.css
    js/
      ui.js             DOM primitives          [kit]
      wp.js             roles, versions, settings spine  [kit]
      chrome.js         admin bar, menu, Plugins, Media  [kit]
      router.js         hash router             [kit]
      devpanel.js       driver panel            [kit]
      data.js           fixtures — the simulated install
      core.js           >>> DOMAIN ENGINE — the spec's rules, DOM-free <<<
      {{screens}}.js
      app.js            configure + start
    media/              images, posters, and the three kit placeholders
    video/              {{real files, for real playback}}
```

`core.js` is the part worth keeping. It holds the spec's rules with no DOM
reference, which is what let the whole rule matrix be asserted before any screen
existed — and what makes it portable to PHP. See `{{porting note}}`.
