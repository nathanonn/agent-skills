# orchestrate

Run the main Claude Code session as an orchestrator: a task list, sub-agents routed by model and effort, and verified checkpoint commits.

Version 1.1.0 · Works with: Claude Code · [SKILL.md](skills/orchestrate/SKILL.md)

## What it does

**Run the main Claude Code session as an orchestrator that delegates to sub-agents.**

Builds a task list for a multi-step request, then routes each task to a sub-agent with an explicit model and effort (Sonnet, Opus or Haiku; Fable only with your say-so). Up to 5 read-only agents run in parallel, and agents that edit files run one at a time in the main checkout. Git worktrees are used only when you ask for them. The orchestrator verifies the work, commits checkpoints locally on the current branch, and never pushes unless you ask. Say you do not want to be asked questions and it runs in no-ask mode.

## Say

- "orchestrate this"
- "delegate this"
- "use sub-agents"
- "fan out"
- "work in parallel"

Slash command: `/orchestrate` (npx or manual install), `/orchestrate:orchestrate` (marketplace install).

## Example

```
/orchestrate Build the feature described in docs/spec.md with sub-agents
```

With a marketplace install, use `/orchestrate:orchestrate` instead.

## Setup

Claude Code specific in behavior (it relies on the Agent tool and per-agent model routing), even though it installs through `npx skills` too. Setting `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` is recommended. Install only one copy: a second copy (the plugin loads as `orchestrate:orchestrate`) can trigger instead, with different rules. An optional `CLAUDE.md` section makes it load for every non-trivial request in a repo. Details are in [`references/setup.md`](skills/orchestrate/references/setup.md) inside the skill.

## Requirements

Shared tools: see [Requirements](../../README.md#requirements).

## Install

```
/plugin install orchestrate@nathanonn-agent-skills
npx skills add nathanonn/agent-skills --skill orchestrate
```

More options: [docs/install.md](../../docs/install.md).

## Credit

The reviewer/verifier role split and the severity and confidence grading of review findings were adapted, in our own wording, from Ray Amjad's [task-lifecycle skill](https://github.com/ray-amjad/skills/tree/main/skills/task-lifecycle) (MIT).
