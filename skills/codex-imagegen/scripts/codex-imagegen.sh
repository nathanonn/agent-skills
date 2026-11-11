#!/usr/bin/env bash
# codex-imagegen.sh — generate images via Codex's built-in $imagegen skill.
#
# Usage:
#   codex-imagegen.sh [--dest DIR] [--model M] [--effort E] [--dry-run] "prompt text"
#   codex-imagegen.sh --sweep
#   codex-imagegen.sh --report

set -uo pipefail

RAW_CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"

normalize_path() {
  local input="$1"
  local combined part result
  local -a parts=() stack=()

  if [[ "$input" == /* ]]; then
    combined="$input"
  else
    combined="$PWD/$input"
  fi

  IFS='/' read -r -a parts <<< "$combined"
  for part in "${parts[@]}"; do
    case "$part" in
      ''|.) ;;
      ..)
        if [ "${#stack[@]}" -gt 0 ]; then
          unset 'stack[${#stack[@]}-1]'
        fi
        ;;
      *) stack+=("$part") ;;
    esac
  done

  result="/"
  if [ "${#stack[@]}" -gt 0 ]; then
    local IFS=/
    result="/${stack[*]}"
  fi
  printf '%s\n' "$result"
}

CODEX_HOME="$(normalize_path "$RAW_CODEX_HOME")"
HOME_ABS="$(normalize_path "$HOME")"
GEN_DIR="$CODEX_HOME/generated_images"

usage_error() {
  echo "ERROR: $1" >&2
  echo 'Usage: codex-imagegen.sh [--dest DIR] [--model M] [--effort E] [--dry-run] "prompt text"' >&2
  echo '       codex-imagegen.sh --sweep' >&2
  echo '       codex-imagegen.sh --report' >&2
  exit 2
}

config_error() {
  local file="$1" line_number="$2" message="$3"
  echo "CONFIG ERROR: $file:$line_number: $message" >&2
  exit 4
}

require_flag_value() {
  local flag="$1" value="$2"
  case "$value" in
    --*)
      usage_error "missing value for $flag (got flag '$value'); prefix a dash-leading path with ./"
      ;;
  esac
}

deepest_existing_path() {
  local probe="$1"
  while [ ! -e "$probe" ] && [ "$probe" != "/" ]; do
    probe="${probe%/*}"
    [ -n "$probe" ] || probe="/"
  done
  printf '%s\n' "$probe"
}

# Config-supplied and marker-derived destinations come from files that may live
# inside a cloned repository. Lexical containment is not enough: a committed
# symlink such as .codex-imagegen/out -> ~/.ssh would otherwise be created,
# handed to codex via --add-dir, and written into. Canonicalize the deepest
# existing prefix and require it to stay under the project directory.
enforce_dest_containment() {
  local container="$1" canon_container canon_dest existing
  [ -n "$container" ] || return 0
  canon_container="$(readlink -f "$container" 2>/dev/null)" || canon_container="$container"
  [ -n "$canon_container" ] || canon_container="$container"
  existing="$(deepest_existing_path "$DEST")"
  canon_dest="$(readlink -f "$existing" 2>/dev/null)" || canon_dest="$existing"
  [ -n "$canon_dest" ] || canon_dest="$existing"
  if [ "$canon_dest" = "$canon_container" ]; then
    return 0
  fi
  case "$canon_dest/" in
    "$canon_container"/*) return 0 ;;
  esac
  echo "CONFIG ERROR: resolved destination '$DEST' escapes the project directory '$container' (it resolves to '$canon_dest'). A symlinked destination is refused because it would be created and authorized for writing." >&2
  exit 4
}

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
    before_size=$(du -sh "$GEN_DIR" 2>/dev/null | cut -f1)
    find "$GEN_DIR" -mindepth 1 -maxdepth 1 -type d -exec rm -rf {} +
    echo "Swept all thread folders from $GEN_DIR (was $before_size)."
  else
    echo "Nothing to sweep: $GEN_DIR does not exist."
  fi
  exit 0
fi

DEST_FLAG=""
MODEL_FLAG=""
EFFORT_FLAG=""
DEST_FLAG_SET=0
MODEL_FLAG_SET=0
EFFORT_FLAG_SET=0
DRY_RUN=0
PROMPT_PARTS=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dest)
      [ "$#" -ge 2 ] || usage_error 'missing value for --dest'
      require_flag_value '--dest' "$2"
      DEST_FLAG="$2"
      DEST_FLAG_SET=1
      shift 2
      ;;
    --model)
      [ "$#" -ge 2 ] || usage_error 'missing value for --model'
      require_flag_value '--model' "$2"
      MODEL_FLAG="$2"
      MODEL_FLAG_SET=1
      shift 2
      ;;
    --effort)
      [ "$#" -ge 2 ] || usage_error 'missing value for --effort'
      require_flag_value '--effort' "$2"
      EFFORT_FLAG="$2"
      EFFORT_FLAG_SET=1
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --)
      shift
      PROMPT_PARTS=("$@")
      break
      ;;
    --*) usage_error "unknown flag: $1" ;;
    *)
      PROMPT_PARTS=("$@")
      break
      ;;
  esac
done

[ "${#PROMPT_PARTS[@]}" -gt 0 ] || usage_error 'no prompt given'
PROMPT_TEXT="${PROMPT_PARTS[*]}"
[ -n "$PROMPT_TEXT" ] || usage_error 'no prompt given'
[ "$DEST_FLAG_SET" -eq 0 ] || [ -n "$DEST_FLAG" ] || usage_error 'empty value for --dest'
[ "$MODEL_FLAG_SET" -eq 0 ] || [ -n "$MODEL_FLAG" ] || usage_error 'empty value for --model'
[ "$EFFORT_FLAG_SET" -eq 0 ] || [ -n "$EFFORT_FLAG" ] || usage_error 'empty value for --effort'

if [ "$DEST_FLAG_SET" -eq 1 ]; then
  ANCHOR="$(normalize_path "$DEST_FLAG")"
else
  ANCHOR="$(normalize_path "$PWD")"
fi

declare -a ANCESTORS=() CONFIG_PATHS=()
DEEPEST_MARKER=""
walk_dir="$ANCHOR"
while :; do
  ANCESTORS+=("$walk_dir")
  if [ -z "$DEEPEST_MARKER" ] && [ -d "$walk_dir/.codex-imagegen" ]; then
    DEEPEST_MARKER="$walk_dir"
  fi
  # Stop at $HOME when the anchor lives under it; otherwise (containers,
  # /srv, /opt, external volumes) walk to the filesystem root instead of
  # silently discovering nothing.
  if [ "$walk_dir" = "$HOME_ABS" ] || [ "$walk_dir" = "/" ]; then
    break
  fi
  parent_dir="${walk_dir%/*}"
  [ -n "$parent_dir" ] || parent_dir="/"
  [ "$parent_dir" != "$walk_dir" ] || break
  walk_dir="$parent_dir"
done

declare -A CONFIG_VALUES=() CONFIG_SOURCES=() PROFILE_VALUES=()
ASSIGNMENT_RE='^[[:space:]]*([a-z_][a-z0-9_]*)[[:space:]]*=[[:space:]]*"([^"]*)"[[:space:]]*(#.*)?$'
SECTION_RE='^[[:space:]]*\[([^]]*)\][[:space:]]*$'
# The machine profile is the user's own trusted codex profile, so it is parsed
# leniently and accepts single-quoted TOML strings too. Project configs stay
# strict (double quotes only) because they may arrive from a cloned repo.
PROFILE_SQ_ASSIGNMENT_RE="^[[:space:]]*([a-z_][a-z0-9_]*)[[:space:]]*=[[:space:]]*'([^']*)'[[:space:]]*(#.*)?\$"

parse_project_config() {
  local file="$1"
  local line section="" key value accepted segment
  local line_number=0
  local -a dest_segments=()

  [ -r "$file" ] || config_error "$file" 0 'file is not readable'
  while IFS= read -r line || [ -n "$line" ]; do
    line_number=$((line_number + 1))
    if [[ "$line" =~ ^[[:space:]]*$ ]] || [[ "$line" =~ ^[[:space:]]*# ]]; then
      continue
    fi
    if [[ "$line" =~ ^[[:space:]]*\[(codex|imagegen)\][[:space:]]*$ ]]; then
      section="${BASH_REMATCH[1]}"
      continue
    fi
    if [[ "$line" =~ $SECTION_RE ]]; then
      config_error "$file" "$line_number" "unknown section [${BASH_REMATCH[1]}]; accepted sections: [codex], [imagegen]"
    fi
    if ! [[ "$line" =~ $ASSIGNMENT_RE ]]; then
      config_error "$file" "$line_number" 'invalid syntax; expected a supported section header or key = "single-line value"'
    fi
    key="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    if [ -z "$section" ]; then
      config_error "$file" "$line_number" "assignment for '$key' appears before any section header"
    fi

    if [ "$section" = "codex" ]; then
      accepted='model, model_reasoning_effort, model_verbosity, service_tier'
      case "$key" in
        model|model_reasoning_effort|model_verbosity|service_tier) ;;
        *)
          config_error "$file" "$line_number" "key '$key' is not allowed in [codex]. Accepted keys: $accepted. This allowlist prevents cloned repositories from changing sandbox, approval, shell-environment, MCP-server, or feature settings."
          ;;
      esac
      if ! [[ "$value" =~ ^[A-Za-z0-9._:-]+$ ]]; then
        config_error "$file" "$line_number" "invalid value for [codex] $key; use only letters, digits, '.', '_', ':', or '-'"
      fi
    else
      accepted='size, style, dest'
      case "$key" in
        size)
          if ! [[ "$value" =~ ^[0-9]{2,5}x[0-9]{2,5}$|^[0-9]{1,2}:[0-9]{1,2}$ ]]; then
            config_error "$file" "$line_number" "invalid image size '$value'; use WIDTHxHEIGHT or an aspect ratio such as 16:9"
          fi
          ;;
        style)
          value="$(printf '%s' "$value" | LC_ALL=C tr -d '\000-\037\177')"
          value="${value:0:2000}"
          ;;
        dest)
          if [ -z "$value" ] || [[ "$value" == /* ]]; then
            config_error "$file" "$line_number" "invalid image destination '$value'; it must be a non-empty relative path"
          fi
          IFS='/' read -r -a dest_segments <<< "$value"
          for segment in "${dest_segments[@]}"; do
            if [ "$segment" = ".." ]; then
              config_error "$file" "$line_number" "invalid image destination '$value'; '..' path segments are not allowed"
            fi
          done
          ;;
        *)
          config_error "$file" "$line_number" "key '$key' is not allowed in [imagegen]. Accepted keys: $accepted. This closed allowlist is a security boundary."
          ;;
      esac
    fi

    CONFIG_VALUES["$section.$key"]="$value"
    CONFIG_SOURCES["$section.$key"]="$file"
  done < "$file"
}

for ((ancestor_index=${#ANCESTORS[@]}-1; ancestor_index>=0; ancestor_index--)); do
  config_path="${ANCESTORS[$ancestor_index]}/.codex-imagegen/config.toml"
  if [ -f "$config_path" ]; then
    CONFIG_PATHS+=("$config_path")
    parse_project_config "$config_path"
  fi
done

PROFILE_FILE="$CODEX_HOME/imagegen.config.toml"
PROFILE_EXISTS=0
if [ -f "$PROFILE_FILE" ]; then
  PROFILE_EXISTS=1
  while IFS= read -r profile_line || [ -n "$profile_line" ]; do
    if [[ "$profile_line" =~ ^[[:space:]]*\[ ]]; then
      break
    fi
    if [[ "$profile_line" =~ $ASSIGNMENT_RE ]] || [[ "$profile_line" =~ $PROFILE_SQ_ASSIGNMENT_RE ]]; then
      profile_key="${BASH_REMATCH[1]}"
      profile_value="${BASH_REMATCH[2]}"
      case "$profile_key" in
        model|model_reasoning_effort|model_verbosity|service_tier)
          PROFILE_VALUES["$profile_key"]="$profile_value"
          ;;
      esac
    fi
  done < "$PROFILE_FILE"
fi

MODEL=""
MODEL_SOURCE="codex-default"
if [ "$MODEL_FLAG_SET" -eq 1 ]; then
  MODEL="$MODEL_FLAG"
  MODEL_SOURCE="flag"
elif [ -n "${CODEX_IMAGEGEN_MODEL:-}" ]; then
  MODEL="$CODEX_IMAGEGEN_MODEL"
  MODEL_SOURCE="env"
elif [[ -v 'CONFIG_VALUES[codex.model]' ]]; then
  MODEL="${CONFIG_VALUES[codex.model]}"
  MODEL_SOURCE="config:${CONFIG_SOURCES[codex.model]}"
elif [[ -v 'PROFILE_VALUES[model]' ]]; then
  MODEL="${PROFILE_VALUES[model]}"
  MODEL_SOURCE="profile:$PROFILE_FILE"
fi

EFFORT=""
EFFORT_SOURCE="codex-default"
if [ "$EFFORT_FLAG_SET" -eq 1 ]; then
  EFFORT="$EFFORT_FLAG"
  EFFORT_SOURCE="flag"
elif [ -n "${CODEX_IMAGEGEN_EFFORT:-}" ]; then
  EFFORT="$CODEX_IMAGEGEN_EFFORT"
  EFFORT_SOURCE="env"
elif [[ -v 'CONFIG_VALUES[codex.model_reasoning_effort]' ]]; then
  EFFORT="${CONFIG_VALUES[codex.model_reasoning_effort]}"
  EFFORT_SOURCE="config:${CONFIG_SOURCES[codex.model_reasoning_effort]}"
elif [[ -v 'PROFILE_VALUES[model_reasoning_effort]' ]]; then
  EFFORT="${PROFILE_VALUES[model_reasoning_effort]}"
  EFFORT_SOURCE="profile:$PROFILE_FILE"
fi

SIZE_SET=0
SIZE=""
if [[ -v 'CONFIG_VALUES[imagegen.size]' ]]; then
  SIZE_SET=1
  SIZE="${CONFIG_VALUES[imagegen.size]}"
fi

STYLE_SET=0
STYLE=""
if [[ -v 'CONFIG_VALUES[imagegen.style]' ]]; then
  STYLE_SET=1
  STYLE="${CONFIG_VALUES[imagegen.style]}"
fi

DEST_CONTAINER=""
if [ "$DEST_FLAG_SET" -eq 1 ]; then
  DEST="$ANCHOR"
  DEST_SOURCE="flag"
elif [[ -v 'CONFIG_VALUES[imagegen.dest]' ]]; then
  dest_config_file="${CONFIG_SOURCES[imagegen.dest]}"
  dest_config_dir="${dest_config_file%/*}"
  # config lives at <project>/.codex-imagegen/config.toml, so a relative dest
  # resolves against <project>, not against the .codex-imagegen folder.
  dest_project_dir="${dest_config_dir%/*}"
  [ -n "$dest_project_dir" ] || dest_project_dir="/"
  DEST="$(normalize_path "$dest_project_dir/${CONFIG_VALUES[imagegen.dest]}")"
  DEST_SOURCE="config:$dest_config_file"
  DEST_CONTAINER="$dest_project_dir"
elif [ -n "$DEEPEST_MARKER" ]; then
  DEST="$(normalize_path "$DEEPEST_MARKER/.codex-imagegen/output")"
  DEST_SOURCE="marker"
  DEST_CONTAINER="$DEEPEST_MARKER"
else
  DEST="$(normalize_path "$PWD/.codex-imagegen/output")"
  DEST_SOURCE="cwd-default"
fi

# A destination the user typed with --dest is trusted; one derived from a
# repository config or marker is not.
enforce_dest_containment "$DEST_CONTAINER"

PROMPT='$imagegen '"$PROMPT_TEXT"
PROMPT+=$'\n\n'
if [ "$SIZE_SET" -eq 1 ]; then
  PROMPT+='Render the image at '"$SIZE"'.'
fi
if [ "$STYLE_SET" -eq 1 ]; then
  [ "$SIZE_SET" -eq 0 ] || PROMPT+=$'\n'
  PROMPT+='Style: '"$STYLE"
fi
if [ "$SIZE_SET" -eq 1 ] || [ "$STYLE_SET" -eq 1 ]; then
  PROMPT+=$'\n'
fi
PROMPT+='Save the final image file(s) into this exact directory: '"$DEST"

# --skip-git-repo-check is required: codex exec refuses to start in a directory
# that is neither a git repo nor a trusted project, and image generation is
# routinely run from ordinary folders. The workspace-write sandbox still applies.
CODEX_ARGV=(codex exec --sandbox workspace-write --skip-git-repo-check --add-dir "$DEST")
if [ "$PROFILE_EXISTS" -eq 1 ]; then
  CODEX_ARGV+=(-p imagegen)
fi
if [ -n "$MODEL" ]; then
  CODEX_ARGV+=(-m "$MODEL")
fi
if [ -n "$EFFORT" ]; then
  CODEX_ARGV+=(-c "model_reasoning_effort=$EFFORT")
fi
for config_key in model_verbosity service_tier; do
  if [[ -v "CONFIG_VALUES[codex.$config_key]" ]]; then
    CODEX_ARGV+=(-c "$config_key=${CONFIG_VALUES[codex.$config_key]}")
  fi
done
CODEX_ARGV+=("$PROMPT")

echo 'RUNTIME=codex-cli'
if [ "${#CONFIG_PATHS[@]}" -gt 0 ]; then
  config_files_trace=$(IFS=:; printf '%s' "${CONFIG_PATHS[*]}")
  echo "CONFIG_FILES=$config_files_trace"
else
  echo 'CONFIG_FILES=none'
fi
echo "MODEL=${MODEL:-(codex default)}"
echo "MODEL_SOURCE=$MODEL_SOURCE"
echo "EFFORT=${EFFORT:-(codex default)}"
echo "EFFORT_SOURCE=$EFFORT_SOURCE"
echo "DEST=$DEST"
echo "DEST_SOURCE=$DEST_SOURCE"
if [ "$SIZE_SET" -eq 1 ]; then
  echo "SIZE=$SIZE"
fi
if [ "$STYLE_SET" -eq 1 ]; then
  echo 'STYLE=set'
fi

if ! command -v codex >/dev/null 2>&1; then
  echo 'ERROR: the Codex CLI is required; the Claude Code codex plugin alone is not sufficient.' >&2
  echo 'Install it with: npm i -g @openai/codex' >&2
  echo 'Then authenticate with: codex login' >&2
  exit 3
fi

validate_catalog() {
  # With no model resolved we cannot check per-model support, but an effort
  # typo is still worth catching against the union of catalog efforts.
  if [ -z "$MODEL" ] && [ -z "$EFFORT" ]; then
    return 0
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo 'WARNING: python3 is unavailable; skipping Codex model catalog validation.' >&2
    return 0
  fi

  local catalog_output catalog_status catalog_result result_kind result_detail
  if command -v timeout >/dev/null 2>&1; then
    catalog_output=$(timeout 20s codex debug models 2>/dev/null)
    catalog_status=$?
  else
    catalog_output=$(codex debug models 2>/dev/null)
    catalog_status=$?
  fi
  if [ "$catalog_status" -ne 0 ]; then
    echo 'WARNING: codex debug models failed or timed out; skipping catalog validation.' >&2
    return 0
  fi

  catalog_result=$(python3 -c '
import json
import sys

model_slug, effort = sys.argv[1:3]
try:
    raw = sys.stdin.read().lstrip()
    catalog, _ = json.JSONDecoder().raw_decode(raw)
    models = catalog["models"]
    if not isinstance(models, list):
        raise ValueError("models is not a list")
    if not model_slug:
        union = sorted({
            level.get("effort", "")
            for item in models
            if item.get("visibility") == "list"
            for level in item.get("supported_reasoning_levels", [])
            if level.get("effort")
        })
        if effort and effort not in union:
            print("UNSUPPORTED_EFFORT")
            print(", ".join(union) or "(none)")
        else:
            print("OK")
        sys.exit(0)
    match = next((item for item in models if item.get("slug") == model_slug), None)
    if match is None:
        visible = sorted(
            item.get("slug", "") for item in models
            if item.get("visibility") == "list" and item.get("slug")
        )
        print("UNKNOWN_MODEL")
        print(", ".join(visible) or "(none)")
    elif effort:
        efforts = [
            level.get("effort", "")
            for level in match.get("supported_reasoning_levels", [])
            if level.get("effort")
        ]
        if effort not in efforts:
            print("UNSUPPORTED_EFFORT")
            print(", ".join(efforts) or "(none)")
        else:
            print("OK")
    else:
        print("OK")
except Exception as exc:
    print("PARSE_ERROR")
    print(str(exc))
' "$MODEL" "$EFFORT" < <(printf '%s' "$catalog_output"))
  result_kind="${catalog_result%%$'\n'*}"
  if [[ "$catalog_result" == *$'\n'* ]]; then
    result_detail="${catalog_result#*$'\n'}"
  else
    result_detail=""
  fi
  case "$result_kind" in
    OK) return 0 ;;
    UNKNOWN_MODEL)
      echo "VALIDATION ERROR: model '$MODEL' is not in the Codex model catalog. Listed models: $result_detail" >&2
      exit 5
      ;;
    UNSUPPORTED_EFFORT)
      if [ -n "$MODEL" ]; then
        echo "VALIDATION ERROR: effort '$EFFORT' is not supported by model '$MODEL'. Supported efforts: $result_detail" >&2
      else
        echo "VALIDATION ERROR: effort '$EFFORT' is not a known Codex reasoning effort. Efforts offered by listed models: $result_detail" >&2
      fi
      exit 5
      ;;
    *)
      echo 'WARNING: codex debug models emitted unparseable output; skipping catalog validation.' >&2
      return 0
      ;;
  esac
}

validate_catalog

if [ "$DRY_RUN" -eq 1 ]; then
  echo 'CODEX_ARGV:'
  printf '  %q\n' "${CODEX_ARGV[@]}"
  echo 'COMPOSED_PROMPT:'
  printf '%s\n' "$PROMPT"
  exit 0
fi

mkdir -p "$DEST"
mkdir -p "$GEN_DIR"

BEFORE=$(find "$GEN_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort)
# Only image files count as delivered output. A stray notes.txt must not be
# mistaken for success, because that would also delete the thread folder
# still holding the real image.
IMAGE_FIND_ARGS=(-maxdepth 1 -type f '(' -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' ')')
DEST_BEFORE=$(find "$DEST" "${IMAGE_FIND_ARGS[@]}" 2>/dev/null | sort)

RUN_OK=1
"${CODEX_ARGV[@]}" < /dev/null || RUN_OK=0

AFTER=$(find "$GEN_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort)
NEW_THREADS=$(comm -13 <(printf '%s\n' "$BEFORE") <(printf '%s\n' "$AFTER"))

DEST_AFTER=$(find "$DEST" "${IMAGE_FIND_ARGS[@]}" 2>/dev/null | sort)
NEW_FILES=$(comm -13 <(printf '%s\n' "$DEST_BEFORE") <(printf '%s\n' "$DEST_AFTER"))

if [ -z "$NEW_FILES" ] && [ -n "$NEW_THREADS" ]; then
  while IFS= read -r thread_dir; do
    [ -n "$thread_dir" ] || continue
    find "$thread_dir" -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \) -exec mv -n {} "$DEST"/ \;
  done <<< "$NEW_THREADS"
  DEST_AFTER=$(find "$DEST" "${IMAGE_FIND_ARGS[@]}" 2>/dev/null | sort)
  NEW_FILES=$(comm -13 <(printf '%s\n' "$DEST_BEFORE") <(printf '%s\n' "$DEST_AFTER"))
fi

if [ -n "$NEW_FILES" ] && [ -n "$NEW_THREADS" ]; then
  while IFS= read -r thread_dir; do
    [ -n "$thread_dir" ] || continue
    rm -rf "$thread_dir"
  done <<< "$NEW_THREADS"
  echo "CLEANUP=removed this run's thread folder(s)"
elif [ -n "$NEW_THREADS" ]; then
  echo "CLEANUP=skipped (no file confirmed at destination; originals kept in $GEN_DIR)"
fi

if [ -n "$NEW_FILES" ]; then
  echo 'GENERATED_FILES:'
  echo "$NEW_FILES"
else
  echo "ERROR: no new image file found at $DEST after the run." >&2
  RUN_OK=0
fi

report_leftovers
[ "$RUN_OK" = "1" ] || exit 1
