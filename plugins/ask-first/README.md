# ask-first

Ask clarifying questions before executing tasks. Reaches 95% confidence through structured Q&A, then executes.

Version 1.0.1 · Works with: Any agent · [SKILL.md](skills/ask-first/SKILL.md)

## What it does

**Ask clarifying questions before executing tasks.**

Turns Claude into a thoughtful collaborator that asks the right questions before jumping into work. Uses structured Q&A batches (2-4 questions per round with recommendations) to reach 95% confidence, then executes. Prevents assumptions, surfaces ambiguities, and respects your time by only asking what actually matters.

## Say

- "ask me questions first"
- "clarify before doing"
- prefix tasks with "ask:"

Slash command: `/ask-first` (npx or manual install), `/ask-first:ask-first` (marketplace install).

## Example

```
/ask-first Build a REST API for user authentication
```

With a marketplace install, use `/ask-first:ask-first` instead.

## Requirements

Shared tools: see [Requirements](../../README.md#requirements).

## Install

```
/plugin install ask-first@nathanonn-agent-skills
npx skills add nathanonn/agent-skills --skill ask-first
```

More options: [docs/install.md](../../docs/install.md).
