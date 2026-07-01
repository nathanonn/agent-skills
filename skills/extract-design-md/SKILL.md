---
name: extract-design-md
description: >-
  Extract a website's design system into a DESIGN.md file (the
  google-labs-code/design.md format). Use this whenever the user gives a site URL
  and wants to capture, reverse-engineer, clone, or document its visual identity —
  colors, typography, radius/spacing scales, components, and brand feel. Triggers
  on phrasings like "extract the design system from <url>", "make a DESIGN.md from
  <site>", "get the design tokens off <site>", "what's the color palette / fonts on
  <site>", or "I want my UI to look like <site>". It samples a few real pages with
  playwright-cli, reads CSS custom properties + computed styles (precise, cheap),
  takes light screenshots for prose, and validates with the official linter. Prefer
  this over eyeballing a screenshot whenever the goal is a reusable design spec.
---

# Extract DESIGN.md from a site

Given a live URL, produce a [`DESIGN.md`](https://github.com/google-labs-code/design.md) —
YAML design tokens (colors, typography, `rounded`, `spacing`, `components`) plus
prose in canonical section order — good enough to hand a coding agent so it builds
new UI matching the source site.

**Core idea (from research):** tokens map ~1:1 to a site's CSS custom properties +
computed styles, so the heavy lifting is a cheap in-browser extraction — not vision.
Screenshots feed *prose only*. The official linter is a free quality gate.

```
URL ─▶ 1 DISCOVER ─▶ 2 EXTRACT TOKENS ─▶ 3 HARVEST COMPONENTS
        ─▶ 4 CAPTURE FEEL ─▶ 5 SYNTHESIZE ─▶ 6 VALIDATE ─▶ DESIGN.md
```

## Prerequisites

This skill drives three external tools — make sure each is available before running:

- **[playwright-cli](https://github.com/microsoft/playwright-cli)** on `PATH` — the in-browser
  extraction and screenshots run through it. Install once with
  `npm install -g @playwright/cli@latest` then `playwright-cli install --skills` (needs
  Node.js 18+). Check: `which playwright-cli`.
- **A reachable [Firecrawl](https://github.com/mendableai/firecrawl) instance** — used for page
  discovery (`firecrawl map`) and optional copy scraping. The hosted API or a self-hosted /
  local instance both work; if Firecrawl is unreachable the skill falls back to playwright
  link discovery (thinner page coverage). Confirm your instance responds before a run.
- **`npx`** (Node.js) — pulls the official `@google/design.md` linter on demand for the quality
  gate. If it's unavailable the skill writes the file anyway and notes "lint skipped".

> If your agent sandboxes network or filesystem access, allow the outbound calls this skill makes
> (headless browsing, Firecrawl, `npx`) before running.

Let `SKILL` = this skill's directory. Pick a stable playwright session name, e.g. `S=designmd`.

## Flags

| Flag | Default | Effect |
|---|---|---|
| `<url>` | required | Entry-point URL |
| `--pages <n>` | 5 | Max pages to sample |
| `--pages-list <paths>` | auto | Pin exact pages (skips the confirm prompt) |
| `--no-screenshots` | shots ON | Skip the feel pass; prose then leans on token names + copy |
| `--theme <auto\|light\|dark\|both>` | `auto` | `auto` detects; `both` forces dual; `light`/`dark` pin one |
| `--out <dir>` | `.design_mds/<domain>-YYYYMMDD/` | Output folder |
| `--no-lint` | lint ON | Skip the linter (auto-skips if `npx` is unavailable) |

---

## Stage 1 — Discover pages

```bash
firecrawl map "<url>" > "<out>/raw/map.json"
```

Bucket the returned URLs into page-type slots and pick the best match per slot
(always include the homepage), capped at `--pages` (default 5):

- **homepage** (the input URL, always) — core palette + type + hero CTA
- **pricing / product** — cards, toggles, tables
- **auth / login / signup / contact** — inputs, form fields
- **blog / docs / changelog** — long-form prose type
- **brand / about / design** — often states colors & fonts explicitly; high value

Show the auto-picked list and accept add/remove/replace before crawling (one concise
prompt; skip it if `--pages-list` was given). Skip a slot with no match — never force a
sample. If Firecrawl is down, fall back to playwright link discovery
(`run-code` returning `[...document.links].map(a=>a.href)`) — see
`references/edge-cases.md`.

## Stage 2 — Extract global tokens (the core)

Open the homepage, wait for it to settle, run the bundled extractor. The extractor
(`scripts/extract-tokens.js`) reads noise-filtered `:root` vars, mode-samples computed
styles of visible main-content elements, tags the prominent CTA + first input, and
forces hover/focus — see `references/extraction.md` for what it returns and why.

Intermediate artifacts live under `<out>/raw/` so the two deliverables stay uncluttered
at the folder root — see [Output layout](#output-layout). Create the folders once:

```bash
S=designmd
mkdir -p "<out>/raw/tokens" "<out>/raw/components" "<out>/raw/copy" "<out>/raw/logs" "<out>/screenshots"
playwright-cli -s=$S open "<homepage-url>"
sleep 2                                              # let CSS/fonts settle (FR-ROB.1)
playwright-cli -s=$S run-code "$(cat "$SKILL/scripts/extract-tokens.js")" \
  | bash "$SKILL/scripts/slice-result.sh" > "<out>/raw/tokens/tokens.home.json"
```

`slice-result.sh` strips playwright-cli's markdown wrapper so you get clean JSON.
Read it back and sanity-check `varsTotal` / `vars` count. **If `vars` is thin (the
site isn't Tailwind-ish), relax the filter using `varsExtra`** — see
`references/edge-cases.md` (EC-FW.1 / no-design-system).

### Theme detection (decision 8)

Inspect `themeSignal` in the JSON. A site is **dual-theme** when it exposes a
light/dark switch — a `.dark` class or `data-theme` on `<html>`, or a
`prefers-color-scheme` response. When two themes exist and `--theme` is `auto`/`both`,
extract **once per theme**: toggle, re-settle, re-run the extractor into a second file
(`raw/tokens/tokens.home.dark.json`). Toggle order of preference:

1. click the site's own theme switch, else
2. set the class/attribute directly, e.g. `run-code` doing `document.documentElement.classList.add('dark')` (or `setAttribute('data-theme','dark')`), else
3. emulate `prefers-color-scheme`.

Re-`sleep 2` after toggling. If the alternate theme can't be triggered reliably,
capture the loaded theme only, emit one `DESIGN.md`, and say so in the report.
`--theme light|dark` pins one theme even on a dual-theme site. Full detail:
`references/edge-cases.md` (EC-TH).

## Stage 3 — Harvest components + states (pages 2–N)

For each additional page, **don't re-dump global vars** (they're shared) — sample the
components that page is good for (inputs on auth, cards/toggles on pricing, prose on
blog). Reuse the same extractor; keep each page's JSON:

```bash
playwright-cli -s=$S goto "<page-2-url>"
sleep 2
playwright-cli -s=$S run-code "$(cat "$SKILL/scripts/extract-tokens.js")" \
  | bash "$SKILL/scripts/slice-result.sh" > "<out>/raw/tokens/tokens.<slug>.json"
```

Any bespoke per-page component captures (card/pill candidates, etc.) go to
`<out>/raw/components/`; scraped copy to `<out>/raw/copy/`; per-step logs to `<out>/raw/logs/`.

The extractor already forces `hover` on the CTA and `focus` on the first input and
returns the diffs in `states`. **Keep only states that differ from the base** (FR-ST.3)
when you synthesize. Merge across pages: union the CSS vars (homepage wins the core
palette, flag conflicts); accumulate components, collapsing identical styles.

## Stage 4 — Capture feel (optional, default ON)

One **viewport** screenshot per sampled page (not full-page), into `screenshots/`:

```bash
playwright-cli -s=$S screenshot --filename="<out>/screenshots/<slug>.png"
```

Optionally `firecrawl scrape --only-main-content "<url>"` the homepage + brand page for
copy/tagline, saved to `<out>/raw/copy/`. Screenshots stay at `<out>/screenshots/` (they
feed prose and the user may look at them). Screenshots and copy feed **prose only**
(Overview, Do's & Don'ts) —
never read token values off them. `--no-screenshots` skips this stage.

## Stage 5 — Synthesize the DESIGN file(s)

Read the merged `raw/tokens/*.json` and map them onto the DESIGN.md schema. The full schema,
the token→DESIGN mapping table, and the canonical prose section order live in
**`references/design-md-schema.md` — read it before writing the file.** Key rules:

- Resolve primary-palette colors to **hex** from the computed `rgb(...)` values; keep the
  raw CSS var (`lab()`/`color-mix()` etc.) as a fallback. Never invent a color.
- Name colors by **semantic role** (`--color-accent` → `primary`/`accent`); fold long
  gray ramps into a representative `neutral` set — capture the system, not every shade.
- Use `{path.to.token}` refs inside `components` so values stay DRY and the linter
  validates them. A `primary` color **must** exist or the linter errors.
- **Capture only components the pages actually expose** (decision 10) — never invent a
  `card`/`chip` that isn't there. Track which of the common set (button, input, card,
  link, chip) were found vs. missing for the report.
- Emit prose sections **only where you have real evidence**, always in canonical order,
  never a duplicate `##` heading.

### Dual-theme output (decision 8)

When two themes were captured, emit **`DESIGN.light.md` + `DESIGN.dark.md`** — each a
complete, lint-valid file. `typography`, `rounded`, and `spacing` are **shared**; `colors`
and any color-dependent `components` are **per theme**. A single-theme site emits one
`DESIGN.md`. Prose may note the sibling theme exists.

## Stage 6 — Validate (quality gate)

Lint **every** generated file:

```bash
npx -y @google/design.md lint "<out>/DESIGN.md"
```

- **Auto-fix structural errors only**: wrong section order, broken `{refs}`, missing
  `primary`/required fields.
- **Flag value-level issues** (out-of-gamut color, odd dimension) in the report —
  **never silently delete a captured token** to satisfy the linter (decision 12). The
  user decides on flagged values.
- Surface non-fatal warnings (e.g. WCAG AA contrast) without blocking.
- Re-lint after fixes; the final file must be error-clean. If `npx`/the linter is
  unavailable, write the file anyway and warn "lint skipped" in the report.

---

## Output layout

The two deliverables sit at the folder **root**; everything intermediate is tucked under
`raw/` so the output reads cleanly at a glance.

```
.design_mds/<domain>-YYYYMMDD/        # <domain> = host with dots→hyphens
├── DESIGN.md                         # single-theme   (or DESIGN.light.md + DESIGN.dark.md)
├── screenshots/<slug>.png            # 1 desktop-viewport PNG per page (if enabled)
└── raw/                              # intermediate artifacts (audit trail + re-runs)
    ├── tokens/tokens.<slug>.json     # raw extracted token/computed-style data per page/theme
    ├── components/                   # any bespoke per-page component captures
    ├── copy/                         # scraped page copy (if screenshots stage ran)
    ├── logs/                         # per-step playwright/firecrawl logs
    └── map.json                      # firecrawl page-discovery result
```

The `raw/tokens/*.json` are **always kept** (decision 9) so prose can be regenerated
without re-crawling and any value is traceable. **Conflict guard:** if the folder already
exists for today's domain, **ask** (overwrite / suffix `-2` / abort) — never silently overwrite.

## Final report

Keep it tight and honest. State what was captured, which components were found vs.
missing, which themes, and exactly what the linter said. If a stage degraded (no design
system, Firecrawl down, lint skipped), say so — don't imply full fidelity.

```
DESIGN.light.md + DESIGN.dark.md → .design_mds/cursor-com-20260630/

Sampled 4 pages: home, pricing, sign-in, blog
Themes: light + dark (detected via .dark on <html>)
Captured: 9 colors/theme, 6 type roles, 7 radius, full spacing
Components found: button-primary (+hover), input-field (+focus), card · missing: chip
Lint: ✓ both files clean (1 contrast warning on dark: text-muted on bg — AA borderline)
Screenshots: screenshots/ (4, desktop viewport)
```

## Ask-first rule (standing)

Whenever **<95% confident** about a mapping or an ambiguous choice — which of two colors
is "primary", whether a site even has a real design system, how to resolve a same-day
output conflict — **ask with a recommendation** rather than guess. At minimum, surface
the ambiguity in the report. Any sub-agents you spawn run **sequentially, never in
parallel**, and must carry the Firecrawl + sandbox rules above.

## Bundled files

- `scripts/extract-tokens.js` — the in-browser extractor for `run-code` (noise filter,
  mode sampling, CTA/input detection, hover/focus). The proven nucleus, productionized.
- `scripts/slice-result.sh` — strips playwright-cli's markdown wrapper to clean JSON.
- `references/extraction.md` — what the extractor returns, field by field, and how to
  use `varsExtra` to relax the filter.
- `references/design-md-schema.md` — the DESIGN.md YAML schema, token→DESIGN mapping
  table, and canonical prose order. **Read before Stage 5.**
- `references/edge-cases.md` — no design system, non-Tailwind, dual-theme toggling,
  merge conflicts, crawl/load failures, empty results.
