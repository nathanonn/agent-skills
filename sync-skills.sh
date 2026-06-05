#!/usr/bin/env bash
#
# sync-skills.sh — regenerate the top-level skills/ mirror from plugins/.
#
# The Claude Code plugin marketplace lives under plugins/<name>/skills/<name>/.
# The open Agent Skills CLI (npx skills / skills.sh) and other agents
# (Codex, Cursor, GitHub Copilot, ...) discover skills most cleanly when they
# live at the repo root under skills/<name>/SKILL.md.
#
# To avoid maintaining two hand-edited copies, plugins/ is the SINGLE SOURCE OF
# TRUTH and this script regenerates skills/ from it. Never hand-edit skills/.
#
# Usage:
#   ./sync-skills.sh           # regenerate skills/ from plugins/
#   ./sync-skills.sh --check   # verify skills/ is in sync (non-zero exit if not)
#
set -euo pipefail

cd "$(dirname "$0")"

SRC_GLOB="plugins/*/skills/*"
DEST="skills"
CHECK_MODE=0

if [[ "${1:-}" == "--check" ]]; then
  CHECK_MODE=1
fi

# Collect source skill directories (each contains a SKILL.md).
sources=()
for d in $SRC_GLOB; do
  [[ -f "$d/SKILL.md" ]] && sources+=("$d")
done

if [[ ${#sources[@]} -eq 0 ]]; then
  echo "error: no skills found under $SRC_GLOB" >&2
  exit 1
fi

if [[ "$CHECK_MODE" -eq 1 ]]; then
  # Build the expected mirror in a temp dir and diff it against skills/.
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  for src in "${sources[@]}"; do
    name="$(basename "$src")"
    mkdir -p "$tmp/$name"
    cp -R "$src/." "$tmp/$name/"
  done
  if diff -r "$tmp" "$DEST" >/dev/null 2>&1; then
    echo "skills/ is in sync with plugins/ (${#sources[@]} skills)"
    exit 0
  else
    echo "skills/ is OUT OF SYNC with plugins/. Run ./sync-skills.sh" >&2
    diff -r "$tmp" "$DEST" || true
    exit 1
  fi
fi

# Regenerate: wipe and rebuild skills/ so deletions/renames propagate.
rm -rf "$DEST"
mkdir -p "$DEST"
for src in "${sources[@]}"; do
  name="$(basename "$src")"
  mkdir -p "$DEST/$name"
  cp -R "$src/." "$DEST/$name/"
  echo "synced: $src -> $DEST/$name"
done

echo "Done. Mirrored ${#sources[@]} skills into $DEST/"
