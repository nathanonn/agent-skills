#!/usr/bin/env bash
# slice-result.sh — pull the JSON object that playwright-cli prints under its
# "### Result" header out of the surrounding markdown.
#
# playwright-cli wraps `run-code` / `eval` output like:
#     ### Result
#     {...the JSON...}
#     ### Ran Playwright code
#     ```js ...
#
# This emits only the lines between those two markers, so the result pipes
# straight into a .json file or `jq`.
#
# Usage:
#   playwright-cli -s=designmd run-code "$(cat extract-tokens.js)" \
#     | bash slice-result.sh > tokens-home-light.json
awk '
  /^### Result$/      { f=1; next }
  /^### Ran Playwright/ { f=0 }
  f { print }
'
