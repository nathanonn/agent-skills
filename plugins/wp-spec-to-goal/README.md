# wp-spec-to-goal

Convert a WordPress plugin or feature idea into a Codex /goal-ready bundle with wp-env + Playwright verification.

Version 1.0.0 · Works with: Any agent, for Codex `/goal` · [SKILL.md](skills/wp-spec-to-goal/SKILL.md)

## What it does

**Convert a WordPress plugin idea into a Codex /goal-ready bundle.**

Turn a rough WordPress plugin or feature idea into the three files Codex `/goal` needs: GOAL.md, VERIFY.md, and PROGRESS.md with wp-env + Playwright + wp-eval verification baked in. Optionally scaffolds a missing plugin folder, .wp-env.json, package.json, and AGENTS.md.

## Say

Slash command only. The skill sets `disable-model-invocation: true`, so describing the task in a sentence will not start it.

Slash command: `/wp-spec-to-goal` (npx or manual install), `/wp-spec-to-goal:wp-spec-to-goal` (marketplace install).

## Example

```
/wp-spec-to-goal A WordPress plugin that adds custom post type for recipes
```

With a marketplace install, use `/wp-spec-to-goal:wp-spec-to-goal` instead.

## Requirements

Generates goal bundles for the [Codex /goal](https://docs.openai.com/codex) autonomous coding workflow. The generated goal trio is designed to be consumed by an AI agent running Codex `/goal` commands to implement the WordPress plugin autonomously.

**Also requires [playwright-cli](https://github.com/microsoft/playwright-cli):** the generated `VERIFY.md` performs browser-visible verification through playwright-cli. Install it once with `npm install -g @playwright/cli@latest` then `playwright-cli install --skills` (needs Node.js 18+).

Shared tools: see [Requirements](../../README.md#requirements).

## Supports

New plugins and features for existing plugins, wp-env development environment, Playwright browser testing, wp-eval PHP verification.

## Install

```
/plugin install wp-spec-to-goal@nathanonn-agent-skills
npx skills add nathanonn/agent-skills --skill wp-spec-to-goal
```

More options: [docs/install.md](../../docs/install.md).
