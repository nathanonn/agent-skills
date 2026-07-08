# Output Bundle Spec (stage 8)

The layout, DESIGN.md additions, COMPONENTS.md/AGENTS.md schemas, and sizing guardrails
the synthesize stage produces. Read this before writing the bundle.

## Folder layout (locked: `.design_systems/`, date-suffixed)

```
.design_systems/<domain>-YYYYMMDD/
├── DESIGN.md                    # lint-clean; or DESIGN.light.md + DESIGN.dark.md
├── components/
│   ├── COMPONENTS.md            # contract layer (schema below)
│   ├── button.html card.html nav-header.html …      # atoms
│   ├── hero-section.html pricing-section.html …     # section patterns
│   └── gallery.html             # every snippet on one page — QA + eval render target
├── tokens/design-tokens.json    # DTCG export — $type from VALUE SHAPE first, name prefix last
│                                #   (Tailwind v4 names font sizes --text-*; a name-first rule
│                                #   mis-typed them as color)
├── eval/
│   ├── fixtures.json            # per-component assertions
│   └── checklists.md            # per-component judge rubrics
├── screenshots/
│   ├── <page>.png               # per sampled page (as in extract-design-md)
│   ├── sections/<pattern>.png   # section crops
│   └── states/<component>-hover.png …   # forced-state crops referenced by COMPONENTS.md
├── AGENTS.md                    # consumption protocol
├── design-system.full.md        # only with --single-file
└── raw/                         # audit trail: tokens/, candidates/, distill-log.json,
                                 #   skipped.json, logs/, map.json — same conventions as sibling
```

Conflict guard (existing folder at target): **ask the user** — overwrite / new dated
sibling / abort. Never silently resolve (standing rule).

## DESIGN.md

- All extract-design-md sections carry over (tokens YAML, canonical prose order).
- The spec's `components:` YAML block still gets the 8 flat surface props per component
  (it lints; it's the *skin* summary).
- **New free-form section `## Component Catalog`** (spec-legal: unknown `##` sections are
  preserved, not errors) — the index that points into the bundle:

```markdown
## Component Catalog

Reference implementations live in `components/`. Consult `AGENTS.md` before building.

| Component | Variants | States | Reference | Contract |
|---|---|---|---|---|
| button | primary, ghost | hover, focus | components/button.html | components/COMPONENTS.md#button |
| hero (section) | — | — | components/hero-section.html | components/COMPONENTS.md#hero |
```

- Size guardrail: DESIGN.md ≤ ~300 lines.

## COMPONENTS.md entry schema (~15 lines/entry)

One `##` entry per catalog item, atoms first, then sections:

```markdown
## button
**File:** button.html · **Confidence:** high · **Evidence:** 47 instances / 4 pages

**Anatomy**
1. root — <a> or <button>; inline-flex; radius var(--radius-full)
2. label — single line, var(--font-sans) 600
3. icon (optional) — 16px, trailing, gap var(--space-2)

**Variants × states**
| Variant | Base | Hover | Focus |
|---|---|---|---|
| primary | bg var(--color-accent), text var(--color-bg) | bg +8% lightness | 2px ring var(--color-accent) |
| ghost | transparent, 1px var(--color-border) | bg var(--color-surface) | same ring |

**Transition:** background-color 150ms ease
**Usage:** one primary per section (main CTA); ghost for secondary actions and nav.
**Screenshots:** ../screenshots/states/button-hover.png
```

Section entries add: **Composition** (which atoms it contains) and **Skeleton** (grid/flex,
columns, gap, max-width). Low-confidence entries carry `**Confidence:** low — verify against
screenshot` visibly.

Contract-accuracy rules (clean-room consumers follow these lines
literally, so errors propagate straight into generated pages):

- Every Composition claim must be **verifiable in the reference snippet's markup**; an
  element seen elsewhere on the source but absent from the snippet is marked optional
  with its provenance (cursor case: pill filter buttons on one feature band).
- Content-dependent elements (billing toggles, testimonial quotes) are marked
  *conditional* — the consumer omits them rather than inventing content to fill them.
- Prose claims about type sizes/weights must match the **measured** reference values;
  never carry over a plausible-sounding generalization the snippet contradicts (cursor
  case: "the h1 carries the display face" vs the measured 26px hero h1 — both
  consumers tripped on it).

## AGENTS.md (~20 lines, fixed template)

The consumption protocol, in imperative voice:

1. Read DESIGN.md fully before writing any UI.
2. Before building any component or section, check the Component Catalog table; if a
   reference file exists, open it and match its anatomy — **never invent anatomy that has a
   reference file**.
3. Use token variables, never literal values that have a token.
4. Snippets are stack-agnostic references, not clone sources — reproduce structure and
   token bindings in the target stack's idiom.
5. States: implement every hover/focus documented in COMPONENTS.md.
6. When creating something with no reference file, compose from existing atoms and the
   nearest section skeleton.

## Dual-theme sites

Shared structure; per-theme DESIGN file; snippets are theme-neutral (token variables) with
per-theme `:root` value blocks — one `components/` set serves both themes.

## `design-system.full.md` (only with `--single-file`)

Flatten order: DESIGN.md → AGENTS.md → COMPONENTS.md → each snippet as a fenced `html`
block → eval/checklists.md. Header notes it is generated and the bundle is canonical.

## Sizing guardrails

DESIGN.md ≤ ~300 lines · snippets ≤ ~150 lines (sections ≤ ~250) · COMPONENTS.md ~15
lines/entry · catalog ≤ `--max-components` atoms (default 12) + ≤8 sections.
