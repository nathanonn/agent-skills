# validate-block-markup

Validate, diagnose or repair serialized WordPress block markup against the core block library in Node.js, with separate verdicts for validity and portability.

Version 1.0.1 · Works with: Any agent · [SKILL.md](skills/validate-block-markup/SKILL.md)

## What it does

**Check serialized WordPress block markup against the core block library running in Node.js — no WordPress required.**

Answers two separate questions about a `<!-- wp:... -->` blob: does it parse and match the core save implementations (the thing that produces "Attempt Block Recovery" in the editor when it doesn't), and would it survive being moved to a different site. Structural validity and cross-site portability are reported as separate verdicts, so theme-dependent styles and site-specific IDs surface even when the markup is structurally fine. A bundled CLI runs the real `@wordpress/blocks` and `@wordpress/block-library` packages under jsdom and prints a JSON report per input source — errors, warnings, an explicit `notChecked` list, and the canonical serialization when parse-then-serialize changed the input. Verdicts are pinned to the core blocks shipped with WordPress 7.0.2 and always name that snapshot. Review and repair are separate modes: in review mode it never edits the markup.

## Say

- "validate this block markup"
- "is this Gutenberg markup valid"
- "why does this block say invalid content"
- "check this before I paste it into the Code Editor"

Slash command: `/validate-block-markup` (npx or manual install), `/validate-block-markup:validate-block-markup` (marketplace install).

## Example

```
/validate-block-markup Validate the block markup in content/hero.html
```

With a marketplace install, use `/validate-block-markup:validate-block-markup` instead.

## Requirements

Node.js 20.10+ with `npm` on `PATH`. No WordPress, PHP, Docker, wp-env, or browser. The first validation run downloads and installs the pinned runtime — about 350 npm packages, roughly 545 MB, around 25 seconds, and it needs npm registry access; later runs are offline and instant, and `--help` / `--version` answer without installing anything. The install lands in the skill's own directory and never touches your project's `package.json`, lockfile, or `node_modules` — but with `npx skills add` the skill sits inside your repository, so those bytes land in your tree. The skill ships a `.gitignore` that keeps them out of git, and restores it before installing if an install path dropped it.

Shared tools: see [Requirements](../../README.md#requirements).

## Supports

files, directories of `.html`, and stdin in one invocation; JSON-only stdout with diagnostics on stderr; exit codes for pass / findings / usage error.

## Limits

Scope is standalone core-block markup — site-specific, theme-specific, dynamic, plugin, and third-party block content are out of scope.

## Install

```
/plugin install validate-block-markup@nathanonn-agent-skills
npx skills add nathanonn/agent-skills --skill validate-block-markup
```

More options: [docs/install.md](../../docs/install.md).
