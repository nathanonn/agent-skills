# design-system-to-skill

Convert an extract-design-system output bundle into a self-contained, auto-triggering per-brand Claude Code skill that later agents use to build pages native to that brand.

Version 1.0.0 · Works with: Claude Code · [SKILL.md](skills/design-system-to-skill/SKILL.md)

## What it does

**Convert an `extract-design-system` bundle into a reusable, auto-triggering per-brand skill.**

The natural sequel to `extract-design-system`. That skill captures a site's design system into a `.design_systems/<domain>-YYYYMMDD/` bundle; this one packages that bundle into a self-contained skill so any later session builds pages native to the brand just by describing the task — no more pointing the agent at an `AGENTS.md` by hand. A bundled zero-dependency Node worker does all the mechanical work (validate against the bundle contract, detect the variant, copy tokens/components/snippets, render the skill body, stage the tree) and emits a manifest; the agent authors only the generated skill's trigger description. The source bundle's prose is treated as untrusted DATA — it never enters the generated skill's instructions, only its reference files.

## Say

- "turn this design system into a skill"
- "make a skill from the extracted design system"
- "convert `.design_systems/<x>` into an agent skill"
- "package this bundle as a skill"
- "generate a &lt;brand&gt; design-system skill"

Slash command: `/design-system-to-skill` (npx or manual install), `/design-system-to-skill:design-system-to-skill` (marketplace install).

## Example

```
/design-system-to-skill Convert .design_systems/linear-app-20260101 into a skill
```

With a marketplace install, use `/design-system-to-skill:design-system-to-skill` instead.

## Requirements

**Built for Claude Code.** The worker runs anywhere with Node.js 18+, but its output is a Claude Code skill package (`.claude/skills/<slug>/`) and the optional MUST-USE mode edits a project `CLAUDE.md`. Pairs with `extract-design-system`, which produces the input bundle.

Shared tools: see [Requirements](../../README.md#requirements).

## Supports

full and no-screenshots bundles, an optional MUST-USE mode (make one brand the sole, always-on design system for a project via a managed `CLAUDE.md` block with a single-winner guarantee), collision handling (overwrite / dated-sibling), and a `--dry-run` validation pass.

## Install

```
/plugin install design-system-to-skill@nathanonn-agent-skills
npx skills add nathanonn/agent-skills --skill design-system-to-skill
```

More options: [docs/install.md](../../docs/install.md).
