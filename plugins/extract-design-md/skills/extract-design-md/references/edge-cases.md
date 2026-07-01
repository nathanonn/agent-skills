# Edge cases & fallbacks

How the skill degrades gracefully. The guiding rule: capture what's really there, be
honest in the report about anything that was derived, skipped, or unavailable — a hollow
DESIGN.md that *looks* complete is worse than a smaller honest one.

## Site has no CSS variables / no design system

Older or hand-rolled sites expose few or no useful `--*` tokens (`vars` comes back thin).

- **EC-NS.1** Skip var enumeration; rely entirely on the `elements` **computed styles** —
  still precise, just less semantic naming.
- **EC-NS.2** Cluster observed colors/sizes into a sensible scale: group near-identical
  hexes, sort sizes into xs–xl — rather than reading a pre-made scale.
- **EC-NS.3** Lean a little more on screenshots/copy to infer palette roles and feel.
- **EC-NS.4** Note in the report that tokens were **derived** (clustered from computed
  styles), not read from a declared system — so the user knows confidence is lower.

## Non-Tailwind / different framework

The noise filter is Tailwind-tuned. For other frameworks the keep-list still catches
`--color-*`/`--font-*`-style vars, but:

- **EC-FW.1** When little is found, **relax the filter** — pull candidates from `varsExtra`
  (returned for exactly this) and widen the keep-list at the top of `extract-tokens.js`
  rather than accepting an empty set. Re-run if you adjust the lists.

## Light vs. dark theme (dual-theme is in scope — decision 8)

- **EC-TH.1** Detect via `themeSignal`: a `.dark` class or `data-theme` on `<html>`, or a
  `prefers-color-scheme` response. When two themes exist, extract **once per theme** and
  emit `DESIGN.light.md` + `DESIGN.dark.md` (shared typography/spacing, per-theme
  colors/components — see `design-md-schema.md` MAP.6).
- **EC-TH.2** Toggle method, in order: click the site's own theme switch if found; else set
  the class/attribute directly on `<html>` via `run-code`
  (`document.documentElement.classList.add('dark')` or `setAttribute('data-theme','dark')`);
  else emulate `prefers-color-scheme`. After toggling, `sleep 2` to re-settle fonts/CSS
  before re-running the extractor.
- **EC-TH.3** If the alternate theme can't be triggered reliably, capture the loaded theme
  only, emit a single `DESIGN.md`, and note in the report that the second theme wasn't
  extractable.
- **EC-TH.4** `--theme light|dark` pins one theme and emits a single file even on a
  dual-theme site.

## Multi-page merge conflicts

- **EC-MG.1** Same CSS var, different values across pages (e.g. theme variants): record both,
  prefer the homepage value for the core palette, surface the conflict in `raw/tokens/*.json`
  and the report.
- **EC-MG.2** Component computed style differs across pages: keep the homepage/hero version
  canonical, note the variant.

## Crawl / load failures

- **EC-LF.1** Page times out or 4xx/5xx → skip it, keep going, note the skip. Never abort
  the whole run for one bad page.
- **EC-LF.2** Bot-protection / Cloudflare challenge blocks the load → report it for that page;
  do not attempt evasion.
- **EC-LF.3** Auth-walled pages (dashboard behind login) are out of scope unless the user
  supplies a way in; skip by default.

## Firecrawl / linter unavailable

- **Firecrawl down & won't start** → fall back to playwright link discovery
  (`run-code` returning `[...document.links].map(a => a.href)`), bucket those instead; warn
  that page coverage may be thinner.
- **`npx` / linter unavailable or offline** → write the DESIGN file(s) anyway; warn
  "lint skipped" in the report (also what `--no-lint` does).
- **Screenshots fail (timeout)** → continue token-only for that page; note the gap.

## Empty / tiny result

- **EC-ER.1** If extraction yields almost nothing — no vars, no usable computed styles
  (a canvas-only or heavily-obfuscated site) — **stop and tell the user plainly** that
  automated design-system extraction isn't viable for this site, rather than emitting a
  hollow DESIGN.md.
