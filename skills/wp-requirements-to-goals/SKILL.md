---
name: wp-requirements-to-goals
description: "Convert a full WordPress plugin requirements.md (multiple user stories, edge cases, settings, cross-cutting features) into a complete Codex /goal-ready project — goals-plan.md, root scaffold (.wp-env.json, package.json, AGENTS.md, plugin bootstrap, run-goals.sh, protocols), and a layered goals/ tree (foundation, per-US, non-US, integration). The full-workflow counterpart to wp-spec-to-goal — that handles single-goal vague specs; this handles multi-goal full requirements. Probes the repo first to skip clarifications the filesystem already answers (slug, namespace, WP/PHP versions). Asks remaining clarifications in ≤3 rounds. Supports phased (checkpoint after plan) or one-shot mode. Detects an existing goals-plan.md and offers to resume from Phase 2. Supports extend mode — on a completed project, appends new goals and writes only new goal folders without disturbing what shipped. Codex-only outputs — never references Claude Code or .claude/."
disable-model-invocation: true
---

# wp-requirements-to-goals — Full WP Plugin Requirements → Codex /goal Project

Convert a complete WordPress plugin `requirements.md` (multiple user stories, edge cases, settings catalog, cross-cutting features) into the full project structure Codex `/goal` needs to drive autonomous implementation across many goal slices.

> **Prerequisite — playwright-cli.** Every goal's `VERIFY.md` runs its browser checks through [playwright-cli](https://raw.githubusercontent.com/microsoft/playwright-cli/refs/heads/main/README.md). Install it once on the machine that runs `/goal`: `npm install -g @playwright/cli@latest` then `playwright-cli install --skills` (needs Node.js 18+). Phase 2 also host-detects an installed `playwright-cli` skill and bundles it into `.codex/skills/` so Codex can reach it during execution.

```
project-root/
├── requirements.md           ← input
├── goals-plan.md             ← Phase 1 output
├── _shared/                  ┐
│   ├── project-config.md     │  ← Phase 1 (identity + env + skill refs, single source of truth)
│   └── dev-patterns.md       │  ← Phase 1 (extracted from input CLAUDE.md/AGENTS.md if present)
├── README.md                 │
├── AGENTS.md                 │
├── .wp-env.json              │
├── package.json              ├─ Phase 2 (root scaffold)
├── run-goals.sh              │  bash automation — drives every goal via codex exec
├── fixtures/.gitkeep         │
├── .codex/skills/            │  ← Phase 2 (host-detected playwright-cli skill, if bundled)
│   └── playwright-cli/       │
├── <slug>/                   │  plugin bootstrap (folder name = slug)
│   ├── <slug>.php            │
│   ├── src/Plugin.php        │
│   └── composer.json         │
├── protocols/                │
│   └── run_goal_tests.md     ┘  canonical verification protocol
└── goals/
    ├── 00-foundation/        ← Phase 3 (walking skeleton)
    ├── 01-usXX-<slug>/       ┐
    ├── 02-usXX-<slug>/       ├─ Phase 4 (one folder per US)
    ├── ...                   ┘
    ├── NN-<feature-slug>/    ← Phase 5 (one per non-US feature)
    └── NN-integration/       ← Phase 6 (cross-cutting + edge-case suite)
```

`_shared/` is the cross-goal vocabulary home: `project-config.md` carries APP_NAME / NAMESPACE / CSS_PREFIX / ports / credentials / skill references, and per-phase templates indirect into it instead of inlining the values. `dev-patterns.md` is populated only when the input project has a `CLAUDE.md` or `AGENTS.md` worth extracting from; otherwise it's omitted. See `references/scaffold-templates.md` for both files' templates.

Each goal folder contains:

```
goals/NN-slug/
  GOAL.md                  objective, scope, ACs, allowed paths, depends-on, DoD
  VERIFY.md                wp-env up + domain check + browser protocol invocation + manual smoke
  PROGRESS.md              audit trail (populated by /goal during execution)
  tests/
    test_plan.md           one TC per AC + one TC per owned edge case
    domain.eval.txt        wp eval-file script for server-side checks
```

## When to use this skill vs wp-spec-to-goal

|          | `wp-spec-to-goal`                             | `wp-requirements-to-goals` (this)                                    |
| -------- | --------------------------------------------- | -------------------------------------------------------------------- |
| Trigger  | `/wp-spec-to-goal`                            | `/wp-requirements-to-goals`                                          |
| Input    | Vague paragraph or short spec                 | Full `requirements.md` with US-NN tags, settings catalog, edge cases |
| Output   | One goal trio at `goals/<slug>/`              | `goals-plan.md` + scaffold + many goal folders                       |
| Best for | One-slice features, small plugins, prototypes | Multi-story plugins, real builds with regression sweep               |

If the user's input is one paragraph or one feature, send them to `wp-spec-to-goal`. Use this skill when there's a structured requirements document with multiple user stories, edge cases, settings, and at least one cross-cutting concern.

## Output rule — Codex-only, never Claude Code

The skill itself lives at `.claude/skills/wp-requirements-to-goals/`, but its **outputs** must make zero mention of Claude Code or `.claude/`. The user runs the generated project entirely through Codex `/goal`. Specifically:

- Do **not** generate `.claude/commands/run_goal_tests.md` or any other `.claude/` file.
- Do **not** include "Claude Code shorthand: `/run_goal_tests …`" lines anywhere in `VERIFY.md`, `README.md`, `AGENTS.md`, or any goal-folder file.
- The only verification entry point in generated files is `protocols/run_goal_tests.md`, referenced as: _"Follow `protocols/run_goal_tests.md` with `<goal-folder>` = goals/NN-slug"_.
- `AGENTS.md` addresses Codex (the agent that will run `/goal`), not Claude Code.

This rule overrides any Claude-Code-related text inherited from the source prompts. Strip those lines before writing.

## Inputs

- **Mandatory:** `requirements.md` at the project root, OR a path passed as a skill argument (e.g., `/wp-requirements-to-goals docs/spec.md`). If a path is passed, treat it as the requirements doc and infer the project root from its parent directory.
- **Optional:** `notes/` directory at the project root — supplementary context the planner reads if present.
- **Detected, not asked-for:** any pre-existing `goals-plan.md`, `<slug>/`, `.wp-env.json`, `package.json`, `AGENTS.md`, `protocols/run_goal_tests.md` at the project root.

If `requirements.md` is missing and no path was passed, stop and tell the user where to put the file or how to pass the path.

## Core flow

The skill runs in 6 phases. The user picks phased-with-checkpoint or one-shot at the very start:

1. **Phase 1 — Plan decomposition** → writes `goals-plan.md`, `_shared/project-config.md`, and `_shared/dev-patterns.md` (the last only when the input has source patterns worth extracting). Read `references/plan-decomposition.md`.
2. **Phase 2 — Project scaffold** → writes root config + `<slug>/` plugin bootstrap + `protocols/run_goal_tests.md` + (when present on host) bundles `.codex/skills/playwright-cli/`. Read `references/scaffold-templates.md`.
3. **Phase 3 — Goal 00 Foundation** → writes `goals/00-foundation/` with a walking-skeleton scenario (read `references/foundation-template.md`).
4. **Phase 4 — Per-US goals** → one folder per US in the plan (read `references/per-us-template.md`).
5. **Phase 5 — Non-US feature goals** → one folder per feature (read `references/non-us-template.md`). Skipped if the plan lists no non-US features.
6. **Phase 6 — Integration goal** → cross-cutting + edge-case suite (read `references/integration-template.md`).

## Sanitize + atomic write contract (cross-cutting)

Every phase that emits files follows this two-step write contract:

1. **Stage to tmp.** Write the phase's outputs into a unique temporary tree (`${TMPDIR:-/tmp}/wp-requirements-to-goals-phase<N>-XXXX/`). Mirror the project-root layout inside that tree — relative paths are identical to the final destination so users can diff between staging and live.
2. **Sanitize, then atomic mv.** Run the sanitizer (`references/sanitizer.md`) over the whole tmp tree. On a clean pass, `mv` each top-level entry into the project root. On any sanitizer hit, `rm -rf` the tmp tree and stop with the exact violation table printed to the user — never partially apply.

The sanitizer enforces:

- No Claude-Code self-references (`.claude/`, `CLAUDE.md`, `@path/`, `mcp__`, etc.) in outputs.
- No banned Claude-Code APIs (`TaskCreate`, `AskUserQuestion`, `WebFetch`, etc.) in outputs.
- No banned uninstall tokens in any `tests/test_plan.md` (`wp plugin uninstall`, `register_uninstall_hook`, `wp db reset`, `DROP TABLE`, etc.). See Step 7 below and `references/sanitizer.md` for the full list.
- No leftover skill-time placeholders (`<slug>`, `<Namespace>`, `<NN>`, etc. outside the whitelist of intentional pattern markers documented under "Substitution and filling rules").
- No absolute host paths (`/home/`, `/Users/`, `C:\`).
- If `protocols/run_goal_tests.md` is staged, it must match the exact anchored extraction from `references/verification-protocol.md` between full-line `--- BEGIN PROTOCOL ---` and `--- END PROTOCOL ---` markers.

**Inputs are warned, outputs are strict.** Banned tokens detected inside `requirements.md`, `CLAUDE.md`, or other input files surface as Phase 1 warnings only — never as aborts. The author of the input had no contract to honor. Banned tokens detected in _generated_ outputs abort immediately.

The atomic-write rule also means that on a sanitizer abort, the project root is left exactly as it was before the phase started. Re-running the skill after fixing the offending content is safe and idempotent.

Read `references/sanitizer.md` before generating any file. Every phase's reference document repeats the contract by pointing back at this section.

## Step 0 — Probe, mode selection, and resume/extend detection

Before Phase 1, run the probe and decide which of three paths applies: **fresh build** (new project), **resume** (interrupted generation), or **extend** (completed project, adding features).

### 0a. Probe the project

Inspect the cwd silently before asking the user anything. The point is to ground recommendations in the actual repo state so the skill doesn't waste rounds on questions the filesystem already answers.

| Signal                                                                                    | Inference                                                                           |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `requirements.md` exists                                                                  | Mandatory input present (skill stops if missing — see Stop conditions)              |
| `notes/` directory exists                                                                 | Supplementary spec context — read during Phase 1                                    |
| `goals-plan.md` exists                                                                    | Plan was previously generated — triggers 0c (resume) or 0d (extend)                 |
| `goals-plan.md` has filled-in `clarifications:` YAML block                                | Plan is real, not a half-written stub                                               |
| `package.json` exists with `name` field                                                   | Slug already chosen — pre-fill in Phase 1, ask to confirm rather than open-question |
| `package.json` has `@wordpress/env` in devDependencies                                    | wp-env scaffold already in place                                                    |
| `.wp-env.json` exists with `core: WordPress/WordPress#<version>`                          | WP version chosen — confirm rather than ask fresh                                   |
| `.wp-env.json` exists with `phpVersion: <version>`                                        | PHP version chosen — same                                                           |
| `<slug>/<slug>.php` exists with `Plugin Name:` header                                     | Display name + slug + bootstrap done — skip those questions in Phase 1/2            |
| `<slug>/<slug>.php` has an `Author:` header                                               | Author chosen — skip the Phase 2 author question                                    |
| `<slug>/composer.json` exists with `name` field                                           | Composer vendor chosen — skip the Phase 2 vendor question                           |
| `protocols/run_goal_tests.md` exists                                                      | Phase 2 scaffold complete                                                           |
| `run-goals.sh` exists at project root                                                     | Phase 2 scaffold complete                                                           |
| `AGENTS.md` exists at project root                                                        | Phase 2 scaffold complete                                                           |
| `goals/00-foundation/` exists                                                             | Phase 3 scaffold or Goal 00 implementation underway                                 |
| `goals/00-foundation/PROGRESS.md` shows a "complete" / "Goal achieved" marker             | Goal 00 finished — at minimum a partial build exists                                |
| Every `goals/[0-9][0-9]-*/PROGRESS.md` shows completion (especially the integration goal) | **Completed project** — strong signal for extend mode                               |
| `<slug>/src/` contains substantive PHP beyond the bootstrap                               | Implementation past the scaffold                                                    |

The probe is read-only. Don't print every detected signal — just use the inferences to decide between 0b/0c/0d and to pre-fill Phase 1/2 answers.

### 0b. Detect completed project (offer extend mode)

If the probe shows a **completed project** — `goals-plan.md` exists with filled-in clarifications, the integration goal's `PROGRESS.md` shows completion, and `<slug>/src/` has real implementation — ask the user:

> This looks like a completed plugin: every goal in `goals-plan.md` is marked done. Are you adding new features to it (extend mode), or do you want to regenerate from scratch?

Use `AskUserQuestion` with two options: **Extend with new goals (Recommended)** — appends new goal folders without disturbing existing ones — and **Regenerate from scratch**. If extend, jump to the "Extend mode" section near the end of this file. If regenerate, continue to 0c (and warn the user that the existing scaffold may conflict).

Skip this question entirely if the integration goal isn't complete — that's a partial build, not a finished project, and resume (0c) is the right path.

### 0c. Detect existing plan (resume)

Check whether `goals-plan.md` already exists at the project root and the project is **not** in extend territory. If it does, ask the user:

> Found `goals-plan.md` at the project root. Resume from Phase 2 (scaffold) using the existing plan, or regenerate the plan from `requirements.md`?

Use `AskUserQuestion` with two options: **Resume from Phase 2 (Recommended)** — keeps user edits to the plan intact — and **Regenerate plan**. If they pick resume, skip directly to Phase 2 and treat the existing `goals-plan.md` as authoritative for slug, namespace, sequencing, etc. If they pick regenerate, continue to 0d and Phase 1 normally.

### 0d. Pick execution mode

Ask:

> How should I run? **Phased** stops after Phase 1 (the plan) so you can review/edit before scaffolding. **One-shot** runs all six phases end-to-end with no checkpoints.

Two options: **Phased — checkpoint after plan (Recommended)** — the plan decomposition is the riskiest decision; everything else flows from it deterministically — and **One-shot — no checkpoints**.

Record the chosen mode. Do not start Phase 1 until both questions are answered.

If the user resumed in 0c, you can skip 0d: resumed runs continue without further checkpoints (the user already approved the plan by editing or accepting it). Extend mode (0b) has its own flow described in the Extend mode section below.

## Phase 1 — Plan decomposition

Read `references/plan-decomposition.md` for the full instructions, the 9 clarification points to ask, and the exact `goals-plan.md` template.

Summary of this phase:

1. Read `requirements.md` (and `notes/` if present).
2. **Scan for source patterns.** Look at the input project root for `CLAUDE.md`, `AGENTS.md`, or `.claude/CLAUDE.md`. If any exist, extract H2/H3 sections whose headings match the dev-patterns keyword set (`pattern`, `convention`, `hook`, `namespace`, `banned`, `required`, `do not`, `must`, `style`, `lint`, `rule`) into `_shared/dev-patterns.md`. Skip silently if none of those sources exist. See `references/plan-decomposition.md` § "Track A extraction" for the heuristic.
3. **Probe `.wp-env.json`.** If present, read `port` (default 8888) and `testsPort` (default 8889). If absent, emit a Phase 1 warning ("No .wp-env.json found; using default ports 8888 (dev) / 8889 (tests). Edit `.wp-env.json` later to override.") and proceed with the defaults.
4. Run **all** clarification rounds — identity (display name, slug, namespace, **CSS_PREFIX**, **PHP_PREFIX**, text domain), WP/PHP versions, required plugins, TC priority defaults, edge-case ownership ambiguities, sequencing override. Batch ≤4 questions per `AskUserQuestion` call; ≤3 rounds total. Always include a recommendation, listed first, with one-sentence rationale.
5. Write `goals-plan.md` at the project root using the template in `references/plan-decomposition.md`, with the user's answers recorded in the `clarifications:` YAML block at the top.
6. Write `_shared/project-config.md` (the project-wide vocabulary single source of truth — Identity, Environment, Test Credentials, Skill References, Optional Commands tables). **First-write only:** if the file already exists, skip writing and print one note `_shared/project-config.md exists; preserving user edits`. The user owns the file after first write.
7. Write `_shared/dev-patterns.md` from step 2 (only when patterns were extracted).

If the mode is **phased**, stop after writing `goals-plan.md` and print:

```
Plan written: <N> user stories, <M> non-US features, <P> total goals.

Review goals-plan.md. Edit it directly if you want changes.
When ready, reply "continue" or re-run /wp-requirements-to-goals to resume from Phase 2.
```

Wait for user approval. If they reply with anything other than approval, respond and re-prompt.

If the mode is **one-shot**, continue immediately to Phase 2 with no print between phases beyond a short progress line.

## Phase 2 — Project scaffold

Read `references/scaffold-templates.md` for the full instructions, the 5 clarification points, and the exact contents of every scaffold file.

Summary:

1. Read `goals-plan.md` and `_shared/project-config.md` for slug, namespace, identity vocabulary, ports, WP/PHP versions, required plugins.
2. Run the Phase 2 clarification round — author name, composer vendor, wp-env extras, `WP_DEBUG_LOG` toggle. (Most can move quickly because the planner already settled their defaults; identity values now live in `_shared/project-config.md`.)
3. **Host-detect playwright-cli skill.** Probe the host filesystem for `.claude/skills/playwright-cli/`. If present, copy the whole directory into `<project-root>/.codex/skills/playwright-cli/`. If absent, log `playwright_cli_bundled: no` in `goals-plan.md` and strip the corresponding reference line from the AGENTS.md template. Codex (the runtime) reads bundled skills from `.codex/skills/` — Claude Code's `.claude/skills/` mirror is not available inside Codex sessions.
4. Detect any pre-existing scaffold files (`.wp-env.json`, `<slug>/<slug>.php`, etc.). For each conflict, ask the user before overwriting — never silently clobber.
5. Write all scaffold files including `protocols/run_goal_tests.md`. For the protocol, read `references/verification-protocol.md` and copy only the body between marker lines that exactly equal `--- BEGIN PROTOCOL ---` and `--- END PROTOCOL ---` (marker lines excluded). Do **not** search for the marker text as a substring; the reference prose mentions those strings before the real markers. After writing, compare the staged `protocols/run_goal_tests.md` byte-for-byte against that exact anchored extraction before sanitizer/atomic move.
6. Copy `references/run-goals-template.sh` verbatim to `<project-root>/run-goals.sh` and set it executable (`chmod +x run-goals.sh`). The template is generic — no substitution. Always overwrite an existing `run-goals.sh` so the project tracks the current template version.
7. **Do not** write a `.claude/commands/` shim. Do not mention Claude Code in any output file. `.codex/skills/` is allowed (and indeed required) for Codex — it is `.claude/` that the output rule forbids.

Note: the scaffold generates the plugin folder named after the slug (e.g., `autofomo/`), never the literal name `plugin/`. WordPress activation uses the folder name as the plugin identifier.

## Phase 3 — Goal 00 Foundation

Read `references/foundation-template.md` for the full instructions, the 5 clarification points (the most important being the walking-skeleton scenario), and the exact templates.

Summary:

1. Run the Phase 3 clarification round. The walking-skeleton question is the most plugin-specific decision in the entire skill — derive 2-3 concrete scenario options from `requirements.md` and let the user pick. Examples by plugin shape:
   - notification-style → "one hardcoded fake notification renders on the homepage"
   - content-injection → "a sample disclosure renders before/after a sample post"
   - widget → "a sample widget renders in a known sidebar"
   - admin-tool → "a sample row appears in the admin list page"
2. Write `goals/00-foundation/{GOAL.md, VERIFY.md, PROGRESS.md, tests/test_plan.md, tests/domain.eval.txt}`.
3. The Foundation goal's ACs always include: clean activation, options registered with defaults from the Settings catalog, dependency check (if any required plugin), assets enqueued on the public site, the walking-skeleton artifact rendering, a stable CSS class for the artifact.
4. The `tests/domain.eval.txt` file's `$expected` array must be populated from the Settings catalog in `goals-plan.md` — every option key + default.

## Phase 4 — Per-US goals

Read `references/per-us-template.md` for the full instructions, the 5 clarification points (per US), and the exact templates.

Summary:

1. Iterate over every US in `goals-plan.md` "Proposed sequence", in order.
2. For each US, run the Phase 4 clarification round: TC priority, test data values, ambiguous AC interpretation, fixture mechanism (asked once across the whole phase, not per US), viewport behavior (only for responsive USes).
3. Write `goals/<NN>-<us-id>-<slug>/{GOAL.md, VERIFY.md, PROGRESS.md, tests/test_plan.md, tests/domain.eval.txt}`.
4. **AC text is verbatim** from `requirements.md`. Never paraphrase or summarize.
5. Edge cases owned by this US (per `goals-plan.md`) get their own TC in `test_plan.md`.
6. `tests/domain.eval.txt` is a no-op stub printing `OK` if the US is pure-frontend; otherwise it exercises PHP entry points.

## Phase 5 — Non-US feature goals

Read `references/non-us-template.md` for the full instructions and templates.

Summary:

1. If `goals-plan.md` lists no non-US features, skip Phase 5 entirely.
2. For each feature, run the Phase 5 clarification round: AC list derived from prose (show proposed list and ask user to confirm/edit), cross-cutting behavior signals (e.g., `data-source` attribute), fixture data source, TC priority.
3. Write `goals/<NN>-<feature-slug>/...`. The feature slug strips the `FEAT-` prefix.
4. ACs are **derived from prose**, not copied verbatim — the source paragraph reference is appended to each AC for traceability.

## Phase 6 — Integration goal

Read `references/integration-template.md` for the full instructions and templates.

Summary:

1. Run the Phase 6 clarification round: cross-cutting TCs to include, edge-case ownership for unowned cases, non-flakiness threshold (default 3 consecutive identical-pass runs), uninstall hygiene scope.
2. Write `goals/<NN>-integration/...` where `<NN>` is the highest goal index.
3. The Integration goal's `tests/test_plan.md` holds **only** cross-cutting / multi-goal TCs and edge cases not already owned by a previous goal. Per-goal regression is handled by step 3 of `VERIFY.md`, which re-invokes the verification protocol against every previous goal folder in sequence.
4. The Integration ACs always include: every previous goal's TCs still pass, this goal's TCs pass, domain integration check passes, every edge case from `goals-plan.md` is covered, `WP_DEBUG_LOG` empty after a full run, uninstall leaves zero orphaned options/tables.

## Extend mode — adding features to a completed plugin

Triggered by Step 0b when the probe shows a completed project (filled `clarifications:` block in `goals-plan.md`, integration goal's `PROGRESS.md` complete, `<slug>/src/` has real implementation). The user explicitly confirmed "extend with new goals."

Extend mode **appends** new goal slices to a finished project without touching anything that already shipped. The existing scaffold, foundation, US goals, non-US goals, integration goal, and their PROGRESS.md audit trails are read-only inputs — never regenerated.

### Inputs

- The completed project (everything under the project root)
- A description of what's being added — either:
  - The user types it inline ("add a user-stories export to CSV", "add WP-CLI support for the import command"), OR
  - The user updated `requirements.md` with new US tags or new feature paragraphs, OR
  - The user dropped a new `requirements-extend.md` (or similar) with the deltas

Ask which form their additions take. Recommend inline for small additions; recommend the file form when there are 2+ new user stories or substantial new ACs.

### Flow

1. **Read existing state**, do not modify:
   - `goals-plan.md` — pull slug, namespace, WP/PHP versions, the existing sequence, and the highest goal index (`max_NN`)
   - `<slug>/<slug>.php` — confirm plugin metadata matches the plan
   - `goals/<max_NN>-integration/GOAL.md` and `tests/test_plan.md` — understand what the previous integration sweep already covers, so the new goals don't duplicate it
2. **Ask the extend clarifications** (one or two `AskUserQuestion` rounds):
   - **New user stories** — confirm the list. Use the same US-NN tagging convention as the original `requirements.md`. Recommend continuing the numbering (if the old plan had US-01 through US-05, new ones start at US-06).
   - **New non-US features** — same, continuing `FEAT-NN`.
   - **New edge-case ownership** — for each new edge case, ask which new goal owns it.
   - **Slot strategy** — recommended: **append after existing integration** (new goals become `<max_NN+1>-...`, `<max_NN+2>-...`, etc., then optionally a new integration extension). Alternate: re-number existing integration (more disruptive — only suggest if there's a compelling reason).
   - **New integration goal?** — recommended: **yes**, write a new `<NEW_NN>-integration-extension` goal that runs the original integration's regression sweep PLUS new cross-cutting TCs for the additions. Alternate: skip if the new goals don't introduce cross-cutting concerns — but warn the user this means no consolidated regression for the v2 surface.
3. **Append to `goals-plan.md`** (do not rewrite):
   - Append new rows to "Proposed sequence" — one row per new goal, numbered `max_NN+1`, `max_NN+2`, etc., with `Depends on` pointing at the existing integration goal (or whatever the user picked as the slot).
   - Append new rows to "Allowed paths per goal" — one section per new goal.
   - If new edges or new settings exist, append to those sections.
   - Add an `## Extension <date>` heading above each appended block so the audit trail makes it obvious when each batch landed.
4. **Write only the new goal folders**:
   - One folder per new US (use `references/per-us-template.md` as before)
   - One folder per new non-US feature (use `references/non-us-template.md`)
   - One folder for the new integration extension (if chosen — use `references/integration-template.md`, but explicitly scope the cross-cutting TCs to the new surface area and reference the original integration goal as a baseline)
   - **Never** touch `goals/00-foundation/`, the original US/feat goals, or the original integration goal.
5. **Do not run Phase 2** (scaffold). The existing scaffold is intact.
6. **Do not run Phase 3** (foundation). Goal 00 is already shipped.

### Hand off

After writing, print:

```
=== Extension complete ===

Appended to goals-plan.md:
  - <list new sequence rows>

New goal folders:
  - goals/<NEW_NN>-usXX-<slug>/
  - goals/<NEW_NN+1>-...
  - goals/<NEW_NN+M>-integration-extension/   (if chosen)

Existing goals untouched: goals/00-foundation/ through goals/<max_NN>-integration/

To run only the new goals:
  ./run-goals.sh --from <NEW_NN>
```

The user runs only the new goals through `run-goals.sh --from <NEW_NN>`. The script's per-goal regression rule means each new goal's `VERIFY.md` still re-verifies all earlier goals as part of evidence-based completion, so v1 doesn't regress.

### Rules

- Extend mode is the only time the skill writes to `goals-plan.md` without writing it fresh.
- Extend mode never overwrites existing goal folders. If a slug collision happens (new US-NN slug matches an existing folder), stop and ask the user to rename.
- Extend mode never regenerates the scaffold or the foundation goal. If the user wants the scaffold updated to a newer template, they re-run the skill with "Regenerate" in 0c, accepting that it will overwrite the relevant scaffold files.
- The `<NEW_NN>-integration-extension` goal's `VERIFY.md` step 3 must re-invoke the protocol against **every** previous goal folder (the original integration goal already does this for v1, but the extension must explicitly include both the original goals and the new ones — otherwise a v2 build can pass without re-checking v1).

## Final summary

After Phase 6, print exactly this layout (with placeholders substituted):

```
=== Generation complete ===

Project root files:
  - README.md
  - AGENTS.md
  - .wp-env.json
  - package.json
  - run-goals.sh                         (bash automation, drives codex exec)
  - goals-plan.md

Shared vocabulary (single source of truth):
  - _shared/project-config.md            (identity, environment, credentials, skill refs)
  - _shared/dev-patterns.md              (only when extracted from input CLAUDE.md / AGENTS.md)

Plugin bootstrap (folder name = slug):
  - <slug>/<slug>.php
  - <slug>/src/Plugin.php
  - <slug>/composer.json

Bundled skills (only when host has them):
  - .codex/skills/playwright-cli/        (browser-automation contract, copied from host)

Verification protocol:
  - protocols/run_goal_tests.md          (canonical, agent-agnostic)

Goals generated:
  - goals/00-foundation/
  - goals/01-usXX-<slug>/
  - ...
  - goals/<NN>-integration/

Total: <count> goals.

Next steps:
  1. cd <project-root>
  2. npm install
  3. (in <slug>/) composer install && composer dump-autoload
  4. Make sure Docker is running (wp-env needs it) and codex is installed:
       npm install -g @openai/codex && codex login   # one-time
  5. Drive the whole chain non-interactively:
       ./run-goals.sh
     This starts wp-env, runs `codex exec` against every goal in order
     (00 → 01 → ... → integration) using the standard /goal prompt, and stops
     wp-env on clean exit. On failure it leaves wp-env up and prints a
     resume command (e.g., `./run-goals.sh --from 04`).

     Useful flags:
       ./run-goals.sh --dry-run         preview the exact codex exec calls
       ./run-goals.sh --from 03         skip 00–02, resume from goal 03
       ./run-goals.sh --to   05         stop after goal 05
       ./run-goals.sh --only 04         run a single goal
       ./run-goals.sh --no-env          skip the wp-env start/stop bracket

  6. Manual fallback — if you'd rather drive each goal interactively in Codex:
       npm run env:start
       codex
       # Inside Codex:
       /goal Complete the objective in goals/00-foundation/GOAL.md.
            Source of truth: goals/00-foundation/GOAL.md and VERIFY.md.
            Update goals/00-foundation/PROGRESS.md as you work.
     For each subsequent goal: paste the same shape with the next folder.
     /goal follows protocols/run_goal_tests.md inline as part of evidence-based
     completion, so no separate verification step is needed.
  7. End with the Integration goal for full regression.
```

## Substitution and filling rules (apply to every phase)

**Project-wide vocabulary lives in `_shared/project-config.md`.** Identity values (APP_NAME, NAMESPACE, CSS_PREFIX, PHP_PREFIX, TEXT_DOMAIN), environment values (DEV_PORT, TEST_PORT, DEV_URL, ADMIN_URL), and skill references are written once at Phase 1, and downstream files indirect to that file with prose like "read `../_shared/project-config.md` → `NAMESPACE`" rather than inlining the literal value. Indirection makes a later rename safe — change one file, the rest of the project follows.

Path-style placeholders (`<NN>`, `<us-id>`, `<NN>-<slug>`) are per-iteration and stay literal substitution at scaffold time — they're not project-wide vocabulary, they're per-goal identifiers. Only identity / environment / credentials are indirected through `project-config.md`.

- **Slug** — kebab-case, derived from plugin display name. Confirmed in Phase 1.
- **Namespace** — PascalCase form of slug (e.g., `auto-fomo` → `AutoFomo`). Confirmed in Phase 1.
- **Plugin folder name == slug.** Always. Never use the literal string `plugin/`.
- **AC text is verbatim** from `requirements.md` for per-US goals. Edge case text is verbatim. Settings option keys + defaults come from the Settings catalog in `goals-plan.md`.
- **Allowed paths per goal** are pulled verbatim from `goals-plan.md` "Allowed paths per goal" → that goal's section.
- **Depends on** is pulled verbatim from `goals-plan.md` "Proposed sequence" → "Depends on" column for that row.
- **Session names** for playwright-cli are deterministic: `goal-<NN>-<rest-of-folder-name>`. The verification protocol derives this from the goal folder argument; the test plans must match.
- **wp-env routing.** Every command that uses a tool inside the wp-env container (WordPress, WP-CLI, composer, php, phpunit) is written through the package.json `env:cli` script. The script is defined as `wp-env run cli wp` so `npm run env:cli -- <wp-subcommand>` becomes `wp eval-file <path>` etc. inside the container. Native tools (`npm`, `node`, `npx`, `playwright-cli`, `git`) stay native. Never emit bare `wp …`, `composer …`, `php …`, or `phpunit …` — those target the host's PHP/MySQL, not the container.
- **Path conventions for `eval-file`.** The wp-env container mounts the host project root at `/var/www/html`, so paths in `eval-file` are written **relative to the project root** — e.g., `npm run env:cli -- eval-file goals/00-foundation/tests/domain.eval.txt`. The kit's `tests/domain.eval.txt` lives inside each goal folder; that path resolves inside the container because the project root is mounted.
- **No placeholders left behind — but distinguish intentional pattern markers from real placeholders.** Some `<...>` markers are intentional documentation patterns and **must remain** in generated files:
  - `<goal-folder>` — the protocol's argument name in the prose "Follow `protocols/run_goal_tests.md` with `<goal-folder>` = `goals/00-foundation`". The actual value is on the right side of `=`. The angle-bracket form on the left names the protocol's input parameter.
  - `<TC>` in path patterns like `test-artifacts/<TC>/recording.webm` — names the per-TC subdirectory pattern.
  - `<option_key>` in generic instructions like "Verifiable via `npm run env:cli -- option get <option_key>` for each option key" — describes a parameter, not an unfilled value.
  - `<session-name>` in the protocol's documentation — the protocol's session-name argument.

  Test-plan **fixture variables** are also intentional and must remain — placeholders like `<post-id>`, `<product-id>`, `<order-id>`, `<page-id>`, `<user-id>` represent runtime IDs that the test agent captures in preconditions ("create a post and capture its ID as `<post-id>`") and substitutes when running the test. These are different from skill-time placeholders. The test plan's preconditions section must explicitly document the capture step ("seed a published post with content X and record `<post-id>`") so the runtime agent knows what to fill in.

  Everything else `<...>` or `{{...}}` must be substituted **at skill generation time**, before writing. Specifically watch for: `<slug>`, `<Namespace>`, `<NN>`, `<us-id>`, `<US-ID>`, `<Title>`, `<Plugin Name>`, `<artifact-class>`, `<feature-slug>`, `<required-plugin>`, `<wp_version>`, `<php_version>`, `<vendor>`, `<known-id>` (and any other ad-hoc TODO markers). After generating each file, scan it once more — if you spot any of those, you missed a substitution. The intentional-pattern markers and fixture variables above are the only safe-to-leave forms.

## Clarification rounds

The skill clarifies **exhaustively** — every kit-defined decision point is asked unless the probe (Step 0a), `requirements.md`, or `goals-plan.md` already gives a definite answer. "Definite" means: a value is stated explicitly with no ambiguity. "WordPress 6.5+ minimum" in `requirements.md` is definite; "WordPress 6.x" is not (which 6.x?). When in doubt, ask.

Use `AskUserQuestion` for every clarification round. Each question must:

- Be specific (ends with `?`).
- Have 2-4 options.
- Have a `(Recommended)` option listed first, with a one-sentence rationale that references the source artifact when applicable (e.g., "Recommended: 6.5 — most active WP install base, `requirements.md` mentions block editor features that need it").

Batch ≤4 questions per call. Run multiple calls back-to-back when a phase has more decisions. Do not write any files between clarification calls — resolve everything first, generate after.

### Confidence check after each round

After each clarification round, ask yourself: _"If I started writing files for this phase right now, what could go wrong because of something I still don't know?"_

- If "not much" → proceed to the generation step for that phase.
- If meaningful unknowns remain → run one more focused round on just the gaps.
- If you've done the max rounds for the phase and confidence is still below ~95% → stop and tell the user that the spec needs more detail. Don't paper over with guesses.

The probe (Step 0a) often closes more gaps than the user expects. Re-read its inferences before declaring a remaining unknown.

### Recommendation heuristics

When the probe and `requirements.md` are silent, propose these defaults. Each phase's reference file has the full reasoning; this table is the at-a-glance summary.

| Area              | Heuristic                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| Identity          | Kebab-case slug from display name; honor an explicit existing `package.json` `name`                                   |
| Versions          | WP 6.5 / PHP 7.4 unless `requirements.md` states otherwise — never override an explicit user-stated minimum           |
| Scope             | Narrowest interpretation that satisfies every AC; out-of-scope wins ties                                              |
| Sequencing        | Foundation → rendering-core US → other USes → admin-visibility US → admin-settings US → non-US features → Integration |
| Goal slicing      | One goal per US; cross-cutting concerns into non-US features; cohesive cross-goal sweeps into the Integration goal    |
| Verification      | Browser TCs for every AC with a visible artifact; domain TCs for every settings option; both for hybrid USes          |
| Edge cases        | Most natural owning goal first; only ask when 2+ goals are plausible owners                                           |
| AC fidelity       | AC text is **verbatim** from `requirements.md` — never paraphrase or summarize                                        |
| Source precedence | Probe and `requirements.md` always beat skill defaults — if either gives a definite value, use it                     |

## Stop conditions

Three tiers. Each is surfaced through `AskUserQuestion` (not a silent abort) so the user can override on the rare occasion they have context the skill is missing.

### Hard stops — refuse and explain

| Condition                                                                                     | Reason                                                      |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `requirements.md` is missing and no path was passed                                           | The skill needs a source of truth to decompose              |
| Project root contains a different plugin in `<slug>/` than the one requested                  | Slug collision — proceeding risks clobbering unrelated code |
| Project is clearly non-WordPress (no PHP, requirements describe a CLI / web app / mobile app) | Use `cli-spec-to-goal` or `webg-spec-to-goal` instead       |

### Soft stops — warn and offer alternatives

| Condition                                                                                          | Response                                                                                                                               |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `requirements.md` lacks tagged user stories AND a "User Stories" section AND a "Use Cases" section | Ask: proceed with prose-derived USes (lower confidence) or pause for the user to add structure?                                        |
| Bug-fix request, not a feature build                                                               | Point at the bug-fix templates in `_canvas/codex-goal/codex-goal-templates.md` — they're the right shape, this skill is the wrong tool |
| Single-paragraph spec, no real requirements doc                                                    | Point at `wp-spec-to-goal` — that's the single-goal counterpart for vague specs                                                        |

### Standard stops — ask instead of guessing

| Condition                                                                                                                                                           | Action                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| A Phase clarification has more than 4 plausible options                                                                                                             | Ask via free-form question instead of squeezing into 4 multiple-choice options |
| User-edited `goals-plan.md` has structural problems (missing sections, malformed clarifications YAML, references to USes not in the AC list)                        | Point at the specific problem, ask for a fix before continuing                 |
| Probe inference conflicts with `requirements.md` (e.g., requirements say WP 6.0+ but existing `.wp-env.json` pins 6.5)                                              | Surface the conflict, ask which is authoritative                               |
| 3+ clarification rounds in a phase and confidence still below 95%                                                                                                   | Tell the user the spec needs more detail; don't paper over with guesses        |
| Extend mode: new US-NN or feature slug collides with an existing goal folder                                                                                        | Ask the user to rename before writing                                          |
| Extend mode: completed project state doesn't match `goals-plan.md` (e.g., PROGRESS.md shows completion but `<slug>/src/` is missing files claimed in Allowed paths) | Surface the inconsistency, ask whether to proceed or audit first               |

## What this skill does not do

- It does not implement any plugin code. That's `/goal`'s job inside Codex.
- It does not run tests. That's `/goal`'s job (and `protocols/run_goal_tests.md`).
- It does not work for non-WordPress projects.
- It does not handle bug-fix workflows. For bug fixes, use the bug-fix templates in `_canvas/codex-goal/codex-goal-templates.md` directly.
- It does not generate single-goal trios from one-paragraph specs — that's `wp-spec-to-goal`'s job.
- It does not generate Claude Code shims, slash commands, `.claude/` files, or any other Claude-Code-specific artifacts. Outputs are Codex-only.

## Reference files

Each phase has detailed instructions and full template content in a dedicated reference. Read the relevant reference before generating that phase's files.

- `references/plan-decomposition.md` — Phase 1: how to read `requirements.md`, the 9 clarification points, the `goals-plan.md` template.
- `references/scaffold-templates.md` — Phase 2: clarification points + every scaffold file's exact contents (`README.md`, `AGENTS.md`, `.wp-env.json`, `package.json`, `<slug>/<slug>.php`, `<slug>/src/Plugin.php`, `<slug>/composer.json`).
- `references/foundation-template.md` — Phase 3: clarification points + `goals/00-foundation/` templates including the walking-skeleton scenario rules.
- `references/per-us-template.md` — Phase 4: clarification points + per-US folder templates + authoring rules for `test_plan.md`.
- `references/non-us-template.md` — Phase 5: clarification points + non-US folder templates + AC-from-prose derivation pattern.
- `references/integration-template.md` — Phase 6: clarification points + integration folder templates + cross-cutting TC catalog.
- `references/verification-protocol.md` — verbatim contents of `protocols/run_goal_tests.md`. Copy only the body between lines that exactly equal `--- BEGIN PROTOCOL ---` and `--- END PROTOCOL ---` (excluding both marker lines) byte-for-byte into the generated project's `protocols/run_goal_tests.md`, then compare the staged output against that anchored extraction before moving it into place.
- `references/sanitizer.md` — banned-token table and sanitizer protocol applied at the end of every phase before the atomic `mv` from the tmp tree. Read this once at session start; every phase invokes it.
