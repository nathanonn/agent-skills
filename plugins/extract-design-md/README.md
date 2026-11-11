# extract-design-md

Extract a website's design system into a DESIGN.md file (google-labs-code format): colors, typography, spacing, components and brand feel, checked by the official linter.

Version 1.0.1 · Works with: Any agent · [SKILL.md](skills/extract-design-md/SKILL.md)

## What it does

**Extract a website's design system into a DESIGN.md file.**

Point it at a live URL and it compiles a [DESIGN.md](https://github.com/google-labs-code/design.md) — YAML design tokens (colors, typography, `rounded`/`spacing` scales, components) plus prose in canonical section order — good enough to hand a coding agent so it builds new UI matching the source site. Instead of eyeballing a screenshot, it samples 3–5 real pages with playwright-cli and reads each one's CSS custom properties + computed styles (precise and cheap), takes light screenshots for the prose only, detects light/dark themes, and validates every file with the official `@google/design.md` linter as a quality gate.

## Say

- "extract the design system from &lt;url&gt;"
- "make a DESIGN.md from &lt;site&gt;"
- "get the design tokens off &lt;site&gt;"
- "I want my UI to look like &lt;site&gt;"

Slash command: `/extract-design-md` (npx or manual install), `/extract-design-md:extract-design-md` (marketplace install).

## Example

```
/extract-design-md https://linear.app
```

With a marketplace install, use `/extract-design-md:extract-design-md` instead.

## Requirements

[playwright-cli](https://github.com/microsoft/playwright-cli) on `PATH` (`npm install -g @playwright/cli@latest` then `playwright-cli install --skills`, needs Node.js 18+), a reachable [Firecrawl](https://github.com/mendableai/firecrawl) instance for page discovery (falls back to playwright link discovery if absent), and `npx` for the on-demand `@google/design.md` linter (skipped gracefully if unavailable).

Shared tools: see [Requirements](../../README.md#requirements).

## Supports

single- or dual-theme sites (emits `DESIGN.light.md` + `DESIGN.dark.md` when both exist), Tailwind and non-Tailwind token systems, auto page-selection with override, and graceful fallbacks (no design system, Firecrawl down, lint skipped).

## Install

```
/plugin install extract-design-md@nathanonn-agent-skills
npx skills add nathanonn/agent-skills --skill extract-design-md
```

More options: [docs/install.md](../../docs/install.md).
