# cli-spec-to-goal

Convert a Node.js CLI tool specification into a Codex /goal-ready bundle with AI-agent-friendly patterns baked in.

Version 1.0.0 · Works with: Any agent, for Codex `/goal` · [SKILL.md](skills/cli-spec-to-goal/SKILL.md)

## What it does

**Convert a Node.js CLI tool spec into a Codex /goal-ready bundle.**

Turn a rough CLI tool idea (even a vague one) into the three files Codex `/goal` needs to drive autonomous implementation: GOAL.md, VERIFY.md, and PROGRESS.md. Bakes in six AI-agent-friendly patterns (--json, stdout/stderr separation, exit codes, structured errors, TTY detection, --dry-run) into every goal. Optionally scaffolds a complete CLI project (bin/, src/, package.json, AGENTS.md, CLAUDE.md).

## Say

- "turn this CLI idea into a /goal bundle"

Slash command: `/cli-spec-to-goal` (npx or manual install), `/cli-spec-to-goal:cli-spec-to-goal` (marketplace install).

## Example

```
/cli-spec-to-goal A CLI tool that converts CSV files to JSON with filtering
```

With a marketplace install, use `/cli-spec-to-goal:cli-spec-to-goal` instead.

## Requirements

Generates goal bundles for the [Codex /goal](https://docs.openai.com/codex) autonomous coding workflow. The generated GOAL.md, VERIFY.md, and PROGRESS.md files are designed to be consumed by an AI agent running Codex `/goal` commands to implement the CLI tool autonomously.

Shared tools: see [Requirements](../../README.md#requirements).

## Supports

JavaScript (default) and TypeScript, commander.js, Vitest, conditional SQLite and cosmiconfig.

## Install

```
/plugin install cli-spec-to-goal@nathanonn-agent-skills
npx skills add nathanonn/agent-skills --skill cli-spec-to-goal
```

More options: [docs/install.md](../../docs/install.md).
