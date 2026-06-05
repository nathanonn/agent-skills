# VERIFY.md template — wp-env + playwright-cli + wp-eval

Read this file when generating `goals/<slug>/VERIFY.md`. The verification stack is wp-env (development environment), playwright-cli (browser-visible verification), and `wp eval` / `wp eval-file` via wp-env CLI (PHP-internal verification).

Substitute every `{{...}}` placeholder with confirmed values. If a verification mode (browser vs. PHP-internal) doesn't apply, write `Not applicable for this goal.` plus a one-line reason and keep the section.

When the project is missing wp-env, playwright-cli, or both, prepend the **Setup prerequisites** section at the top of the generated VERIFY.md. When everything is present, omit that section.

---

```md
# VERIFY.md — {{Plugin or Feature Name}}

## 0. Setup prerequisites (only if any are missing)

{{Only include this section if the probe found a missing piece. Otherwise delete it.}}

This goal assumes the following are available before /goal runs verification:

- **wp-env** mapped at `.wp-env.json` (default base URL `http://localhost:8888`). If missing, run `npm install -g @wordpress/env` and add a `.wp-env.json` mapping `{{slug}}/`.
- **playwright-cli** skill or binary available. If using the `playwright-cli` skill, see `.claude/skills/playwright-cli/SKILL.md`.
- WordPress test user available (default: `admin` / `password` from wp-env).
- **Harness sandbox bypass** for wp-env, Docker, and playwright-cli commands. If the harness running /goal sandboxes shell access, pre-approve or bypass it for those three tool families before running any verification command — they hit Unix sockets and the network that sandboxes typically block. See `AGENTS.md` "Harness sandbox" for context.

If a tool isn't available or a sandbox blocks it, /goal must document the gap in `PROGRESS.md` rather than skipping the check silently.

## 1. Verification Philosophy

/goal must verify the result with real evidence, not assumptions.

Passing tests are useful only if they cover the requirements in `GOAL.md`.
If a test or check does not cover a requirement, /goal must add a better check or document the gap in `PROGRESS.md`.

## 2. Environment Assumptions

Expected environment:

- Runtime: PHP {{version, e.g. 8.1+}} provided by wp-env (use the container, not the host)
- Package manager (PHP): composer **inside the wp-env cli container** (`npx wp-env run cli composer ...`)
- Package manager (JS): npm on the host
- Database: MySQL provided by wp-env
- Browser test runner: playwright-cli on the host (see `.claude/skills/playwright-cli/`)

**Routing rule:** anything provided by wp-env (WP-CLI, composer, php, phpunit) must be invoked via `npx wp-env run cli ...`. Never call the host's native `wp`, `composer`, `php`, or `phpunit` against this project. See `AGENTS.md` for the full DO/DON'T table. npm, node, npx, playwright-cli, and git stay native.

**Sandbox rule:** if the harness sandboxes shell access, the wp-env wrapper itself needs the bypass — `npx wp-env run cli ...` talks to Docker. Same for browser launches via `playwright-cli`. Pre-approve or bypass these tool families before /goal starts running verification.

**Artifact location rule.** Test artifacts split by where they get *executed*:

- **Server-side (PHP scripts run by `wp eval-file`)** → live inside the plugin folder at `{{slug}}/tests/goal-checks/{{goal-dir}}/`. The container only sees mounted volumes; the plugin folder is mounted, but `goals/{{goal-dir}}/` is not. Do **not** put `wp eval-file` targets under `goals/{{goal-dir}}/test-artifacts/` — wp-cli can't reach them.
- **Host-side (browser screenshots, playwright-cli traces, log dumps)** → live under `goals/{{goal-dir}}/test-artifacts/<check-id>/`. These are produced and consumed entirely on the host, so the goal-folder location keeps them colocated with their goal.

Before running checks, /goal should inspect the repo and confirm commands actually exist (e.g., `composer test` script exists in `{{slug}}/composer.json`, `npm test` script exists in `package.json`). Then route the existing ones through wp-env where applicable.

## 3. Required Commands

Run these before marking the goal complete. List only commands that exist in the repo — do not invent script names.

```bash
{{# host-side: bring the env up}}
npx wp-env start

{{# wp-env-routed: install plugin deps}}
npx wp-env run cli composer --working-dir=wp-content/plugins/{{slug}} install

{{# wp-env-routed: include only the composer scripts that exist in {{slug}}/composer.json}}
{{# e.g. npx wp-env run cli composer --working-dir=wp-content/plugins/{{slug}} test}}
{{# e.g. npx wp-env run cli composer --working-dir=wp-content/plugins/{{slug}} lint}}

{{# host-side: include only the npm scripts that exist in package.json}}
{{# e.g. npm run lint  /  npm test}}
```

Expected result:

- All commands exit with code `0`.
- Any failure must be fixed or documented in `PROGRESS.md` as an external blocker.

## 4. Targeted Checks

Use these for faster inner-loop work while developing. Prefer wp-env-routed forms; host-native forms only for non-WP tools.

```bash
{{# wp-env-routed focused composer / phpunit, e.g.}}
{{# npx wp-env run cli composer --working-dir=wp-content/plugins/{{slug}} test -- --filter SomeTest}}

{{# host-side npm focused command, if applicable}}
{{# npm test -- <pattern>}}
```

When to run:

- After editing related plugin files.
- After adding or updating tests.
- Before running the full required command list.

## 5. WordPress Smoke Checks

Use wp-env's built-in WP-CLI to confirm the plugin is healthy.

```bash
npx wp-env run cli wp plugin list
npx wp-env run cli wp plugin activate {{slug}}
npx wp-env run cli wp eval 'echo "WP OK\n";'
```

Expected:

- Plugin appears in `wp plugin list` and is `active`.
- `wp eval` prints `WP OK` with no PHP warnings or notices.

## 6. PHP-Internal Checks (wp eval / wp eval-file)

Use these for behavior that lives entirely server-side (option reads/writes, capability checks, ability registration, etc.).

**Where PHP test artifacts live.** wp-cli runs *inside* the wp-env container and can only read files that are mounted into it. The plugin folder `{{slug}}/` is mounted at `/var/www/html/wp-content/plugins/{{slug}}/`; everything else (including `goals/{{goal-dir}}/`) is **not** reachable from `wp eval-file`. So all PHP scripts the goal needs to evaluate must be authored inside the plugin folder, at:

```
{{slug}}/tests/goal-checks/{{goal-dir}}/p-XXX.php
```

That gives wp-cli a stable, container-relative path:

```
wp-content/plugins/{{slug}}/tests/goal-checks/{{goal-dir}}/p-XXX.php
```

`{{goal-dir}}` is the directory name under `goals/` for this goal (often the same as `{{slug}}` for single-goal repos; numbered like `01-foo` for multi-goal). /goal creates the `tests/goal-checks/{{goal-dir}}/` directory the first time it adds a check.

**Inline vs file-based.** Prefer inline `wp eval '...'` for short snippets (capability checks, single-option reads). Fall back to `wp eval-file` only when the snippet grows beyond a comfortable single-quote string or needs multiple statements.

{{Generate one block per PHP-internal AC. Use stable AC IDs from GOAL.md.}}

### Check P-001 — {{AC ID}}: {{description}}

File-based (longer scripts):

```bash
npx wp-env run cli wp eval-file wp-content/plugins/{{slug}}/tests/goal-checks/{{goal-dir}}/p-001.php
```

Inline (short snippets):

```bash
npx wp-env run cli wp eval '{{minimal PHP snippet}}'
```

Expected output:

```text
{{expected literal output, e.g. "PASS: capability granted"}}
```

Evidence to record in `PROGRESS.md`:

- command run
- expected output
- actual output
- if file-based: the path of the test artifact (so it can be re-run)

## 7. Browser Checks (playwright-cli)

Use these for any behavior visible through the front-end, wp-admin, or HTTP endpoints.

Session naming convention: `goal-{{slug}}` so the session is scoped to this goal and can be torn down independently.

{{Generate one block per browser-visible AC. Use stable AC IDs from GOAL.md.}}

### Check B-001 — {{AC ID}}: {{description}}

Steps (the playwright-cli skill will translate these to `playwright-cli` commands):

```text
1. Open http://localhost:8888{{path}}
2. {{action, e.g. "fill #user_login with admin"}}
3. {{action, e.g. "click #wp-submit"}}
4. Assert: {{expected DOM state or URL or text}}
```

Evidence to record in `PROGRESS.md`:

- session name (`goal-{{slug}}`)
- final URL or relevant DOM snippet
- screenshot path under `goals/{{slug}}/test-artifacts/B-001/` if produced

### Check B-002 — {{AC ID}}: {{description}}

Steps:

```text
1. {{...}}
2. {{...}}
```

## 8. Regression Checks

/goal must confirm these existing behaviors still work:

- [ ] {{Existing behavior 1}}
- [ ] {{Existing behavior 2}}
- [ ] Plugin activates and deactivates without warnings.
- [ ] No PHP warnings or notices appear in `wp eval 'echo "OK";'` output.

## 9. Security Checks

/goal must verify:

- [ ] Unauthorized users cannot reach protected behavior.
- [ ] Invalid IDs or inputs fail safely (no fatal errors, machine-readable error response).
- [ ] Inputs are sanitized with the appropriate WordPress helpers.
- [ ] Outputs in admin HTML are escaped with `esc_html` / `esc_attr` / `esc_url`.
- [ ] State-changing requests check nonces where applicable.
- [ ] No PHP warnings or notices appear under any tested path.
- [ ] No secrets are logged.

## 10. Documentation Checks

/goal must verify:

- [ ] `README.md` includes the feature name and a usage example.
- [ ] Commands in `README.md` actually work in wp-env.
- [ ] Configuration names in docs match the code.
- [ ] Changelog entry is updated if the project keeps one.

## 11. Evidence Format

/goal must add this section to `goals/{{slug}}/PROGRESS.md` before marking complete. The tables below are **schema-only examples** — leave the data rows empty. /goal populates them at completion time. Do not fill them in when generating VERIFY.md.

```md
## Final Verification Evidence

### Commands Run

| Command | Result | Notes |
| ------- | ------ | ----- |
|         |        |       |

### PHP-Internal Check Evidence

| AC ID | Check ID | Expected | Actual | Status |
| ----- | -------- | -------- | ------ | ------ |
|       |          |          |        |        |

### Browser Check Evidence

| AC ID | Check ID | Session | Evidence | Status |
| ----- | -------- | ------- | -------- | ------ |
|       |          |         |          |        |

### Acceptance Criteria Evidence

| AC ID | Evidence | Status |
| ----- | -------- | ------ |
|       |          |        |

### Files Changed

- _(populated by /goal)_

### Remaining Risks

- _(populated by /goal, "None known" if clean)_
```

## 12. Failure Handling

If a required check fails:

1. Identify whether the failure is related to this goal.
2. Fix related failures.
3. Re-run the targeted check.
4. Re-run the full required-command list before completion.
5. If unrelated or blocked, document it in `PROGRESS.md` and continue with the next item.

/goal must not mark the goal complete if any required verification is missing, failing, or uncertain.

## 13. Budget-Limit Behavior

If /goal reaches a token or time budget:

- Stop new substantive work.
- Update `goals/{{slug}}/PROGRESS.md`:
  - completed requirements
  - unverified requirements
  - blockers
  - recommended next `/goal` objective
```
