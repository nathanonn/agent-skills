# Setup

Everything needed to install and configure this skill, with nothing else at
hand. The skill folder is self-contained: `SKILL.md`, `references/` and
`scripts/`. The scripts find the repo from the current directory, so they work
wherever the folder is installed.

## Contents

1. Install
2. Install only one copy
3. Settings
4. `.gitignore`
5. Optional: always-on in a repo
6. Optional: handoffs
7. Check after installing

## 1. Install

Pick one:

| Option | Where the skill ends up | Scope |
|---|---|---|
| Claude Code marketplace plugin | the plugin cache, managed by Claude Code | every repo, for your user |
| `npx skills` | the skills folder you pick (`.claude/skills/`, `~/.claude/skills/`, or another agent's skills folder) | that folder's scope |
| Manual copy into a repo | `.claude/skills/orchestrate/` in that repo | that repo |
| Manual copy for your user | `~/.claude/skills/orchestrate/` | every repo, for your user |

For a manual copy, copy the whole folder (keep `scripts/` next to `SKILL.md`)
and keep the scripts executable:

```bash
mkdir -p <skills-folder>/orchestrate
rsync -a --delete <this-folder>/ <skills-folder>/orchestrate/
chmod 755 <skills-folder>/orchestrate/scripts/*.sh
```

The skill is trigger-only: it loads when you ask to orchestrate, delegate, use
sub-agents, fan out or work in parallel. To make it load for every non-trivial
request in a repo, see §5.

## 2. Install only one copy

Keep one copy of this skill across all scopes: plugin, user level
(`~/.claude/skills/`) and project level (`.claude/skills/` in the repo). A
user-level and a project-level skill named `orchestrate` shadow each other, so
only one of them loads. A plugin copy does not shadow them: plugin skills are
namespaced by their plugin, so it loads as `<plugin>:orchestrate` (for example
`/orchestrate:orchestrate`) next to a plain `orchestrate`. Both then load,
either can trigger, and they may carry different rules, so you cannot tell
which rules a run followed. Remove the old copy before installing another way.

## 3. Settings

Merge these keys into `.claude/settings.json`, `.claude/settings.local.json` or
your user settings (`~/.claude/settings.json`):

| Key | Value | When |
|---|---|---|
| `env.CLAUDE_CODE_ENABLE_TODO_TOOLS` | `"1"` | Recommended. Turns on TaskCreate/TaskGet/TaskList/TaskUpdate for 5.x models. Without it the orchestrator keeps the task list in its replies, and no-ask mode does not survive a compaction. |
| `worktree.baseRef` | `"head"` | Only for worktree mode. Worktree agents then start from your current HEAD instead of the remote default branch. Preflight reads managed settings, then `.claude/settings.local.json`, then `.claude/settings.json`, then `${CLAUDE_CONFIG_DIR:-~/.claude}/settings.json`. |

```json
{
  "env": { "CLAUDE_CODE_ENABLE_TODO_TOOLS": "1" },
  "worktree": { "baseRef": "head" }
}
```

Do not add `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` (the 5-agent cap is a skill
rule only) or `CLAUDE_CODE_EFFORT_LEVEL` (it would override every per-call
effort; preflight warns if it is set).

## 4. `.gitignore`

Append the lines the repo's `.gitignore` does not already have:

```gitignore
# Claude Code sub-agent worktrees (orchestrate skill, worktree mode)
.claude/worktrees/

# Claude Code per-user local settings
.claude/settings.local.json

# Claude Code runtime state
.claude/agent-registry.json
.claude/checkpoints/
.claude/mailbox/
.claude/scheduled_tasks.lock
```

`.claude/worktrees/` matters for worktree mode: worktrees then never show as
untracked, and `git add -A` never stages them. The other lines keep Claude Code
runtime files out of checkpoint commits.

Optional, worktree mode only: worktree agents get a fresh checkout without
gitignored files. If they need some (a local `.env`, a tool config), list them
in `.worktreeinclude` at the repo root, one path per line. Each path must be
gitignored, or the list does nothing.

## 5. Optional: always-on in a repo

Append this section to a repo's `CLAUDE.md` to make the skill load for every
non-trivial request in that repo, not only when you ask for orchestration. The
exemptions it lists (a quick lookup, a one-line edit, git and commit work) are
the same ones the skill uses. Leave it out to keep the skill trigger-only.

```markdown
## Orchestration

- **Main session only.** Sub-agents ignore this section: do your brief, don't orchestrate.
- Load the `orchestrate` skill for every request and follow it (task list, routed
  sub-agents with explicit model and effort, up to 5 read-only agents at once,
  writers one at a time in the main checkout). The only exemptions: a single
  quick lookup, a one-line edit, and git, integration, handoff and commit work,
  which the main session does itself.
- Git worktrees (`isolation: "worktree"`) only when the request asks for
  worktrees or isolation.
- `model: "fable"` is opt-in, never a default: use it only when the user asks for
  it by name, or after Opus has missed twice on the same task and the user
  approves it when asked. Never in a run where the request says not to ask,
  even if it names Fable.
- Commit verified work at checkpoints on the current branch (any branch). Never
  push unless the request asks for it. Sub-agents never commit.
```

## 6. Optional: handoffs

The skill writes a handoff file only when the repo's `CLAUDE.md` has a
`## Handoffs` section. At each checkpoint commit it writes the handoff that
section asks for (with a `handoff-doc` skill if one is installed, else by hand)
and stages it in the same commit. After a compaction or resume it reads the
latest one. Without the section it writes no handoff file, and the commit
messages carry the record.

The section's content is up to you. Say where handoffs go, how they are named
and what they cover, for example:

```markdown
## Handoffs

- Write a handoff at each checkpoint commit to `handoffs/NN-<topic>.md`,
  at the next free number. Never overwrite an existing one.
- Cover what was done, what is left, open decisions and how to verify.
```

## 7. Check after installing

From the repo's main checkout, run the preflight script from the installed
skill folder (`<skill-dir>` is wherever the skill landed in §1):

```bash
bash <skill-dir>/scripts/preflight.sh              # exit 0 on any branch
bash <skill-dir>/scripts/preflight.sh --worktrees  # 0 warnings once worktree mode is set up
```

New skills load at session start, so start a fresh Claude Code session in the
repo to try the skill.
