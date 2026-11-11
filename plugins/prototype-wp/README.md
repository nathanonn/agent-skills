# prototype-wp

Prototype a WordPress or WooCommerce plugin spec as a runnable offline browser simulation, to judge it as a product before writing any PHP.

Version 1.0.1 · Works with: Any agent · [SKILL.md](skills/prototype-wp/SKILL.md)

## What it does

**Turn a WordPress plugin spec into a runnable, offline browser simulation you can click through before writing any PHP.**

Answers one question — *does this specified plugin hold together as a product?* — by building the admin screens, the front-end surfaces, and the rules connecting them as a throwaway prototype, so the spec is evaluated as a product rather than read as a document. The build runs in twelve phases and separates every prototype into three layers: a WordPress-generic **spine** (admin bar, menu, notices, list tables, metaboxes, capability gates), an optional host-plugin **overlay** (WooCommerce settings tabs, product editor, storefront), and a DOM-free **engine** holding the spec's own resolution, precedence, and validation rules. The spine and overlay ship with the skill as a copyable asset kit, so only the engine is written fresh. A labelled driver panel makes every baseline state drivable, fixtures encode the spec's worked examples verbatim, and two measured verification passes (engine before any screen exists, then interface) keep the coverage claims honest. Output is a deep-linkable prototype plus a README with a coverage table, honest-limits lists, and a porting note mapping the engine to its intended PHP home.

## Say

- "prototype this WordPress plugin"
- "simulate this WP plugin spec"
- "build a clickable version of this plugin"
- "show me what this settings tab would look like"
- "do these plugin requirements hold together?"

Slash command: `/prototype-wp` (npx or manual install), `/prototype-wp:prototype-wp` (marketplace install).

## Example

```
/prototype-wp Prototype the plugin described in docs/spec.md
```

With a marketplace install, use `/prototype-wp:prototype-wp` instead.

## Requirements

A static file server — one command, any runtime (`python3 -m http.server`, `npx serve`, and `php -S` all work). A browser driver that can evaluate JavaScript in the page and capture a screenshot, for the verification passes. Optionally `ffmpeg`, for the video fixture recipes only. No build step, no dependency install, no Node version requirement.

Shared tools: see [Requirements](../../README.md#requirements).

## Supports

full-coverage mode (every spec section represented) and focused mode for a single named surface — "build me a working WordPress admin settings screen" — plus plain WordPress admin or a WooCommerce overlay, and a spec pre-flight that reports what is missing before anything is built.

## Install

```
/plugin install prototype-wp@nathanonn-agent-skills
npx skills add nathanonn/agent-skills --skill prototype-wp
```

More options: [docs/install.md](../../docs/install.md).

## Credit

Derived from [Matt Pocock's `prototype` skill](https://github.com/mattpocock/skills) (`skills/engineering/prototype/`, MIT licensed), which supplies the framing and the throwaway / one-command / in-memory / no-polish / surface-the-state / capture-it rules. See [NOTICE](../../NOTICE) for details.
