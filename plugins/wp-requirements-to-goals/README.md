# wp-requirements-to-goals

Convert a full WordPress plugin requirements.md into a complete Codex /goal-ready project: goals-plan.md, root scaffold, and a layered goals/ tree (foundation, per-US, non-US, integration).

Version 1.0.0 · Works with: Any agent, for Codex `/goal` · [SKILL.md](skills/wp-requirements-to-goals/SKILL.md)

## What it does

**Convert a full WordPress plugin requirements.md into a complete Codex /goal-ready project.**

The full-workflow counterpart to `wp-spec-to-goal`: where that skill handles a single vague spec, this one takes a complete `requirements.md` (multiple user stories, edge cases, settings catalog, cross-cutting features) and decomposes it into an entire multi-goal project — a `goals-plan.md`, a root scaffold (.wp-env.json, package.json, AGENTS.md, plugin bootstrap, run-goals.sh, protocols), and a layered `goals/` tree (foundation → per-user-story → non-US features → integration). Probes the repo to skip clarifications the filesystem already answers, asks the rest in ≤3 rounds, and supports phased or one-shot runs plus a resume and an extend mode.

## Say

Slash command only. The skill sets `disable-model-invocation: true`, so describing the task in a sentence will not start it.

Slash command: `/wp-requirements-to-goals` (npx or manual install), `/wp-requirements-to-goals:wp-requirements-to-goals` (marketplace install).

## Example

```
/wp-requirements-to-goals Build the plugin described in requirements.md
```

With a marketplace install, use `/wp-requirements-to-goals:wp-requirements-to-goals` instead.

## Requirements

Generates goal bundles for the [Codex /goal](https://docs.openai.com/codex) autonomous coding workflow. The generated project and goal folders are designed to be consumed by an AI agent running sequential Codex `/goal` commands to implement the WordPress plugin autonomously.

**Also requires [playwright-cli](https://github.com/microsoft/playwright-cli):** every goal's `VERIFY.md` performs browser-visible verification through playwright-cli. Install it once with `npm install -g @playwright/cli@latest` then `playwright-cli install --skills` (needs Node.js 18+). Phase 2 also bundles a host-installed playwright-cli skill into the generated project's `.codex/skills/`.

Shared tools: see [Requirements](../../README.md#requirements).

## Supports

Multi-goal full requirements, phased (checkpoint after plan) or one-shot mode, resume from an existing goals-plan.md, extend mode for completed projects, wp-env + Playwright + wp-eval verification.

## Install

```
/plugin install wp-requirements-to-goals@nathanonn-agent-skills
npx skills add nathanonn/agent-skills --skill wp-requirements-to-goals
```

More options: [docs/install.md](../../docs/install.md).
