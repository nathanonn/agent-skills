#!/usr/bin/env bash
# cleanup-worktree.sh - orchestrate skill, step 7 (after integration).
# Removes one sub-agent worktree, deletes its local branch, prunes stale
# worktree metadata, and drops the integration patch. Discards anything left
# in the worktree, so run it only after the result is integrated and verified
# (or deliberately abandoned) and after the last SendMessage follow-up to that
# agent. Every check runs BEFORE anything is removed.
# Never pushes, never deletes remote refs.
#
# Exit codes:
#   0  cleaned up (or already gone)
#   1  error / bad usage
#   2  REFUSED by a safety guard (nothing was changed)

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: cleanup-worktree.sh <worktreePath> <worktreeBranch> [options]

  worktreePath    the agent's worktree (.claude/worktrees/agent-...)
  worktreeBranch  its branch (worktree-agent-...)

Options:
  --patch <file>  also delete this patch (the PATCH= line integrate printed);
                  the default ${TMPDIR:-/tmp}/orchestrate-<branch>.patch is
                  always tried
  --force-unlock  remove a LOCKED worktree. Claude Code holds that lock while
                  the agent runs, so use this only for a leftover from a dead
                  (closed or crashed) session, never for an agent that may
                  be running
  --any-branch    allow a branch name that does not start with "worktree-"

Run from the MAIN checkout. Checks first, then acts:
  - the path must be under <repo>/.claude/worktrees/
  - `git worktree list --porcelain` must show the path on exactly this branch
    (if the path is gone, the branch must not be checked out anywhere)
  - a locked worktree is refused unless --force-unlock is given
  - never deletes the default branch, main/master, or the branch checked out here
Then: git worktree remove --force, git branch -D, git worktree prune, rm patch.

Exit: 0 ok, 1 error, 2 refused (nothing changed).
EOF
}

ANY=0; UNLOCK=0; PATCH_ARG=""; POS=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --any-branch) ANY=1; shift ;;
    --force-unlock) UNLOCK=1; shift ;;
    --patch)
      if [ "$#" -lt 2 ]; then echo "ERROR: --patch needs a file." >&2; exit 1; fi
      PATCH_ARG=$2; shift 2 ;;
    --) shift; POS+=("$@"); break ;;
    -*) echo "ERROR: unknown option $1" >&2; usage >&2; exit 1 ;;
    *) POS+=("$1"); shift ;;
  esac
done
if [ "${#POS[@]}" -ne 2 ]; then
  echo "ERROR: expected 2 arguments (<worktreePath> <worktreeBranch>), got ${#POS[@]}." >&2
  usage >&2
  exit 1
fi
WT=${POS[0]}; WB=${POS[1]}

# abs_path <path>: absolute path with symlinks resolved, like GNU `realpath -m`
# but portable (no realpath/readlink -f; macOS and BSD lack the GNU flags).
# The longest existing directory prefix is resolved with `cd -P` + `pwd -P`;
# the components after it (a worktree that is already gone) are appended
# lexically, with "." dropped and ".." removing the previous component.
abs_path() (
  p=$1; rest=""
  case "$p" in /*) ;; *) p="$PWD/$p" ;; esac
  while :; do
    while [ "$p" != "/" ] && [ "${p%/}" != "$p" ]; do p=${p%/}; done
    [ -d "$p" ] && break
    rest="${p##*/}${rest:+/$rest}"
    p=${p%/*}
    [ -n "$p" ] || p=/
  done
  out=$(cd -P -- "$p" && pwd -P) || exit 1
  set -f; IFS=/
  for part in $rest; do
    case "$part" in
      ""|.) ;;
      ..) out=${out%/*}; [ -n "$out" ] || out=/ ;;
      *) if [ "$out" = / ]; then out="/$part"; else out="$out/$part"; fi ;;
    esac
  done
  printf '%s\n' "$out"
)

if ! TOP=$(git rev-parse --show-toplevel 2>/dev/null); then
  echo "ERROR: run this from inside the main checkout of the repository." >&2
  exit 1
fi
cd "$TOP"
TOP_ABS=$(abs_path "$TOP")
refuse() { echo "REFUSED: $*"; echo "         Nothing was changed."; exit 2; }

# --- Guard 1: branch name.
DEFAULT=main
if ref=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null); then
  DEFAULT=${ref#origin/}
fi
CUR=$(git symbolic-ref --quiet --short HEAD 2>/dev/null || echo HEAD)
case "$WB" in
  "$DEFAULT"|main|master|"$CUR")
    refuse "'$WB' is the default branch, main/master, or the branch checked out here." ;;
esac
if [ "$ANY" -ne 1 ] && [[ "$WB" != worktree-* ]]; then
  refuse "'$WB' does not look like a sub-agent branch (worktree-*). Re-run with --any-branch if you are sure."
fi

# --- Guard 2: path must sit under .claude/worktrees/.
WT_ABS=$(abs_path "$WT")
case "$WT_ABS/" in
  "$TOP_ABS/.claude/worktrees/"?*) ;;
  *) refuse "$WT is not under $TOP_ABS/.claude/worktrees/." ;;
esac

# --- Guard 3: path and branch must belong together.
# Records: path<TAB>branch<TAB>locked(0/1)<TAB>lock reason
records=$(git worktree list --porcelain | awk '
  function flush() { if (p != "") print p "\t" b "\t" l "\t" r }
  /^worktree / { flush(); p = substr($0, 10); b = "-"; l = 0; r = "" }
  /^branch /   { b = substr($0, 8); sub("^refs/heads/", "", b) }
  /^detached/  { b = "(detached)" }
  /^locked/    { l = 1; r = substr($0, 8) }
  END          { flush() }
')
match_branch=""; match_locked=0; match_reason=""; found=0; branch_elsewhere=""
while IFS=$'\t' read -r p b l r; do
  [ -z "$p" ] && continue
  pa=$(abs_path "$p")
  if [ "$pa" = "$WT_ABS" ]; then
    found=1; match_branch=$b; match_locked=$l; match_reason=$r
  elif [ "$b" = "$WB" ]; then
    branch_elsewhere=$pa
  fi
done <<<"$records"

echo "== cleanup $WB =="
if [ "$found" -eq 1 ]; then
  if [ "$match_branch" != "$WB" ]; then
    refuse "$WT is on branch '$match_branch', not '$WB'. Pair each worktreePath with the worktreeBranch from the SAME agent's completion."
  fi
  if [ "$match_locked" = "1" ]; then
    if [ "$UNLOCK" -ne 1 ]; then
      refuse "$WT is locked${match_reason:+ ($match_reason)}. Claude Code locks a worktree while its agent runs: wait for that agent's completion notification. Only for a leftover from a dead session, re-run with --force-unlock."
    fi
    echo "NOTE: --force-unlock given; unlocking $WT_ABS${match_reason:+ (lock reason: $match_reason)}."
    git worktree unlock "$WT_ABS"
  fi
  left=$(git -C "$WT_ABS" status --porcelain 2>/dev/null | wc -l | tr -d ' ' || echo 0)
  if [ "$left" != "0" ]; then echo "NOTE: discarding $left changed path(s) in the worktree (expected once integrated)."; fi
  if ! git worktree remove --force "$WT_ABS"; then
    echo "ERROR: could not remove $WT_ABS. Check 'git worktree list --porcelain'." >&2
    exit 1
  fi
  echo "REMOVED worktree $WT_ABS"
else
  if [ -e "$WT_ABS" ]; then
    refuse "$WT exists but is not a registered worktree of this repository."
  fi
  if [ -n "$branch_elsewhere" ]; then
    refuse "$WT is gone, but '$WB' is checked out in another worktree ($branch_elsewhere). Wrong pair?"
  fi
  echo "NOTE: $WT is not a worktree any more (already removed?)."
fi

# --- Act: branch, prune, patch.
if git show-ref --verify --quiet "refs/heads/$WB"; then
  git branch -D "$WB"
else
  echo "NOTE: branch $WB does not exist locally."
fi
git worktree prune

safe=$(printf '%s' "$WB" | tr -c 'A-Za-z0-9._-' '_')
rm -f "${TMPDIR:-/tmp}/orchestrate-${safe}.patch"
if [ -n "$PATCH_ARG" ]; then
  case "$(basename "$PATCH_ARG")" in
    orchestrate-*.patch) rm -f "$PATCH_ARG" ;;
    *) echo "NOTE: --patch $PATCH_ARG is not an orchestrate-*.patch file; left in place." ;;
  esac
fi

echo "-- remaining worktrees --"
git worktree list
echo "RESULT=cleaned"
exit 0
