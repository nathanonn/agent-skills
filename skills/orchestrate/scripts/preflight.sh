#!/usr/bin/env bash
# preflight.sh - orchestrate skill, step 1.
# Checks the main checkout before any sub-agent is dispatched and prints a
# KEY=value status block. Read-only: changes nothing in the repo.
# Any branch is fine, the default branch included.
#
# Exit codes:
#   0  OK to continue (WARN lines may still need attention)
#   1  error (not a git repo, bad usage)
#   3  STOP: running inside a linked worktree, not the main checkout

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: preflight.sh [--worktrees] [--help]

  --worktrees   worktree mode (the user asked for worktrees): also warn when
                worktree.baseRef is not "head" or .claude/worktrees/ is not
                ignored by git

Run from anywhere inside the repo's MAIN checkout (not a linked worktree).

Prints a status block:
  MODE=unisolated|worktrees   which checks ran
  BRANCH=<name>          current branch (HEAD if detached: WARN, commits made
                         there belong to no branch)
  TREE=clean|dirty       working tree state (+ list of changed paths if dirty)
  WORKTREES=<n>          leftover .claude/worktrees/* worktrees (+ list)
  BASEREF=<value>        worktree.baseRef from managed settings, then
                         .claude/settings.local.json, .claude/settings.json,
                         ${CLAUDE_CONFIG_DIR:-~/.claude}/settings.json (first
                         that sets it); informational without --worktrees
  EFFORT_ENV=<v>|unset   CLAUDE_CODE_EFFORT_LEVEL (overrides per-call effort)
  BASE=<sha>|none        HEAD commit; brief this to every worktree agent and
                         use it as the base of a review diff. "none" when the
                         repo has no commits yet (worktree mode unusable).
                         Omitted on STOP

Exit: 0 ok (check WARN lines), 1 error, 3 STOP (inside a linked worktree: cd to
the main checkout).
USAGE
}

WT_MODE=0
case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  --worktrees) WT_MODE=1 ;;
  "") ;;
  *) echo "ERROR: unknown argument: $1" >&2; usage >&2; exit 1 ;;
esac
if [ "$#" -gt 1 ]; then
  echo "ERROR: too many arguments." >&2; usage >&2; exit 1
fi

if ! TOP=$(git rev-parse --show-toplevel 2>/dev/null); then
  echo "ERROR: not inside a git repository." >&2
  exit 1
fi
cd "$TOP"

warns=0
warn() { echo "WARN: $*"; warns=$((warns + 1)); }

# Running inside a linked worktree means we are not the orchestrator's checkout.
git_dir=$(git rev-parse --absolute-git-dir)
common_dir=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
if [ "$(cd "$git_dir" && pwd -P)" != "$common_dir" ]; then
  main_wt=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
  echo "STOP: this is a linked worktree ($TOP), not the main checkout."
  echo "      The orchestrator dispatches, integrates and commits only from the main checkout: cd \"$main_wt\" and re-run."
  exit 3
fi

# Current branch ("HEAD" when detached).
if BRANCH=$(git symbolic-ref --quiet --short HEAD 2>/dev/null); then :; else BRANCH=HEAD; fi

echo "== orchestrate preflight =="
echo "REPO=$TOP"
if [ "$WT_MODE" -eq 1 ]; then echo "MODE=worktrees"; else echo "MODE=unisolated"; fi
echo "BRANCH=$BRANCH"
if [ "$BRANCH" = "HEAD" ]; then
  warn "detached HEAD: commits made in this run belong to no branch. Tell the user and suggest 'git switch -c <name>'; do not create a branch yourself."
fi

# Tree state.
changes=$(git status --porcelain --untracked-files=normal)
if [ -z "$changes" ]; then
  echo "TREE=clean"
else
  n=$(printf '%s\n' "$changes" | wc -l | tr -d ' ')
  echo "TREE=dirty ($n paths)"
  printf '%s\n' "$changes" | head -n 20 | sed 's/^/  /'
  if [ "$n" -gt 20 ]; then echo "  ... ($((n - 20)) more)"; fi
  if printf '%s\n' "$changes" | grep -q '\.claude/worktrees/'; then
    warn ".claude/worktrees/ shows up as untracked; add it to .gitignore or 'git add -A' will stage worktrees."
  fi
fi

# Leftover sub-agent worktrees (checked in every mode).
wt_lines=$(git worktree list --porcelain | awk '
  /^worktree /  { if (p != "") print p "\t" b "\t" l; p = substr($0, 10); b = "-"; l = "" }
  /^branch /    { b = substr($0, 8); sub("^refs/heads/", "", b) }
  /^detached/   { b = "(detached)" }
  /^locked/     { l = "locked" }
  END           { if (p != "") print p "\t" b "\t" l }
' | grep -F '/.claude/worktrees/' || true)
if [ -z "$wt_lines" ]; then
  echo "WORKTREES=0"
else
  n=$(printf '%s\n' "$wt_lines" | wc -l | tr -d ' ')
  echo "WORKTREES=$n"
  printf '%s\n' "$wt_lines" | while IFS=$'\t' read -r p b l; do
    echo "  $p  [$b]${l:+ $l}"
  done
  warn "leftover worktrees from an earlier run. Integrate or discard each, then run cleanup-worktree.sh <path> <branch>. A 'locked' one may belong to an agent that is still running."
fi

# .claude/worktrees/ ignored? Otherwise `git add -A` stages worktrees. Checked
# in worktree mode, and whenever worktrees exist.
if [ "$WT_MODE" -eq 1 ] || [ -n "$wt_lines" ]; then
  if ! git check-ignore -q .claude/worktrees/probe 2>/dev/null; then
    warn ".claude/worktrees/ is not ignored by git (.gitignore or .git/info/exclude)."
  fi
fi

# worktree.baseRef from the settings files a local session reads, highest
# precedence first: managed, local project, shared project, user.
read_baseref() { # <file>; prints the value or nothing
  local f=$1 flat
  [ -r "$f" ] || return 0
  if command -v jq >/dev/null 2>&1; then
    jq -r '.worktree.baseRef // empty' "$f" 2>/dev/null || true
  else
    flat=$(tr -d ' \t\r\n' < "$f")
    printf '%s' "$flat" | grep -o '"worktree":{[^}]*' | grep -o '"baseRef":"[^"]*"' | sed 's/.*:"//; s/"$//' || true
  fi
}
BASEREF=missing
USER_SETTINGS="${CLAUDE_CONFIG_DIR:-${HOME:-/nonexistent}/.claude}/settings.json"
for f in /etc/claude-code/managed-settings.json /etc/claude-code/managed-settings.d/*.json \
         "/Library/Application Support/ClaudeCode/managed-settings.json" \
         .claude/settings.local.json .claude/settings.json "$USER_SETTINGS"; do
  v=$(read_baseref "$f")
  if [ -n "$v" ]; then BASEREF="$v ($f)"; break; fi
done
echo "BASEREF=$BASEREF"
if [ "$WT_MODE" -eq 1 ]; then
  case "$BASEREF" in
    "head "*) ;;
    *) warn "worktree.baseRef is not \"head\" in any settings file. Worktree agents will start from the remote default branch, not this checkout's HEAD. Add {\"worktree\":{\"baseRef\":\"head\"}} or avoid isolation: \"worktree\"." ;;
  esac
fi

# Claude Code runtime files ignored? Otherwise `git add -A` stages them into
# checkpoint commits.
unignored=""
for probe in .claude/agent-registry.json .claude/checkpoints/probe .claude/mailbox/probe .claude/scheduled_tasks.lock; do
  git check-ignore -q "$probe" 2>/dev/null || unignored="$unignored ${probe%/probe}"
done
if [ -n "$unignored" ]; then
  warn "Claude Code runtime paths are not ignored:$unignored. Check 'git status --short' before any 'git add -A'."
fi

# Effort overrides: the env var beats every per-call effort, maxEffortLevel
# caps it. Either way the task labels would not match what runs.
if [ -n "${CLAUDE_CODE_EFFORT_LEVEL:-}" ]; then
  echo "EFFORT_ENV=$CLAUDE_CODE_EFFORT_LEVEL"
  warn "CLAUDE_CODE_EFFORT_LEVEL=$CLAUDE_CODE_EFFORT_LEVEL is set and overrides every per-call effort. Labels will not match what runs: say so in the report (or unset it in the session's settings)."
else
  echo "EFFORT_ENV=unset"
fi
for f in .claude/settings.json .claude/settings.local.json "$USER_SETTINGS" \
         /etc/claude-code/managed-settings.json /etc/claude-code/managed-settings.d/*.json \
         "/Library/Application Support/ClaudeCode/managed-settings.json"; do
  if [ -r "$f" ] && grep -q '"maxEffortLevel"' "$f" 2>/dev/null; then
    warn "maxEffortLevel appears in $f; per-call effort above that cap is lowered. Say so in the report."
  fi
done

# Session model: the script cannot see it.
echo "MODEL_CHECK=manual (confirm the session runs an Opus model; if not, tell the user once, or in no-ask mode add a report line)"

if head_sha=$(git rev-parse --verify --quiet HEAD 2>/dev/null); then
  echo "BASE=$head_sha"
else
  warn "no commits yet: there is no BASE, so worktree mode is unusable. Run writers unisolated; the first checkpoint commit creates one."
  echo "BASE=none"
fi
echo "RESULT=ok ($warns warning(s))"
exit 0
