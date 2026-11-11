# webg-spec-to-goal

Convert a web game idea into a complete Codex /goal-ready Phaser 3 project with scaffold, goals-plan, and all goal folders.

Version 1.0.0 · Works with: Any agent, for Codex `/goal` · [SKILL.md](skills/webg-spec-to-goal/SKILL.md)

## What it does

**Convert a web game idea into a complete Codex /goal-ready Phaser 3 project.**

Turn a rough game idea (like "build a Raiden-type game" or "make a card game") into a runnable Phaser 3 scaffold plus every goal folder needed for autonomous implementation. Auto-detects genre (shoot-em-up, card game, platformer, tower defense, puzzle), decomposes into 5-7 goals following a universal build order, and bakes in state bridge verification (window.**GAME_STATE** + Playwright).

## Say

Slash command only. The skill sets `disable-model-invocation: true`, so describing the task in a sentence will not start it.

Slash command: `/webg-spec-to-goal` (npx or manual install), `/webg-spec-to-goal:webg-spec-to-goal` (marketplace install).

## Example

```
/webg-spec-to-goal Build a bullet hell shooter with power-ups
```

With a marketplace install, use `/webg-spec-to-goal:webg-spec-to-goal` instead.

## Requirements

Generates goal bundles for the [Codex /goal](https://docs.openai.com/codex) autonomous coding workflow. The generated scaffold and goal folders are designed to be consumed by an AI agent running sequential Codex `/goal` commands to build the game autonomously.

Shared tools: see [Requirements](../../README.md#requirements).

## Supports

shoot-em-up, card-game, platformer, tower-defense, puzzle genres and their variants. Also supports extending existing games with new features.

## Install

```
/plugin install webg-spec-to-goal@nathanonn-agent-skills
npx skills add nathanonn/agent-skills --skill webg-spec-to-goal
```

More options: [docs/install.md](../../docs/install.md).
