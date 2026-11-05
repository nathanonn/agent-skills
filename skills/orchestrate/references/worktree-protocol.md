# Worktree protocol

How the orchestrator keeps parallel writers apart with git worktrees, then brings
their work back into the main checkout.

**Worktree mode is opt-in.** Use it only when the user asks for worktrees or
isolation in the current request. Without it, writers run one at a time,
unisolated, in the main checkout, and only §3 (preflight) of this file applies.

Scripts live in `${CLAUDE_SKILL_DIR}/scripts/`, the `scripts/` folder next to
SKILL.md. The commands below use that variable as SKILL.md does, but Claude Code
expands it only inside SKILL.md, not in this file or in your shell: use the
folder SKILL.md gave you, or that folder's absolute path (resolve it once and
reuse it). Run them from the main checkout, the repo root where the session
started: they find the repo from the current directory, wherever the skill is
installed. Each prints
`KEY=value` lines and ends with a `RESULT=`, `STOP:` or `REFUSED:` line.

## Contents

1. Why the protocol looks like this
2. One-time repo setup
3. Preflight
4. Dispatch rules
5. Dirty tree before a worktree wave
6. Integrate
7. Conflicts and rollback
8. Cleanup
9. Commits and push
10. Things not yet confirmed live

## 1. Why the protocol looks like this

- **Worktree agents branch from a commit, not from your working tree.** By default
  (`worktree.baseRef: "fresh"`) Claude Code bases them on `origin/<default>`, the
  remote default branch, not your current branch. With `"head"` they start from the
  current local HEAD, including unpushed commits, but **never** from uncommitted
  edits.
- **Sub-agents do not commit.** Their brief forbids it (no hook enforces it, so
  the brief is the only guard). Their work stays uncommitted in the worktree, and
  `worktree-agent-*` branches have no new commits, so merge and cherry-pick have
  nothing to take. Integration is a **patch transfer**. If an agent commits
  anyway, the integrate script warns and includes the commits in the patch.
- **Do not commit inside a worktree from the main session** either: committing
  there would fork the history away from the branch checked out in the main
  checkout.
- **The orchestrator never enters a worktree** (`EnterWorktree`). It has to stay in
  the main checkout to run git there, integrate patches and commit.
- **`isolation: "remote"` is never used.** It would ship the work to a cloud VM,
  outside this checkout, where these scripts cannot integrate it.

## 2. One-time repo setup

Needed only for worktree mode, except the Task tools setting (full setup:
[setup.md](setup.md)):

- Settings: `"worktree": {"baseRef": "head"}` in `.claude/settings.json`,
  `.claude/settings.local.json` or your user settings. Recommended for every
  run: `"env": {"CLAUDE_CODE_ENABLE_TODO_TOOLS": "1"}`.
- `.gitignore`: `.claude/worktrees/`, so worktrees never show as untracked and
  `git add -A` never stages them.
- Optional `.worktreeinclude` at the repo root: gitignored files worktree agents
  need (a local `.env`, tool configs), one path per line. Each path must be
  gitignored, or the list does nothing.

## 3. Preflight

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/preflight.sh"              # default
bash "${CLAUDE_SKILL_DIR}/scripts/preflight.sh" --worktrees  # worktree mode
```

This section applies to every run. The two worktree setup checks (`baseRef`,
`.claude/worktrees/` ignored) warn only with `--worktrees`; without it,
`BASEREF=` is an informational line.

| Output | Meaning | Action |
|---|---|---|
| `STOP: this is a linked worktree` (exit 3) | You drifted into a worktree | `cd` to the main checkout it prints and re-run |
| `WARN: detached HEAD` | Commits made in this run belong to no branch | Tell the user once and suggest `git switch -c <name>`; don't create a branch yourself. Carry on* |
| `TREE=dirty` | Uncommitted edits exist: the user's own (pre-existing) work | Record them as pre-existing (SKILL.md step 1); never `git add -A`: stage and commit explicit paths only (SKILL.md step 8). Fine for read-only agents and unisolated writers. Before a worktree wave, pre-existing unstaged edits to tracked files must be settled first (§5) |
| `WORKTREES=n` > 0 | Leftovers from an earlier run | Ask the user whether to integrate or discard each, then cleanup (§8). A `locked` one may still be running: wait for its notification. No-ask mode: leave them untouched (no integrate, no cleanup, never `--force-unlock`) and list them under **Skipped** |
| `WARN: worktree.baseRef is not "head"` (`--worktrees` only) | Worktree agents would start from the remote default branch | Do not use worktree isolation this run: run writers one at a time, unisolated. Tell the user the settings key is missing* |
| `WARN: .claude/worktrees/ is not ignored` (`--worktrees`, or leftover worktrees exist) | `git add -A` would stage worktrees | Do not `git add -A` in the main checkout; stage explicit paths. Tell the user* |
| `WARN: Claude Code runtime paths are not ignored` | A broad `git add` could stage harness files | Stage and commit explicit paths only (SKILL.md step 8), and never list those runtime paths among them |
| `EFFORT_ENV=<level>` + `WARN: CLAUDE_CODE_EFFORT_LEVEL is set` | It overrides every per-call `effort` | Keep routing as usual, but labels no longer match what runs: say so in the report* |
| `WARN: maxEffortLevel appears in <file>` | Per-call `effort` above the cap is lowered | As above, for tasks routed above the cap* |
| `BASE=<sha>` | The commit worktree agents must start from, and the base for a review diff | Put it in every worktree brief and in task metadata |
| `WARN: no commits yet` + `BASE=none` | The repo has no commit | Worktree mode is unusable: run writers unisolated. The first checkpoint commit creates a BASE |

\* In no-ask mode, "tell the user" / "say so" becomes a line in the final report.

## 4. Dispatch rules (worktree mode)

- **Reads before writes.** Explore and other read-only agents need no isolation and
  can run alongside anything.
- **Parallel writers get `isolation: "worktree"` on the Agent call.** Give each a
  disjoint set of owned files anyway: isolation prevents clobbering, it does not
  prevent conflicting decisions.
- **A lone writer** (no other writer running or about to run in the same wave) may
  still run unisolated in the main checkout, even in worktree mode. It sees your
  uncommitted edits, needs no BASE check and no integration step.
- **Same files, different tasks** → run them in sequence, not in parallel, with the
  first one integrated before the second starts.
- **Wave N+1 depends on wave N's writes and uses worktrees** → the integrated result
  must be committed first (§5), because worktrees only see commits.
- At most 5 agents running at once, counting read-only ones and agents spawned by
  other skills.
- Each worktree brief includes BASE, the main checkout's absolute path (so the
  agent knows what not to edit), the HEAD check and repo-relative paths only. See
  [brief-template.md](brief-template.md).

## 5. Dirty tree before a worktree wave

Worktree agents would not see uncommitted edits. Make a checkpoint commit first,
as SKILL.md step 8 says (with a handoff only if the repo's CLAUDE.md has a
`## Handoffs` section):

1. Commit only this run's paths, taken from `git status --short
   --untracked-files=all` as SKILL.md step 8 says:
   `git update-index --add --remove -- <paths> && git commit -m "<checkpoint message>" -- <paths>`.
   Pre-existing paths left out of the commit are not in BASE either, so
   worktree agents will not see them.
2. Re-run preflight with `--worktrees` and use the new `BASE`.

**Pre-existing unstaged edits to tracked files** (`git diff --name-only`) are
the user's, and they block the wave: `integrate-worktree.sh` refuses them
(exit 5, because its `ROLLBACK` would wipe them). Pre-existing staged edits do
not block: the pathspec commit leaves them out, and `PRE_TREE` keeps them.
Never stage, commit or stash them yourself. Settle the unstaged ones before the
checkpoint above:

- **Normal mode**: ask with AskUserQuestion. Options: the user commits them, or
  sets them aside (stash, copy elsewhere), whichever they prefer and done by
  them; or this wave's writers run unisolated, one at a time, instead. Wait for
  the answer. If the user acted, re-run preflight with `--worktrees`, use the
  new `BASE` and update `metadata.preExisting`.
- **No-ask mode**: run this wave's writers unisolated, one at a time (SKILL.md
  step 4), and log the decision.

Pre-existing untracked files do not block integration either.

Do not work around this yourself with `git stash`, `commit-tree` or `update-ref`: they
hide the edits from you or from the workers, or leave the branch out of step
with what the workers started from.

## 6. Integrate

Take finished agents one at a time, in dependency order (TaskList `blockedBy`).
The completion notification of a worktree agent that changed files carries
`worktreePath:` and `worktreeBranch:` (expected `.claude/worktrees/agent-a…` and
`worktree-agent-a…`). An agent that changed nothing has its worktree removed
automatically.

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/integrate-worktree.sh" <worktreePath> <worktreeBranch> <BASE>
```

Before applying, it prints `PRE_TREE=<sha>` and
`ROLLBACK: git read-tree -u --reset <PRE_TREE>`. Note both in the task metadata
until the task is verified. The rollback restores the index and working tree
exactly as they were before this patch (untracked files are left alone). It is
exact because the script refuses to run while any tracked file has unstaged edits.

| Exit | `RESULT` | Action |
|---|---|---|
| 0 | `applied` | The change is now **staged** in the main checkout. Check the `--stat` matches the task's owned files, read the diff, run the task's verification here, then mark the task completed and clean up |
| 0 | `empty` | The agent changed nothing against BASE. Check its report: was "nothing to change" correct? |
| 3 | `conflicts` | See §7 |
| 4 | `STOP: … does not descend from BASE` | The worktree started from another commit (baseRef missing, or the agent checked out something). Do not integrate; inspect by hand or re-dispatch |
| 5 | `STOP: unresolved conflicts` / `unstaged edits` | Finish the previous conflict, or `git add` this run's own edits (or checkpoint), then re-run. A listed path that is pre-existing (the user's) is never staged to clear this: roll nothing back, settle it as §5 says (normal mode: ask the user; no-ask mode: leave this worktree unintegrated, re-dispatch the task as an unisolated writer and log it) |
| 1 | `failed` / `ERROR` | Read the `git:` lines; often a new file that already exists here. Nothing was applied |

Warnings to act on:

- `WARN: … commit(s) beyond BASE`: a sub-agent managed to commit (it should not).
  The commits are included in the patch; say so in the report.
- `--stat` lists files outside the agent's ownership: read those hunks before
  verifying. If they are unwanted, roll the whole patch back and re-brief the
  agent (or SendMessage it to revert them in its own worktree), then integrate
  again.

**Verification in the main checkout** must exclude `.claude/worktrees/`: test
runners with glob discovery and `grep -r` would otherwise pick up the worktree
copies. If a tool can't exclude it, run that verification after cleanup.

**Re-integrating a resumed agent.** The script always diffs the whole worktree
against BASE, so the second run re-applies everything the agent ever changed. If
that agent's earlier integration was the last one, roll it back with its
`ROLLBACK` line first, then integrate again. If other patches came after it, do
not roll back (that would undo them too); integrate again and re-check the
`--stat` for hunks you had removed by hand, since they come back.

`git apply --3way` stages what it applies, so after several integrations the index
holds the combined result.

## 7. Conflicts and rollback

`integrate-worktree.sh` leaves `<<<<<<< ours` / `>>>>>>> theirs` markers and lists
the files. "ours" is the main checkout (including earlier integrations), "theirs"
is this agent.

All conflict resolution happens in the main session. You hold the plan and the
settled decisions; no agent does. Never hand a conflict to a sub-agent.

1. **Resolve**: edit the markers, `git add <file>` for each resolved file, then run
   the verification of **both** tasks involved, since both changes now share the
   file.
2. **Keep ours for one file only** (the rest of the patch is wanted):
   `git checkout --ours -- <file> && git add <file>`.
3. **Abandon this agent's whole patch** (too big to resolve, or wrong): run the
   `ROLLBACK:` line the script printed, `git read-tree -u --reset <PRE_TREE>`. It
   removes every hunk of this patch, the clean ones too, and restores the exact
   pre-apply state. Then re-dispatch the task in sequence, after a checkpoint
   commit so its new worktree starts from the current state.

Do not abandon a patch with `git checkout --ours` alone: the agent's clean hunks
stay staged and the next checkpoint commit would capture a half-integrated task.

To avoid conflicts next time: disjoint file ownership, and same-file tasks in
sequence.

## 8. Cleanup

After the patch is applied and verified (or rolled back on purpose), and after your
last SendMessage follow-up to that agent:

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/cleanup-worktree.sh" <worktreePath> <worktreeBranch> --patch <PATCH>
```

Every check runs before anything is removed. The script refuses (exit 2, nothing
changed) when:

- the path is not under `<repo>/.claude/worktrees/`;
- `git worktree list --porcelain` shows the path on a different branch, or the
  path is gone but the branch is checked out in another worktree. Pair each
  `worktreePath` with the `worktreeBranch` from the **same** completion; with
  several agents finishing together a crossed pair would delete unintegrated work;
- the worktree is **locked**. Claude Code holds that lock while the agent runs, so
  wait for its completion notification. Only for a leftover from a dead session
  (closed or crashed), re-run with `--force-unlock`;
- the branch is the default branch, `main`/`master`, the branch checked out here,
  or not named `worktree-*` (override the last one with `--any-branch` only if you
  are sure).

Then it removes the worktree, deletes the local branch, prunes metadata and deletes
the patch (`--patch` covers the case where `TMPDIR` differed between calls). At the
end of the run, `git worktree list` should show only the main checkout.

## 9. Commits and push

Commit only at checkpoints, on the current branch (see SKILL.md step 8). Never
push unless the user asked for a push in the current request; then push only the
current branch (`git push -u origin HEAD`). Never push `worktree-agent-*`
branches and never `git push origin --delete`: these branches are local, and
cleanup deletes them.

## 10. Things not yet confirmed live

These come from docs and binary inspection, not from a live run of this skill.
React to what you actually see:

- A worktree agent reports a HEAD different from BASE → `baseRef: head` did not
  take effect. Stop using worktrees this run, run writers sequentially and
  unisolated, and tell the user (no-ask mode: a report line).
- The completion lacks `worktreePath` / `worktreeBranch` → find them with
  `git worktree list --porcelain` (paths under `.claude/worktrees/`).
- The Agent tool has no `effort` parameter (Claude Code older than v2.1.292) →
  omit it, keep the intended effort in the task label, and say in the report that
  effort was not applied.
- `/tasks` shows an effort different from the label → `CLAUDE_CODE_EFFORT_LEVEL`
  or `maxEffortLevel` is in force (or Explore ignores per-call effort). Report
  the effort that ran.
- A worktree agent lacks a gitignored file it needs (`.worktreeinclude` missing
  or did not copy it) → it may read that file from the main checkout; the brief
  allows reading there. Report the gap.
- A resumed (SendMessage) worktree agent seems to work outside its worktree →
  stop resuming worktree agents; re-brief a fresh one instead.
- After the session was closed or crashed, an `in_progress` agent never reports →
  it died with the session. Compare `git worktree list` with the task metadata and
  re-dispatch (SKILL.md "After a compaction or resume").
