# Sanitizer Reference

Every phase that emits files runs the sanitizer as the last step before the atomic `mv` from `${TMPDIR}/wp-requirements-to-goals-phase<N>-XXXX/` to the project root. The sanitizer is the safety net that catches four failure modes:

1. **Banned-token leakage.** Templates inherited language from skills authored under Claude Code. Tokens like `.claude/`, `CLAUDE.md`, `TaskCreate`, `AskUserQuestion`, `mcp__` are meaningless inside a Codex session and confuse the model when they appear in operating context.
2. **Orphan placeholders.** Skill-time substitution misses (`<slug>` not replaced, `<Namespace>` left literal) survive into shipped output and break test plans / commands at runtime.
3. **Banned destructive operations in test plans.** `wp plugin uninstall`, `register_uninstall_hook`, `wp db reset`, `DROP TABLE` against the shared dev wp-env destroy state subsequent goals depend on.
4. **Malformed canonical protocol copies.** `protocols/run_goal_tests.md` must be a byte-for-byte copy of the body between the exact marker lines in `references/verification-protocol.md`; a substring match against explanatory prose can otherwise produce a one-line fragment.

A clean pass is a precondition for the atomic `mv`. On any hit, the tmp tree is `rm -rf`d and the project root is left exactly as it was before the phase started — no partial output, no half-written goal folders.

## Read this section before every phase

The sanitizer is invoked as the last step of every Phase 1-6 emit (Phase 7 isn't a discrete phase — it's the sanitize step itself, running per-phase). Each phase's reference document points at this file:

- `references/plan-decomposition.md` § Validation before writing
- `references/scaffold-templates.md` § (after the conflict-detection section)
- `references/foundation-template.md` § Stop after Foundation
- `references/per-us-template.md` § Stop after each US
- `references/non-us-template.md` § Stop after each non-US feature
- `references/integration-template.md` § Stop after Integration

## Banned-token table and structural checks

The sanitizer scans every file in the Phase staging tree against the categories below and runs the structural checks listed here. A single hit in **outputs** aborts the phase. A hit in **inputs** (the user's `requirements.md`, `CLAUDE.md`, `AGENTS.md`, or `notes/`) is recorded as a Phase 1 warning only — input authors had no contract to honor.

### Category 1 — Claude Code self-references

| Pattern (regex-style) | Where it appears, why it's banned                                                          |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `\.claude/`           | The runtime is Codex; `.claude/` is meaningless to it. `.codex/skills/` is the equivalent. |
| `CLAUDE\.md`          | Codex reads `AGENTS.md`, not `CLAUDE.md`.                                                  |
| `claude-code`         | Self-referential to a tool the generated project does not run.                             |
| `mcp__[a-z_]+`        | MCP tool names are Claude Code internal prefixes.                                          |
| `subagent`            | Claude Code-specific delegation primitive; Codex has no equivalent.                        |
| `@path/`              | Claude Code path-reference syntax; meaningless to Codex.                                   |

**Exception:** the skill's own files (the source at `.claude/skills/wp-requirements-to-goals/`) are not scanned — the sanitizer only scans the staging tree of files about to be `mv`d into the user's project root.

### Category 2 — Banned Claude Code APIs

| Pattern           | Why                                                                       |
| ----------------- | ------------------------------------------------------------------------- |
| `TaskCreate`      | Claude Code task-tracking API; Codex has no analog.                       |
| `TaskUpdate`      | Same.                                                                     |
| `TaskList`        | Same.                                                                     |
| `TaskGet`         | Same.                                                                     |
| `AskUserQuestion` | Claude Code interactive-prompt API; Codex agents do not interrupt to ask. |
| `WebFetch`        | Claude Code built-in tool name.                                           |
| `WebSearch`       | Same.                                                                     |
| `EnterPlanMode`   | Claude Code-specific session-mode primitive.                              |
| `ExitPlanMode`    | Same.                                                                     |

### Category 3 — Banned uninstall / destructive tokens (in `tests/test_plan.md` only)

| Pattern                                                 | Why                                                                                 |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `wp plugin uninstall`                                   | Destroys plugin state inside the shared dev wp-env that subsequent TCs depend on.   |
| `register_uninstall_hook`                               | Same — tests should not register or trigger uninstall hooks against the dev wp-env. |
| `uninstall\.php` (as a callable file path inside steps) | Same.                                                                               |
| `wp db reset`                                           | Wipes the wp-env database mid-suite.                                                |
| `DROP TABLE`                                            | Destructive SQL inside a test step.                                                 |

These checks are scoped to `goals/**/tests/test_plan.md` — the same tokens appearing in `goals/<NN>-integration/VERIFY.md` § Uninstall hygiene check section are intentional and allowed (that section runs against a disposable wp-env that gets discarded).

### Category 4 — Orphan placeholders (regex check)

Every `<lowercase-keyword>` pattern outside the whitelist is suspect:

```
<[a-z][a-z0-9-]*>
```

**Whitelist of intentional pattern markers** (these are documentation placeholders that must remain in shipped files):

- `<goal-folder>` — protocol argument name
- `<TC>`, `<TC-ID>` — per-TC subdirectory pattern
- `<session-name>` — protocol's session-name argument
- `<option_key>` — generic parameter in instructions
- `<base-url>` — protocol-internal variable
- `<post-id>`, `<product-id>`, `<order-id>`, `<page-id>`, `<user-id>` — runtime fixture variables captured during preconditions
- `<feature-slug>` — used inside templates that explicitly retain the marker form
- `<known-id>` — generic placeholder in fixture-loading prose
- `<artifact-class>`, `<artifact>` — clarification answers that may remain in some prose
- `<expression that reads the cross-page state>` and similar bracketed prose — meta-text for the implementer
- `<first page URL>`, `<second page URL>`, `<first page path>`, `<second page path>` — meta-text for cross-page TCs
- `<first page URL>` style angle-bracketed sentence fragments — meta-text not real placeholders
- `<one-line title>`, `<count>`, `<section name>`, etc. — table cells in goals-plan.md templates that are intentionally unfilled in the reference and get filled per project
- `<verbatim AC1 text condensed to a phrase>` and similar — meta-instructions inside templates

If a pattern matches the regex but isn't in the whitelist, the sanitizer aborts with the file path and line number for review.

### Category 5 — Absolute host paths

| Pattern                  | Why                                                    |
| ------------------------ | ------------------------------------------------------ |
| `/home/[a-zA-Z0-9_-]+/`  | A path on someone else's machine has zero portability. |
| `/Users/[a-zA-Z0-9_-]+/` | Same for macOS.                                        |
| `C:\\` or `C:/`          | Same for Windows.                                      |

Project-relative paths (`./<slug>/`, `goals/01-foo/`, `../../requirements.md`) are fine. The check is specifically for absolute-from-root host paths that wandered into the templates.

### Category 6 — Canonical protocol copy integrity

When the staging tree contains `protocols/run_goal_tests.md`, verify it against `references/verification-protocol.md` before allowing the phase to move files into the project root.

Rules:

- Extract the reference body only between lines that exactly equal `--- BEGIN PROTOCOL ---` and `--- END PROTOCOL ---`, excluding both marker lines.
- Do not match marker strings by substring; the reference prose mentions those strings before the real marker lines.
- The staged `protocols/run_goal_tests.md` must be byte-for-byte identical to that exact anchored extraction.
- The staged file must have substantial protocol content (over 100 lines), its first nonblank line must be `# run_goal_tests — Goal Verification Protocol`, and it must not contain either marker line.

Suggested extraction command for the comparison:

```bash
awk '/^--- BEGIN PROTOCOL ---$/ {copy=1; next} /^--- END PROTOCOL ---$/ {copy=0} copy {print}' \
  references/verification-protocol.md
```

Any mismatch is recorded as `protocols/run_goal_tests.md:1:protocol-copy-integrity:Canonical protocol copy integrity`.

## Protocol

Run the sanitizer over the staging tree of the current phase:

1. **Walk the tmp tree.** `find ${TMPDIR}/wp-requirements-to-goals-phase<N>-XXXX/ -type f`.
2. **Scan each file** against the five token/path categories above. Record every hit with `<path>:<line-number>:<matching-token>:<category>`.
3. **Run structural checks.** If `protocols/run_goal_tests.md` exists in the staging tree, run Category 6 protocol copy integrity. Record any hit with `<path>:<line-number>:<matching-token>:<category>`.
4. **Aggregate.** If zero hits, sanitizer passes; proceed to atomic `mv`.
5. **On any hit:**
   - Print every hit as a table (one row per hit, columns: file / line / token / category).
   - `rm -rf` the entire phase staging tree.
   - Stop the phase with a non-zero exit code. The project root is unchanged.
   - The user sees the violation table and the message: `Phase <N> aborted by sanitizer. Project root unchanged. Fix the violations in references/ and re-run.`

## Inputs vs outputs

The sanitizer scans only the **staging tree** (i.e., the files about to be `mv`'d into the project root). Banned tokens inside the user's source documents (`requirements.md`, `notes/`, `CLAUDE.md`, `AGENTS.md`) are recorded as Phase 1 warnings during Track A extraction — they do not abort generation. The author of the input had no contract with the sanitizer.

## What this sanitizer is NOT

- It is **not** a security scanner. It does not check for SQL injection, secret leakage, or anything covered by `npm audit` / Snyk / etc.
- It is **not** a code linter. Code quality inside `<slug>/src/` is the implementer's concern, not the sanitizer's.
- It is **not** a duplication checker. If a TC is duplicated across goals, that's a planning bug — the sanitizer doesn't catch it.

It catches the specific failure modes documented at the top of this file. Adding more categories later is fine; just keep them narrow and high-value.
