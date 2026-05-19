---
name: wp-spec-to-goal
description: Convert a WordPress plugin or feature idea (even a vague one) into a Codex /goal-ready bundle — GOAL.md, VERIFY.md, PROGRESS.md inside goals/<slug>/ — with wp-env + playwright-cli + wp-eval verification baked in. Asks clarifying questions in focused batches (each with options + recommendation + reasoning), reaches 95% confidence, optionally scaffolds a missing plugin folder + .wp-env.json + package.json + AGENTS.md, and emits a tailored /goal command. For new WP plugin or feature work, not bug fixes or non-WordPress projects.
disable-model-invocation: true
---

# wp-spec-to-goal — Vague WP Plugin Idea → Codex /goal Bundle

Turn a rough WordPress plugin or feature idea into the three files Codex `/goal` needs to drive autonomous implementation:

```
goals/<slug>/
  GOAL.md       what done looks like (full WP plugin template)
  VERIFY.md     how /goal proves it's done (wp-env + playwright-cli + wp-eval, folded in)
  PROGRESS.md   the audit trail /goal will populate
```

The skill optionally scaffolds a missing plugin (plugin folder + `.wp-env.json` + `package.json` + `AGENTS.md`) and prints a tailored `/goal` command at the end.

## Why this skill exists

A full multi-prompt workflow kit is overkill for plugins or features that fit in one or two goal slices. This skill collapses the "spec → goal trio" hop into a single guided conversation that:

- batches clarifying questions (so the user makes 2-3 decisions per round, not 20)
- recommends a default for every choice (so they can move fast when the recommendation looks right)
- bakes in the standard stack: wp-env + playwright-cli + wp-eval
- writes the same template shapes already validated in their templates kit (full WordPress GOAL.md / VERIFY.md)

It does **not** replace the multi-prompt kit when shipping a complex plugin from a long requirements doc. Use the kit for big builds; use this skill for the small-to-medium ones — and "small to medium" is genuinely small to medium, not just trivially simple.

## Core flow

1. **Probe the project** — inspect the cwd to learn what's already in place.
2. **Decide single goal vs. multi-goal** — judge complexity from the spec; if multi-shaped, offer to split via `goals-plan.md`.
3. **Ask in focused batches** — 2-4 questions per round, each with options + recommendation + reasoning, until 95% confident.
4. **Optionally scaffold** — if the project is missing pieces and the user agrees, create only what they confirm.
5. **Write the goal trio** — GOAL.md + VERIFY.md (with wp-env / playwright-cli / wp-eval folded in) + initial PROGRESS.md, at `goals/<slug>/`.
6. **Hand off** — print the file paths + a tailored `/goal` command + a short "how to run" note.

Never write any files until confidence on what's about to be produced is at 95%+.

## Step 1 — Probe the project

Before asking the user anything, inspect the cwd. The point is to ground recommendations in reality so questions don't waste the user's time on things already settled by the project state.

Look for:

- `.wp-env.json` at root → wp-env is wired; note the port (default 8888)
- `composer.json` at root or in plugin folder → existing PHP project structure / namespace conventions
- `<candidate-slug>/<candidate-slug>.php` → existing plugin to extend rather than create
- `goals/` folder present → previous goal runs; pick a non-conflicting `<slug>` if needed
- `.claude/skills/playwright-cli/SKILL.md` available → playwright-cli skill is reachable
- `package.json` at root mentioning `playwright` or playwright-cli wrapper scripts
- `AGENTS.md` present → respect existing conventions; surface them in scope decisions
- `protocols/run_goal_tests.md` → user already runs the canonical verification protocol

Use this to inform Step 3 recommendations. Skip questions that the probe already answers (e.g., don't ask "should we wire wp-env?" if `.wp-env.json` is present — only confirm the port).

## Step 2 — Judge complexity

Read the user's spec and decide whether it fits one goal or wants to be split. The spec is multi-goal-shaped when any of these hold:

- More than ~3 distinct user stories
- More than ~5 acceptance criteria spread across unrelated surfaces (admin UI + REST + WP-CLI + cron)
- A clear "phase 1 / phase 2" or "MVP then enhancements" reading
- A walking-skeleton step that has to land before vertical slices make sense
- Touches multiple unrelated WordPress subsystems (REST + Block editor + WooCommerce hooks, etc.)

If multi-goal, surface it before any other clarifying questions:

> This spec looks like it could be 2-3 separate goals. I can either generate one combined goal or write a `goals-plan.md` and scaffold the first slice. Which do you prefer?

If the user picks split, write `goals-plan.md` at the project root with a numbered list of proposed goals (each with a 1-2 line description), then ask which slice to generate first. Re-run the skill later for the next slice.

If single, continue.

## Step 3 — Ask clarifying questions

Use the `AskUserQuestion` tool when available. If it isn't (older harness, plain chat, etc.), fall back to natural-language Q&A in chat with the same shape: 2-4 questions per round, each with 2-4 options, with the recommended option first and labeled `(Recommended)`, plus a one-line reason for the recommendation.

Aim for ≤3 rounds total. Skip any question already answered by the spec or the probe.

### Round 1 — identity + project context

Sample questions to consider (only ask the ones not already settled):

- **Slug**: What slug should we use? Recommend kebab-case of the plugin name.
- **New vs. existing**: Is this a new plugin, or a feature inside an existing plugin? Probe-informed default.
- **Plugin folder location**: Where will the plugin code live? Default: `<slug>/` at project root (matches the wp-env + clean activation pattern). For features inside an existing plugin, default to that plugin's folder.
- **wp-env state**: If `.wp-env.json` is missing, ask whether to scaffold one with the plugin mapped in.

### Round 2 — scope + behavior

- **Acceptance criteria**: Draft 3-6 AC bullets from the spec yourself, then ask the user to confirm, edit, or add. Don't make them write ACs from scratch — give them a starting list.
- **Out of scope**: Confirm boundaries (UI redesign, schema changes, paid services, third-party APIs, unrelated modules).
- **User stories**: For non-trivial specs, propose 1-3 user stories. Skip for one-AC features.

### Round 3 — security + verification

Only ask the ones not obvious from the spec.

- **Permission model**: Who can use this? (admin only / any logged-in user / public — recommend the strictest reasonable capability for the surface; URL-driven endpoints default to `manage_options` unless the user explicitly says public)
- **Configuration surface**: URL param / settings page / `wp-config` constant / hard-coded? Recommend based on use frequency and audience.
- **Verification approach**: wp-eval smoke / playwright-cli flow / both? Recommend playwright-cli for browser-visible surfaces, wp-eval for PHP-internal surfaces, both when the feature crosses the boundary.

### Confidence check after each round

After each round, ask: "if I started writing files now, what could go wrong because of something I don't know?" If the answer is "not much," proceed. Otherwise, ask one more focused round.

If 3 rounds in and confidence is still under 95%, the spec might genuinely need a longer conversation or a different skill — say so to the user rather than guessing.

## Step 4 — Optionally scaffold

If the probe found missing pieces and the user agrees to scaffold, create only what they confirmed. Default missing-pieces set:

- `<slug>/<slug>.php` — plugin header + activation hook + autoload bootstrap
- `<slug>/composer.json` — PSR-4 stub mapping the chosen vendor namespace to `src/`
- `.wp-env.json` — at project root, mapping the plugin folder
- `package.json` — at project root, with playwright-cli install hints and `npm test` / `npm run lint` placeholders
- `AGENTS.md` — at project root, listing the stack, conventions, and the canonical commands `/goal` should run
- `.gitignore` — at project root, covering wp-env state, deps, OS/editor noise, and per-goal test artifacts

Templates for these files are in `references/scaffold-templates.md`. Read that file when scaffolding.

If any of these already exist, **do not overwrite**. Confirm with the user first; default to leaving the existing file alone and noting the conflict in chat. For `.gitignore` specifically, prefer offering to *merge* missing lines into the existing file rather than overwriting — `.gitignore`s tend to grow project-specific entries that the user wants to keep.

## Step 5 — Write the goal trio

Generate three files at `goals/<slug>/`. The full WordPress templates live in:

- `references/goal-template.md` — full `GOAL.md` template (objective, source of truth, scope, allowed files, user stories, business rules, security, definition of done, completion audit, stop conditions)
- `references/verify-template.md` — full `VERIFY.md` template, with wp-env + playwright-cli + wp-eval folded in (no separate `test_plan.md`)
- `references/progress-template.md` — initial `PROGRESS.md` skeleton

Read these reference files when generating. Substitute placeholders with everything the user confirmed in Step 3 and the project state from Step 1.

Filling rules:

- **Spec placeholders vs. audit placeholders**. The reference templates use `{{...}}` markers for two different things:
  - **Spec placeholders** (e.g., `{{Plugin Name}}`, `{{slug}}`, `{{AC ID}}`, `{{description}}`) — these describe content the _skill_ must fill in now. Replace every spec placeholder with a concrete value derived from Step 3 answers and Step 1 probe state. Never leave one in.
  - **Audit placeholders** in VERIFY.md Section 11 ("Evidence Format") and the Final Verification Evidence block of PROGRESS.md — these are _example tables_ showing /goal what to fill in _at completion time_. The current verify-template emits these as **empty cells** (`|   |   |`), not as `{{...}}`. If you ever encounter `{{cmd}}`, `{{note}}`, `{{file / test / output}}`, or similar inside an example evidence table, that's a stale template signal — replace those cells with empty strings before writing the file. /goal will populate them later.
- If a whole section doesn't apply (e.g., "Data / Migration Requirements" for a non-DB plugin), write `Not applicable.` plus a one-line reason rather than deleting the section — `/goal`'s completion audit expects the section to exist.
- For every AC, give it a stable ID like `AC-001.1`. The audit table in `GOAL.md` and the evidence table in `PROGRESS.md` reference these IDs.
- Match the user's stated scope literally. If they said "admin only", capability defaults to `manage_options` and out-of-scope explicitly excludes public access.
- Before writing, scan the generated text for any remaining `{{` outside of code-fenced template-instruction comments. If you find any, you missed something — fix it.
- **wp-env routing rule.** Every command in the goal trio that uses a tool provided by wp-env (WordPress, WP-CLI, composer, php, phpunit) must be written as `npx wp-env run cli ...`. Never emit a bare `wp ...`, `composer ...`, `php ...`, or `phpunit ...` — those run on the host's PHP/MySQL, not the wp-env container, and silently produce wrong results. The carve-out is non-WP tooling: `npm`, `node`, `npx`, `playwright-cli`, and `git` stay native. Before writing each command, ask: "is this tool inside the wp-env container?" If yes, prefix with `npx wp-env run cli`. The same rule is documented in the generated `AGENTS.md` (see scaffold template's "Canonical command pattern" section).
- **Harness sandbox rule.** /goal will likely run inside an agent harness with a sandbox or approval policy. wp-env, Docker, and playwright-cli commands hit Unix sockets and the network that sandboxes typically block. The generated `VERIFY.md` (Setup prerequisites + Environment Assumptions) and `AGENTS.md` (Harness sandbox section) both surface this — keep those notes intact when filling templates, and don't assume an unsandboxed environment when writing verification commands. If the user has flagged a specific harness or sandbox during Step 3, mention it in the relevant note; otherwise keep the warning generic.
- **PHP test artifact placement rule.** `wp eval-file` runs inside the wp-env container and can only see files mounted into it. The plugin folder `<slug>/` is mounted at `/var/www/html/wp-content/plugins/<slug>/`; the `goals/` directory is **not**. So when generating PHP-internal checks for VERIFY.md, place each test script at `<slug>/tests/goal-checks/<goal-dir>/p-XXX.php` (where `<goal-dir>` is the directory under `goals/` for this goal — for a single-goal repo, that's the same as `<slug>`; for multi-goal, it's the slice name like `01-foo`). The `wp eval-file` invocation in VERIFY.md must reference the container-relative path: `wp-content/plugins/<slug>/tests/goal-checks/<goal-dir>/p-XXX.php`. Never write `wp eval-file goals/...` paths — the container can't reach them. Browser test artifacts (playwright-cli screenshots, traces) stay under `goals/<goal-dir>/test-artifacts/` because they're produced and consumed on the host.

For VERIFY.md specifically:

- Probe for tools first. If `.wp-env.json` is missing or playwright-cli isn't installed, prepend a "Setup prerequisites" section listing what to install and how. Don't block — write the rest of `VERIFY.md` as if those tools will be there.
- The "Required commands" block should always include the project's actual commands. Inspect `composer.json` and `package.json` for real script names before listing composer/npm scripts. Don't list scripts that don't exist.
- Apply the wp-env routing rule to every command. Composer scripts in `{{slug}}/composer.json` get emitted as `npx wp-env run cli composer --working-dir=wp-content/plugins/{{slug}} <script>`, never as bare `composer <script>`. WP-CLI calls always go through `npx wp-env run cli wp ...`. Only `npm`/`node`/`playwright-cli` invocations stay native.
- Bake in the agreed verification approach. If playwright-cli is the answer, include a `playwright-cli` block with the session name `goal-<slug>` and concrete steps (host-side). If wp-eval is the answer, include the `npx wp-env run cli wp eval` / `wp eval-file` snippet inline.

## Step 6 — Hand off

After writing the files, print this in chat (verbatim layout, with `<slug>` replaced):

```
Generated:
  goals/<slug>/GOAL.md
  goals/<slug>/VERIFY.md
  goals/<slug>/PROGRESS.md

To run with Codex /goal:
  /goal Complete goals/<slug>/GOAL.md. Use goals/<slug>/VERIFY.md as the verification contract. Update goals/<slug>/PROGRESS.md continuously. Treat uncertainty as incomplete.

How to run:
  1. Open Codex inside this repo:    codex
  2. (Optional) /plan Read goals/<slug>/GOAL.md and VERIFY.md and propose an implementation plan.
  3. Paste the /goal command above.
  4. Review changes via `git diff` before committing.
```

If the skill scaffolded files in Step 4, list those above the goal trio under `Scaffolded:`.

If the skill wrote a `goals-plan.md` in Step 2, also append:

```
Next slice:
  Re-run wp-spec-to-goal with: "next slice from goals-plan.md"
```

## Question style — the recommendation is the value

For every clarifying question, a strong recommendation is the difference between a 30-second answer and a 5-minute one. Heuristics:

- **Identity** — recommend kebab-case slug from the plugin name; honor the vendor namespace if visible elsewhere in the repo (e.g., existing `composer.json`).
- **Scope** — recommend the narrowest scope that still achieves the spec. Out-of-scope wins ties.
- **Security** — recommend the strictest reasonable capability for the surface. URL endpoints get `manage_options` unless explicitly stated public. Nonces required for state-changing GETs/POSTs.
- **Verification** — recommend playwright-cli for browser-visible surfaces, wp-eval for PHP-internal surfaces, both when the feature crosses the boundary.
- **Goal slicing** — recommend single-goal unless the AC count is clearly across multiple unrelated surfaces.

Always explain _why_ in one sentence so the user can override with confidence when their context differs.

## Stop conditions

Stop and ask the user instead of guessing if:

- The spec implies a database schema change that wasn't described.
- The spec implies third-party paid services, credentials, or external APIs.
- The slug or plugin folder collides with something already in the repo.
- More than 3 rounds of questions and confidence still under 95%.
- The user's probe state contradicts their spec (e.g., they say "new plugin" but `<slug>/` already exists).

## What this skill does not do

- It does not implement the plugin. That's `/goal`'s job.
- It does not run tests. That's `/goal`'s job.
- It does not generate per-user-story goal folders or test-plan files.
- It does not work for non-WordPress projects.
- It does not fix bugs. For bug fixes, use `/goal` directly with a bug-fix-oriented goal.
