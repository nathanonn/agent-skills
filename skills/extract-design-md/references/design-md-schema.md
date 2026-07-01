# DESIGN.md schema + token mapping

The target format is [google-labs-code/design.md](https://github.com/google-labs-code/design.md):
a single file with **YAML front matter** (machine-readable tokens — the normative values)
and a **Markdown body** (prose rationale in fixed section order). Read this before Stage 5.

## YAML token schema

```yaml
version: alpha            # optional
name: <design system / brand name>
description: <optional one-liner>
colors:
  <name>: <CSS color>      # primary, secondary, accent, neutral, surface,
                           # on-surface (text), success, error, warning…
typography:
  <name>:                  # h1, h2, body-md, label-caps, headline-lg…
    fontFamily: <string>
    fontSize: <dimension>          # px | em | rem
    fontWeight: <number>
    lineHeight: <dimension|number>
    letterSpacing: <dimension>
    fontFeature: <string>          # optional
    fontVariation: <string>        # optional
rounded:
  <level>: <dimension>     # sm, md, lg, full…
spacing:
  <level>: <dimension|number>      # xs, sm, md, lg, xl, gutter, margin…
components:
  <component>:             # button-primary, input-field, card, chip…
    backgroundColor: <color|ref>
    textColor: <color|ref>
    typography: <ref>
    rounded: <ref>
    padding: <dimension>
    size|height|width: <dimension>
```

- **Token references** use `{path.to.token}` — e.g. `backgroundColor: "{colors.primary}"`,
  `typography: "{typography.label-md}"`. Keeps values DRY and lets the linter validate them.
- **Color formats accepted:** any valid CSS color — hex, named, `rgb()/hsl()`, wide-gamut
  `oklch()/lab()`, and `color-mix()`. (cursor.com uses `lab()`/`color-mix()` heavily.)
- **Dimensions:** number + `px | em | rem`.

## Token → DESIGN.md mapping

| Extracted source (in `raw/tokens/*.json`) | DESIGN.md target |
|---|---|
| `--color-*` vars + resolved hex from computed `rgb()` | `colors:` (by role: primary/accent, surface, on-surface/text, success, error, warning) |
| `--font-sans / -mono / -serif`, computed `fontFamily` | `typography.<role>.fontFamily` |
| `--text-*` + line-height pairs; computed h1/h2/body sizes | `typography.<role>.fontSize` / `lineHeight` |
| `--font-weight-*`, computed `fontWeight` | `typography.<role>.fontWeight` |
| `--tracking-*`, computed `letterSpacing` | `typography.<role>.letterSpacing` |
| `--radius-*`, computed `borderRadius` | `rounded.<level>` |
| `--spacing-*`, computed `padding`/gaps | `spacing.<level>` |
| computed styles + `states` of button/input/card | `components.<name>` (+ `-hover`/`-focus` variants) |
| computed `boxShadow` | feeds **Elevation & Depth** prose + any `shadow` tokens |

### Mapping rules

- **MAP.1 — semantic naming.** Name colors by role inferred from the var name
  (`--color-accent` → `accent`/`primary`). Don't emit every raw shade; fold long
  gray/slate ramps into a representative `neutral` set. Capture the *system*.
- **MAP.2 — refs.** Use `{path.to.token}` inside `components`, e.g.
  `backgroundColor: "{colors.primary}"`.
- **MAP.3 — pill radius.** A computed `border-radius` that resolves to a huge px value
  (e.g. `3.35e+07px`, Tailwind `rounded-full`) → `rounded.full`, not the literal number.
- **MAP.4 — required primary.** A `primary` (or clearly-mapped accent) color must exist
  or the linter errors.
- **MAP.5 — capture what exists.** Emit only components the pages actually expose; never
  invent a `card`/`chip`. Report which of the common set (button, input, card, link, chip)
  were found vs. missing.
- **MAP.6 — shared vs. theme-specific (dual-theme).** `typography`, `rounded`, `spacing`
  are shared across the light/dark files; `colors` and color-dependent `components` are
  emitted per theme.

### Resolving colors to hex

The extractor returns computed colors as `rgb(...)` on the sampled elements — hex-ify those
for the primary palette (`rgb(245, 78, 0)` → `#f54e00`). Keep the original CSS-var value
(`lab()`, `color-mix(in oklab, …)`) as a `raw`/fallback note where it carries wide-gamut
intent. Never invent a color the page doesn't use.

## Prose sections — canonical order

Emit only sections you have real evidence for, **always in this order**, never a duplicate
heading. (Sections may be omitted; those present must be ordered; duplicates are a hard
linter error.)

| # | Section | Purpose | Best evidence |
|---|---|---|---|
| 1 | **Overview** | Brand personality, audience, emotional "feel" | screenshots + page copy |
| 2 | **Colors** | Palette rationale, role of each color | tokens + screenshot |
| 3 | **Typography** | Font roles, weights, voice | tokens + computed styles |
| 4 | **Layout** | Grid model, spacing rhythm, containment | computed layout + screenshot |
| 5 | **Elevation & Depth** | Shadows vs. tonal layers vs. borders | computed `boxShadow` + screenshot |
| 6 | **Shapes** | Corner-radius language, sharp vs. soft | `rounded` tokens |
| 7 | **Components** | Per-component styling + states | computed styles of real elements |
| 8 | **Do's and Don'ts** | Guardrails | inferred from all evidence |

Write prose that reads like a designer wrote it — the "feel," not a data dump.

## The linter (Stage 6)

`npx -y @google/design.md lint <file>` returns JSON findings. The CLI also offers
`diff` (compare two files), `export` (Tailwind v3/v4 or W3C DTCG `tokens.json`), and
`spec` (print the spec — handy to inject into the generation context). Use `lint` as the
quality gate; auto-fix structural issues, flag value issues, never delete a captured token.
