# handoff-doc

Write or update a session handoff doc so a future session (Claude or human) can resume work without re-reading the whole transcript.

Version 1.0.0 · Works with: Any agent · [SKILL.md](skills/handoff-doc/SKILL.md)

## What it does

**Write a session handoff doc so the next session can pick up cold.**

Distills the current session into one tight handoff doc — what was done, where things live, what's verified, and what's still open — so a future session (Claude or human) can resume without re-reading the whole transcript. You give the destination path; the skill supplies the content. It matches the destination folder's existing filename convention, asks before overwriting an existing handoff (overwrite / append / sequel), flags filename-date typos, and stays honest about what was *not* verified.

This skill is also bundled inside the [context-alert](../context-alert/README.md) plugin.

## Say

- "write a handoff"
- "create a handoff doc"
- "update the handoff"
- "hand this off"
- point at a path and say to capture where things stand

Slash command: `/handoff-doc` (npx or manual install), `/handoff-doc:handoff-doc` (marketplace install).

## Example

```
/handoff-doc Write a handoff to notes/handoff/20260623_01_auth-refactor.md
```

With a marketplace install, use `/handoff-doc:handoff-doc` instead.

## Requirements

Shared tools: see [Requirements](../../README.md#requirements).

## Install

```
/plugin install handoff-doc@nathanonn-agent-skills
npx skills add nathanonn/agent-skills --skill handoff-doc
```

More options: [docs/install.md](../../docs/install.md).
