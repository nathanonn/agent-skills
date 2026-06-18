#!/usr/bin/env bash
# codex-imagegen.sh — generate images via Codex's built-in $imagegen skill.
#
# Usage:
#   codex-imagegen.sh --dest <dir> "prompt text (WITHOUT the \$imagegen prefix)"
#   codex-imagegen.sh --sweep            # delete ALL leftover generated_images folders
#   codex-imagegen.sh --report           # report leftover folder count + size, no changes
#
# The script prepends the literal "$imagegen" token itself, so callers never
# have to worry about shell variable expansion eating it.
#
# Runtime resolution (in order):
#   1. codex plugin companion script — found by glob so it survives version bumps
#   2. codex CLI directly (codex exec)
#
# After a successful run, the thread folder this run created under
# ~/.codex/generated_images/ is deleted to keep storage flat. Pre-existing
# folders are never touched (use --sweep for that, after user confirmation).

set -uo pipefail

CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
GEN_DIR="$CODEX_HOME/generated_images"

report_leftovers() {
  if [ -d "$GEN_DIR" ]; then
    local count size
    count=$(find "$GEN_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
    size=$(du -sh "$GEN_DIR" 2>/dev/null | cut -f1)
    echo "LEFTOVER_THREAD_FOLDERS=$count"
    echo "LEFTOVER_TOTAL_SIZE=${size:-0}"
  else
    echo "LEFTOVER_THREAD_FOLDERS=0"
    echo "LEFTOVER_TOTAL_SIZE=0"
  fi
}

if [ "${1:-}" = "--report" ]; then
  report_leftovers
  exit 0
fi

if [ "${1:-}" = "--sweep" ]; then
  if [ -d "$GEN_DIR" ]; then
    before=$(du -sh "$GEN_DIR" 2>/dev/null | cut -f1)
    find "$GEN_DIR" -mindepth 1 -maxdepth 1 -type d -exec rm -rf {} +
    echo "Swept all thread folders from $GEN_DIR (was $before)."
  else
    echo "Nothing to sweep: $GEN_DIR does not exist."
  fi
  exit 0
fi

DEST=""
if [ "${1:-}" = "--dest" ]; then
  DEST="$2"
  shift 2
fi

if [ $# -lt 1 ] || [ -z "${1:-}" ]; then
  echo "ERROR: no prompt given. Usage: codex-imagegen.sh --dest <dir> \"prompt\"" >&2
  exit 2
fi

if [ -z "$DEST" ]; then
  DEST="$PWD/.codex-image"
fi
mkdir -p "$DEST"
DEST="$(cd "$DEST" && pwd)"

# Prepend the skill token here, in a single-quoted literal, so it can never
# be expanded away by an intermediate shell.
PROMPT='$imagegen '"$*"'

Save the final image file(s) into this exact directory: '"$DEST"

# --- Resolve runtime ---------------------------------------------------------
# Glob across marketplaces and versions; newest version wins.
COMPANION=$(find "$HOME/.claude/plugins/cache" -path "*codex*" -name "codex-companion.mjs" 2>/dev/null | sort -V | tail -1)

# --- Snapshot generated_images before the run --------------------------------
mkdir -p "$GEN_DIR"
BEFORE=$(find "$GEN_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort)

# --- Snapshot destination before the run -------------------------------------
DEST_BEFORE=$(find "$DEST" -maxdepth 1 -type f 2>/dev/null | sort)

# --- Run ----------------------------------------------------------------------
RUN_OK=1
if [ -n "$COMPANION" ] && command -v node >/dev/null 2>&1; then
  echo "RUNTIME=plugin ($COMPANION)"
  node "$COMPANION" task --write "$PROMPT" || RUN_OK=0
elif command -v codex >/dev/null 2>&1; then
  echo "RUNTIME=codex-cli (plugin companion not found)"
  codex exec --sandbox workspace-write "$PROMPT" || RUN_OK=0
else
  echo "ERROR: neither the codex plugin companion script nor the codex CLI was found." >&2
  echo "Install ONE of the following, then retry:" >&2
  echo "  - Codex plugin (Claude Code):  /plugin marketplace add openai/codex-plugin-cc" >&2
  echo "                                 /plugin install codex@openai-codex" >&2
  echo "                                 (Full guide: https://github.com/openai/codex-plugin-cc#install)" >&2
  echo "  - Codex CLI (any agent):       npm i -g @openai/codex  &&  codex login" >&2
  exit 3
fi

# --- Find this run's thread folder(s) ----------------------------------------
AFTER=$(find "$GEN_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort)
NEW_THREADS=$(comm -13 <(echo "$BEFORE") <(echo "$AFTER"))

# --- Verify destination, rescue files if Codex didn't place them -------------
DEST_AFTER=$(find "$DEST" -maxdepth 1 -type f 2>/dev/null | sort)
NEW_FILES=$(comm -13 <(echo "$DEST_BEFORE") <(echo "$DEST_AFTER"))

if [ -z "$NEW_FILES" ] && [ -n "$NEW_THREADS" ]; then
  # Codex generated something but didn't copy it to the destination — move it.
  while IFS= read -r tdir; do
    [ -z "$tdir" ] && continue
    find "$tdir" -type f \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.webp" \) -exec mv -n {} "$DEST"/ \;
  done <<< "$NEW_THREADS"
  DEST_AFTER=$(find "$DEST" -maxdepth 1 -type f 2>/dev/null | sort)
  NEW_FILES=$(comm -13 <(echo "$DEST_BEFORE") <(echo "$DEST_AFTER"))
fi

# --- Cleanup this run's thread folder(s), only if the image is safe ----------
if [ -n "$NEW_FILES" ] && [ -n "$NEW_THREADS" ]; then
  while IFS= read -r tdir; do
    [ -z "$tdir" ] && continue
    rm -rf "$tdir"
  done <<< "$NEW_THREADS"
  echo "CLEANUP=removed this run's thread folder(s)"
elif [ -n "$NEW_THREADS" ]; then
  echo "CLEANUP=skipped (no file confirmed at destination; originals kept in $GEN_DIR)"
fi

# --- Result -------------------------------------------------------------------
if [ -n "$NEW_FILES" ]; then
  echo "GENERATED_FILES:"
  echo "$NEW_FILES"
else
  echo "ERROR: no new image file found at $DEST after the run." >&2
  RUN_OK=0
fi

report_leftovers
[ "$RUN_OK" = "1" ] || exit 1
