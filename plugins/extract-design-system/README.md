# extract-design-system

Extract a website's tokens and component catalog (variants, states, section patterns) into a bundle a coding agent uses to build pages native to that brand.

Version 1.0.1 · Works with: Any agent · [SKILL.md](skills/extract-design-system/SKILL.md)

## What it does

**Extract a website's full design system — tokens *and* a component catalog — as a bundle for building native-looking pages.**

The superset of `extract-design-md`. Where that skill hands you a token-only `DESIGN.md`, this one captures the whole system a coding agent needs to generate pages that reuse the source's *actual* components: a `DESIGN.md`, a component catalog (per-component anatomy, variants, and hover/focus states), reference snippets, section patterns, DTCG design tokens, and an emitted eval harness. It samples real pages with playwright-cli, reads CSS custom properties + computed styles, and packages everything under `.design_systems/<domain>-YYYYMMDD/`. This fixes the "same skin, different skeletons" failure of token-only extraction — new pages come out with the same buttons, cards, and sections as the source, not just the same colors and fonts.

**You don't run `extract-design-md` first.** This skill is self-contained — it extracts the tokens and produces the `DESIGN.md` itself, then continues into the catalog. Just point it at a URL. (The optional `--components-only` flag can reuse a prior same-domain bundle's tokens + `DESIGN.md` to skip re-extraction, but that's an optimization, not a required step.)

## Say

- "clone the design system"
- "extract components from &lt;url&gt;"
- "make new pages that look like &lt;site&gt;"
- "same buttons/cards/sections as &lt;site&gt;"

Slash command: `/extract-design-system` (npx or manual install), `/extract-design-system:extract-design-system` (marketplace install).

## Example

```
/extract-design-system https://linear.app
```

With a marketplace install, use `/extract-design-system:extract-design-system` instead.

## Requirements

[playwright-cli](https://github.com/microsoft/playwright-cli) on `PATH` (`npm install -g @playwright/cli@latest` then `playwright-cli install --skills`, needs Node.js 18+), a reachable [Firecrawl](https://github.com/mendableai/firecrawl) instance for page discovery (falls back to playwright link discovery if absent), and `npx` for the on-demand `@google/design.md` linter (skipped gracefully if unavailable).

Shared tools: see [Requirements](../../README.md#requirements).

## Supports

full-bundle output (DESIGN.md + component catalog + reference snippets + section patterns + DTCG tokens + eval harness), single- or dual-theme sites, Tailwind and non-Tailwind token systems, auto page-selection with override, and graceful fallbacks.

## Install

```
/plugin install extract-design-system@nathanonn-agent-skills
npx skills add nathanonn/agent-skills --skill extract-design-system
```

More options: [docs/install.md](../../docs/install.md).
