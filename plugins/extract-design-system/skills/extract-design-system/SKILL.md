---
name: extract-design-system
description: >-
  Extract a website's FULL design system — tokens AND a curated component
  catalog (anatomy, variants, hover/focus states, section patterns) — into a
  bundle a coding agent consumes to build new pages that are native to the
  source brand. Superset of extract-design-md: use THIS skill when the goal is
  to build/generate pages that match the source site's components ("clone the
  design system", "extract components from <url>", "make new pages that look
  like <site>", "same buttons/cards/sections as <site>"); use extract-design-md
  when only a DESIGN.md token spec is wanted. Outputs
  .design_systems/<domain>-YYYYMMDD/ with DESIGN.md + component catalog +
  reference snippets + section patterns + DTCG tokens + an emitted eval
  harness. Fixes the "same skin, different skeletons" failure of token-only
  extraction.
---

# Extract a full design system bundle

Given a live URL, run the 9-stage pipeline and emit a bundle under
`.design_systems/<domain>-YYYYMMDD/` (host dots→hyphens). The output bundle layout and the
AGENTS.md consumption template are specified in `references/output-bundle-spec.md`.

```
URL ─▶ 1 DISCOVER ─▶ 2 TOKENS ─▶ 3 COMPONENT SWEEP ─▶ 4 CLUSTER + CURATE
    ─▶ 5 DISTILL ─▶ 6 STATES ─▶ 7 SECTIONS ─▶ 8 SYNTHESIZE ─▶ 9 VALIDATE
```

## Prerequisites

This skill drives three external tools — make sure each is available before running:

- **[playwright-cli](https://github.com/microsoft/playwright-cli)** on `PATH` — the in-browser
  extraction, component sweep, and screenshots run through it. Install once with
  `npm install -g @playwright/cli@latest` then `playwright-cli install --skills` (needs
  Node.js 18+). Check: `which playwright-cli`.
- **A reachable [Firecrawl](https://github.com/mendableai/firecrawl) instance** — used for page
  discovery (`firecrawl map`) and optional copy scraping. The hosted API or a self-hosted /
  local instance both work; if Firecrawl is unreachable the skill falls back to playwright link
  discovery (thinner page coverage). Confirm your instance responds before a run.
- **`npx`** (Node.js) — pulls the official `@google/design.md` linter on demand for the quality
  gate. If it's unavailable the skill writes the files anyway and notes "lint skipped".

> If your agent sandboxes network or filesystem access, allow the outbound calls this skill makes
> (headless browsing, Firecrawl, `npx`) before running.

`file://` URLs are blocked by playwright-cli — serve local HTML with
`python3 -m http.server <port>` and kill the server by PID afterwards (a `pkill -f` pattern can
match your own shell).

Let `SKILL` = this skill's directory. Session name: `S=dsys`. Compose→run→slice pattern
for every in-page script:

```bash
playwright-cli -s=$S run-code "$(cat script.js)" | bash "$SKILL/scripts/slice-result.sh" > out.json
```

Two scripts are **templates** with a `__`-placeholder substituted per page
(`distill.js` → COMPONENTS, `eval-selftest.js` → FIXTURES). Compose with
`tpl.replace('<placeholder>', JSON)`, then `node --check` the result. **The placeholder
literal must appear exactly once in each template, in code — never add it to a comment**
(this bug has now happened twice).

## Flags

| Flag | Default | Effect |
|---|---|---|
| `<url>` | required | Entry-point URL |
| `--pages <n>` | 5 | Max pages to sample |
| `--theme <auto\|light\|dark\|both>` | `auto` | Theme handling (as in extract-design-md) |
| `--no-screenshots` | ON | Skip feel/section screenshots; prose leans on tokens+copy |
| `--out <dir>` | `.design_systems/<domain>-YYYYMMDD/` | Output folder |
| `--max-components <n>` | 12 | Atom cap after curation (sections capped at 8 separately) |
| `--components-only` | off | Reuse a prior same-domain bundle's tokens+DESIGN prose (needs `raw/tokens/*.json` + lint-passing DESIGN.md); rerun stages 3–9 only. On a fresh domain: minimal auto-prose with honest lint warnings |
| `--single-file` | off | Additionally emit `design-system.full.md` (flatten: DESIGN → AGENTS → COMPONENTS → snippets → checklists) |

**Conflict guard (standing rule):** if the output folder exists, **ask** (overwrite /
dated sibling / abort). Never silently resolve.

## Stage 1 — Discover

`firecrawl map "<url>"` → bucket into slots (home always; pricing/product for cards+
toggles+tables; auth/contact for inputs; blog for prose; brand/about). Component
coverage weights the choice: prefer pages exposing form controls, repeated cards, tables.
Confirm the picked list with the user before crawling. Firecrawl down → try starting it,
else playwright link discovery.

## Stage 2 — Tokens

`scripts/extract-tokens.js` (verbatim from extract-design-md — dual-theme detection and
toggling rules are in that skill's `references/edge-cases.md`). Run on the homepage per
theme; finalize the token table **before** stage 5 so distillation can re-tokenize.
Sanity-check `varsTotal`; thin `vars` → relax using `varsExtra`.

## Stage 3 — Component sweep (per sampled page)

Scroll the page first to trigger lazy content (step ~900px, then back to top), then run
`scripts/extract-components.js`. It merges two channels (semantic tags/roles/class-regex
+ structural fingerprints), scores component-ness (fake-interactive and sub-10px-font
penalties keep DOM-built demo UIs out), detects the styling regime (tailwind density /
hashed classes / library fingerprints), and returns top-N candidates per kind with
17-dim style vectors. Save one `candidates-<slug>.json` per page.

## Stage 4 — Cluster + curate

```bash
node "$SKILL/scripts/cluster.js" candidates-home.json candidates-pricing.json > clusters.json
```

Deterministic: greedy-leader clustering (cosine ≥0.95), per-property-mode representative,
catalog gate (≥2 instances site-wide OR semantic/landmark role). **Then Claude curates**:
name components/variants (class-name hints beat inference: `btn--secondary` → secondary;
transparent → ghost; most-common → primary), merge duplicates, drop noise, trim to
`--max-components`, flag low-confidence picks. Output a curated list per page:
`[{ name, sel, expectText }]` (expectText = the element's leading text, for brittle-selector
re-resolution).

## Stage 5+6 — Distill + states (per page)

Compose `scripts/distill.js` with the page's curated array (each entry may add
`budget: <n>`; default 12 descendants). Returns per component: simplified HTML with
`data-src-class` verbatim recipes, default-diffed CSS, CDP authored rules, forced
hover/focus diffs on 13 tracked props, transition. Components that error return
`{name, error}` — rerun or drop, never crash. Save `distilled-<slug>.json`.

## Stage 7 — Sections (per page)

Scroll first, then run `scripts/extract-sections.js` → pattern + confidence + skeleton +
atomEvidence per section. Curate: `needsSmart` (<0.5) entries you label yourself from
heading/atomEvidence/screenshot (may be `custom:<name>`); override misclassifications;
pick ONE representative per pattern (≤8 total, ranked confidence × instances); log every
skip with a reason (goes to `raw/skipped.json`). Distill each representative via the
stage-5 template with `budget: 40`. Screenshot each section crop
(`page.locator(sel).scrollIntoViewIfNeeded()` then `.screenshot()`) into
`screenshots/sections/`.

## Stage 8 — Synthesize the bundle

Layout (see `references/output-bundle-spec.md` for the full spec — read it before writing):

```
<out>/
├── DESIGN.md                    # ≤300 lines; extract-design-md prose + `## Component Catalog` table
├── AGENTS.md                    # consumption protocol (6 imperative steps; template in `references/output-bundle-spec.md`)
├── components/COMPONENTS.md     # ~15-line contracts: anatomy, variants×states, usage, screenshots
├── components/*.html + gallery.html
├── tokens/design-tokens.json    # DTCG export
├── eval/fixtures.json + checklists.md
├── screenshots/<page>.png + sections/ + states/
└── raw/                         # tokens/ candidates/ sections/ distill-log.json skipped.json map.json
```

Mechanical parts:

```bash
node "$SKILL/scripts/build-snippets.js" --tokens tokens.json --out <out>/components \
  --source <url> distilled-home.json distilled-pricing.json distilled-sections-*.json
node "$SKILL/scripts/export-dtcg.js" tokens.json <out>/tokens/design-tokens.json --source <url> --theme light
node "$SKILL/scripts/build-fixtures.js" --tokens tokens.json --components <out>/components \
  --out <out>/eval/fixtures.json --source <url> --theme light \
  home:distilled-home.json pricing:distilled-pricing.json home:distilled-sections-home.json ...
```

Claude-authored parts: DESIGN.md (dual-theme rules as in extract-design-md; add the
Component Catalog table + a section-rhythm paragraph in Layout), COMPONENTS.md (anatomy
from the snippet HTML, variants×states from fixtures/states data, composition+skeleton
lines for sections, low-confidence flags visible), AGENTS.md, eval/checklists.md
(per-component judge rubrics; axis scores recorded separately, never averaged).
**Contract accuracy (consumers follow these lines literally):** every
Composition claim must be verifiable in the reference snippet's markup (elements seen
elsewhere → marked optional); content-dependent elements (billing toggles, testimonials)
marked conditional — omit, don't invent; prose type-size claims must match the measured
reference, not a plausible generalization.
State screenshot crops: serve `<out>/components` locally, screenshot the `.is-hover`/
`.is-focus` copies into `screenshots/states/`.

## Stage 9 — Validate (all four gates before reporting)

1. **Lint**: `npx -y @google/design.md lint <out>/DESIGN.md` — fix structural errors;
   flag value warnings, never silently delete captured tokens.
2. **Gallery**: render `gallery.html` headless via the local server; **0 console errors**
   required; screenshot and eyeball against the source screenshots.
3. **Eval self-test**: compose `scripts/eval-selftest.js` with fixtures.json;
   run on every sampled page of the LIVE source. Every check must pass — a failure means
   the fixture (or extraction) is wrong: fix or drop, never ship a fixture the source
   itself fails. Archive results to `raw/`.
4. **Completeness**: every high-count candidate kind is a catalog entry or a reasoned
   entry in `raw/skipped.json`.

## Final report

Tight and honest: pages sampled, regime detected, atoms + sections found (counts),
curation skips, lint result verbatim, self-test pass counts, fallback paths taken,
known gaps (e.g. un-captured selected-state indicators). Never imply fidelity a gate
didn't verify.

## Ask-first rule (standing)

<95% confident on an ambiguous mapping (which variant is "primary", whether a repeated
block is a real pattern, same-day output conflicts) → **ask with a recommendation**.
Sub-agents run **sequentially, never in parallel**, and must carry the Firecrawl +
sandbox rules above.

## Bundled files

- `scripts/extract-tokens.js` — stage-2 token extractor (copy of extract-design-md's; keep in sync)
- `scripts/extract-components.js` — stage-3 sweep (two channels, scoring, regime detection)
- `scripts/cluster.js` — stage-4 deterministic clustering + catalog gate (node CLI)
- `scripts/distill.js` — stage-5/6 template (COMPONENTS placeholder; per-entry `budget`)
- `scripts/extract-sections.js` — stage-7 classifier (self-contained run-code)
- `scripts/build-snippets.js` — stage-8 snippet/gallery emitter (node CLI)
- `scripts/export-dtcg.js` — stage-8 DTCG export (node CLI)
- `scripts/build-fixtures.js` — stage-8 fixtures generator (node CLI; evidence-only assertions)
- `scripts/eval-selftest.js` — stage-9 self-test template (FIXTURES placeholder; CIEDE2000, CDP states)
- `scripts/slice-result.sh` — strips playwright-cli's markdown wrapper to clean JSON
- `references/output-bundle-spec.md` — the output bundle layout + AGENTS.md consumption template.
  **Read before Stage 8.**
