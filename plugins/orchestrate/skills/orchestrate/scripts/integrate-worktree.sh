#!/usr/bin/env bash
# integrate-worktree.sh - orchestrate skill, step 7.
# Moves one sub-agent's UNCOMMITTED work from its worktree into the current
# (main) checkout by patch transfer: stage in the worktree, diff against BASE,
# `git apply --3way` here. Never commits, never pushes, never switches branch.
#
# Exit codes:
#   0  applied (result is staged in this checkout), or nothing to apply
#   1  error / bad usage / apply failed without conflict markers
#   3  applied with CONFLICTS (files listed; resolve, then git add them)
#   4  STOP: worktree HEAD does not descend from BASE (wrong base commit)
#   5  STOP: this checkout is not ready (unmerged paths, or unstaged edits
#      to tracked files)
#
# Before applying it prints PRE_TREE and a ROLLBACK command
# (git read-tree -u --reset <PRE_TREE>) that restores the exact pre-apply
# index and working tree; untracked files are left alone.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: integrate-worktree.sh <worktreePath> <worktreeBranch> <BASE>

  worktreePath    path from the agent's completion (.claude/worktrees/agent-...)
  worktreeBranch  branch from the agent's completion (worktree-agent-...)
  BASE            the BASE sha preflight.sh printed before dispatch

Run from the MAIN checkout (the orchestrator's). Steps:
  1. warn if the worktree branch has commits beyond BASE
  2. git -C <worktreePath> add -A   (stages new files too)
  3. show the --stat of the change against BASE
  4. refuse if this checkout has unstaged edits to tracked files (exit 5)
  5. print PRE_TREE + ROLLBACK (git read-tree -u --reset <PRE_TREE>)
  6. write the binary patch to ${TMPDIR:-/tmp}/orchestrate-<branch>.patch
  7. git apply --3way <patch> into this checkout (result is staged)
  8. list conflicted files and exit 3 if any

Exit: 0 applied/empty, 1 error, 3 conflicts, 4 STOP wrong base, 5 STOP checkout not ready.
EOF
}

case "${1:-}" in -h|--help) usage; exit 0 ;; esac
if [ "$#" -ne 3 ]; then
  echo "ERROR: expected 3 arguments, got $#." >&2
  usage >&2
  exit 1
fi

WT=$1; WB=$2; BASE=$3

if ! TOP=$(git rev-parse --show-toplevel 2>/dev/null); then
  echo "ERROR: run this from inside the main checkout of the repository." >&2
  exit 1
fi
cd "$TOP"

if [ ! -d "$WT" ]; then
  echo "ERROR: worktree path does not exist: $WT" >&2
  exit 1
fi
WT_ABS=$(cd "$WT" && pwd -P)
TOP_ABS=$(pwd -P)
if [ "$WT_ABS" = "$TOP_ABS" ]; then
  echo "ERROR: <worktreePath> is this checkout. Pass the sub-agent's worktree, and run from the main checkout." >&2
  exit 1
fi

# Same repository (worktrees share one common git dir)?
main_common=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
if ! wt_common_rel=$(git -C "$WT_ABS" rev-parse --git-common-dir 2>/dev/null); then
  echo "ERROR: $WT is not a git worktree." >&2
  exit 1
fi
wt_common=$(cd "$WT_ABS" && cd "$wt_common_rel" && pwd -P)
if [ "$wt_common" != "$main_common" ]; then
  echo "ERROR: $WT belongs to a different repository ($wt_common)." >&2
  exit 1
fi

if ! BASE_SHA=$(git rev-parse --verify --quiet "${BASE}^{commit}"); then
  echo "ERROR: BASE '$BASE' is not a commit in this repository." >&2
  exit 1
fi

wt_branch=$(git -C "$WT_ABS" symbolic-ref --quiet --short HEAD 2>/dev/null || echo HEAD)
if [ "$wt_branch" != "$WB" ]; then
  echo "WARN: worktree is on '$wt_branch', expected '$WB'. Continuing with the worktree's contents."
fi

echo "== integrate $WB =="
echo "WORKTREE=$WT_ABS"
echo "BASE=$BASE_SHA"

# 1. The worktree must have started from BASE (or a descendant of it).
wt_head=$(git -C "$WT_ABS" rev-parse HEAD)
if ! git merge-base --is-ancestor "$BASE_SHA" "$wt_head"; then
  echo "STOP: worktree HEAD $wt_head does not descend from BASE $BASE_SHA."
  echo "      The agent started from another commit (worktree.baseRef not \"head\"?)."
  echo "      Diffing against BASE would revert unrelated work. Inspect it by hand:"
  echo "      git -C '$WT_ABS' status; git -C '$WT_ABS' diff $wt_head"
  exit 4
fi
ahead=$(git rev-list --count "$BASE_SHA..$wt_head")
if [ "$ahead" -gt 0 ]; then
  echo "WARN: $WB has $ahead commit(s) beyond BASE (sub-agents should not commit):"
  git log --oneline "$BASE_SHA..$wt_head" | sed 's/^/  /'
  echo "      They are included in the patch below."
fi

# This checkout must be able to take an --index apply.
unmerged=$(git diff --name-only --diff-filter=U)
if [ -n "$unmerged" ]; then
  echo "STOP: this checkout has unresolved conflicts from an earlier step:"
  printf '%s\n' "$unmerged" | sed 's/^/  /'
  echo "      Resolve them and 'git add' the files before integrating the next worktree."
  exit 5
fi

# 2. Stage everything in the worktree, including new files.
git -C "$WT_ABS" add -A

# 3. Review scope.
touched=$(git -C "$WT_ABS" diff --cached --name-only "$BASE_SHA")
if [ -z "$touched" ]; then
  echo "RESULT=empty (no changes against BASE; nothing to apply)"
  exit 0
fi
echo "-- diff --stat against BASE --"
git -C "$WT_ABS" diff --cached --stat "$BASE_SHA"

# Any unstaged edit to a tracked file blocks the run: `git apply --3way`
# implies --index, and the ROLLBACK below (read-tree --reset -u) would
# overwrite unstaged edits. Staged edits and untracked files are safe.
dirty_here=$(git diff --name-only)
if [ -n "$dirty_here" ]; then
  echo "STOP: this checkout has unstaged edits to tracked files:"
  printf '%s\n' "$dirty_here" | sed 's/^/  /'
  echo "      Nothing was applied: the apply stages its result, and the ROLLBACK"
  echo "      (read-tree --reset) would wipe unstaged edits. Handle these edits as"
  echo "      the skill's worktree protocol says for exit 5, then re-run."
  exit 5
fi

# 4. Snapshot the index for rollback, then write the patch.
PRE_TREE=$(git write-tree)
echo "PRE_TREE=$PRE_TREE"
echo "ROLLBACK: git read-tree -u --reset $PRE_TREE"
safe=$(printf '%s' "$WB" | tr -c 'A-Za-z0-9._-' '_')
PATCH="${TMPDIR:-/tmp}/orchestrate-${safe}.patch"
git -C "$WT_ABS" diff --cached --binary "$BASE_SHA" > "$PATCH"
echo "PATCH=$PATCH"

# 5. Apply with a three-way fallback.
set +e
apply_out=$(git apply --3way "$PATCH" 2>&1)
apply_rc=$?
set -e
if [ -n "$apply_out" ]; then printf '%s\n' "$apply_out" | sed 's/^/  git: /'; fi

# 6. Report.
conflicts=$(git diff --name-only --diff-filter=U)
if [ -n "$conflicts" ]; then
  echo "CONFLICTS:"
  printf '%s\n' "$conflicts" | sed 's/^/  /'
  echo "RESULT=conflicts. Resolve the markers in the main session, 'git add' each file, then verify."
  echo "         To abandon this agent's whole patch: git read-tree -u --reset $PRE_TREE"
  exit 3
fi
if [ "$apply_rc" -ne 0 ]; then
  echo "RESULT=failed (git apply exited $apply_rc without conflict markers). Nothing was applied; see the git lines above."
  exit 1
fi
echo "-- now staged in this checkout --"
git diff --cached --stat
echo "RESULT=applied (staged, not committed). Verify here; to undo: git read-tree -u --reset $PRE_TREE"
echo "         Then: cleanup-worktree.sh $WT $WB --patch $PATCH"
exit 0
