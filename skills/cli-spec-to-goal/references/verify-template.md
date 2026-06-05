# VERIFY.md template — host-native CLI verification

Read this file when generating `goals/<slug>/VERIFY.md`. The verification approach is host-native: the binary runs directly on the host's Node.js, tests run with `npm test`, and there is no container layer.

Substitute every `{{...}}` placeholder with confirmed values. If a section doesn't apply (e.g., integration checks for a local-only tool), write `Not applicable.` plus a one-line reason and keep the section.

When the project is missing prerequisites (Node version mismatch, no `npm install` run, TypeScript not compiled), prepend the **Setup prerequisites** section. When everything is present, omit that section.

---

````md
# VERIFY.md — {{Tool Name}}

## 0. Setup prerequisites (only if any are missing)

{{Only include this section if the probe found something missing. Otherwise delete it.}}

Before running any checks:

1. Confirm Node.js version matches `engines` in package.json (>= 18.0.0)
2. Run `npm install` (dependencies must be present)
{{3. Run `npm run build` (TypeScript projects — must compile before testing)}}
4. Confirm required env vars are set (or `.env.example` documents them)
{{5. Confirm test database path is writable (if SQLite)}}

If any prerequisite fails, fix it before proceeding — subsequent checks will produce misleading results.

## 1. Verification Philosophy

/goal must verify the result with real evidence, not assumptions.

Passing tests are useful only if they cover the requirements in `GOAL.md`.
If a test or check does not cover a requirement, /goal must add a better check or document the gap in `PROGRESS.md`.

## 2. Environment Assumptions

Expected environment:

- Runtime: Node.js {{version, e.g. 18+}} on the host
- Package manager: npm
- Test framework: {{Vitest / Jest}}
{{- Build tool: tsc (TypeScript projects)}}
- No container environment needed

**Host execution rule:** All commands run directly on the host's Node.js runtime. The binary is invoked as `node bin/{{tool-name}}.js <args>`. Test commands use `npm test`. There is no container layer — no routing decisions needed.

**Sandbox rule:**
{{If local-only}}: Not applicable — this tool runs on the host with no network dependencies.
{{If API-calling}}: The harness may need network access to {{target hosts}}. If tests mock the API, no special bypass is needed.
{{If mock-tested API}}: Tests bind to localhost on port {{port}}. No external network access needed.
{{If OAuth}}: The harness needs network access to the provider's authorization and token endpoints, plus localhost binding for the OAuth redirect server (default port 8910).

**Test artifact convention.** Everything runs on the host — no two-filesystem problem:

- Test specs → `tests/`
- Fixtures → `tests/fixtures/`
- Goal verification scripts → `goals/{{slug}}/checks/`
- Test output artifacts → `goals/{{slug}}/test-artifacts/`

Before running checks, /goal should inspect the repo and confirm commands actually exist (e.g., `test` script exists in `package.json`, `lint` script exists). Don't list scripts that don't exist.

## 3. Required Commands

Run these before marking the goal complete. List only commands that exist in the repo.

```bash
# Install dependencies
npm install

{{# Build (TypeScript only)}}
{{npm run build}}

{{# Run tests — include only if test script exists in package.json}}
npm test

{{# Lint — include only if lint script exists in package.json}}
{{npm run lint}}

{{# Typecheck (TypeScript only)}}
{{npm run typecheck}}
```

Expected result:

- All commands exit with code `0`.
- Any failure must be fixed or documented in `PROGRESS.md` as an external blocker.

## 4. Targeted Checks

Use these for faster inner-loop work while developing.

```bash
{{# Run a single test file}}
{{npx vitest run tests/<specific-test>.test.js}}

{{# Run tests matching a pattern}}
{{npx vitest run -t "<test name pattern>"}}
```

When to run:

- After editing related source files.
- After adding or updating tests.
- Before running the full required command list.

## 5. Binary Smoke Checks

Verify the CLI binary boots and responds to basic commands. Run these before any functional checks.

```bash
# Version flag
node bin/{{tool-name}}.js --version
# Expected: prints version (e.g., "0.1.0"), exits 0

# Help flag
node bin/{{tool-name}}.js --help
# Expected: prints usage text mentioning all subcommands, exits 0

{{# Subcommand help (one per subcommand)}}
node bin/{{tool-name}}.js {{cmd}} --help
# Expected: prints command-specific options, exits 0

# No args
node bin/{{tool-name}}.js
# Expected: prints help or usage hint, exits 0 (or 1 if a command is required)

# Non-interactivity check
timeout 10 node bin/{{tool-name}}.js < /dev/null
# Expected: does not hang (exits within 10 seconds)
```

Expected:
- All commands exit with their documented exit code.
- No unhandled promise rejections or stack traces.
- No ANSI escape codes when stdout is not a TTY (piped output).

## 6. Functional Checks

Run the binary with specific inputs, assert stdout content, stderr content, and exit code. Each check maps to one or more acceptance criteria.

**AI-agent pattern checks** (always include these):

```bash
# JSON validity
node bin/{{tool-name}}.js {{cmd}} --json | jq .
# Expected: jq exits 0 (stdout is valid JSON)

# stdout/stderr separation
node bin/{{tool-name}}.js {{cmd}} --json 2>/dev/null | jq .
# Expected: JSON still valid (no stderr mixed into stdout)

# Non-interactive
timeout 10 node bin/{{tool-name}}.js {{cmd}} < /dev/null
# Expected: does not hang

{{# Dry-run no side effects (for mutating commands only)}}
node bin/{{tool-name}}.js {{cmd}} --dry-run
# Expected: preview output but no state mutation
```

{{Generate one block per functional AC. Use stable AC IDs from GOAL.md.}}

### Check F-001 — {{AC ID}}: {{description}}

```bash
{{command to run}}
```

Expected output:
- stdout: {{expected stdout content}}
- stderr: {{expected stderr content, or "empty"}}
- Exit code: {{N}}

Evidence to record in `PROGRESS.md`:
- command run
- key output fields/content
- exit code

### Check F-002 — {{AC ID}}: {{description}}

```bash
{{command to run}}
```

Expected output:
- stdout: {{expected stdout content}}
- stderr: {{expected stderr content, or "empty"}}
- Exit code: {{N}}

{{When OAuth is confirmed, add these functional checks:}}

### Check F-XXX — OAuth: auth status without login

```bash
node bin/{{tool-name}}.js auth status
```

Expected output:
- stdout: empty (or JSON with `--json`)
- stderr: "Not authenticated" or similar
- Exit code: 1

### Check F-XXX — OAuth: auth logout without login

```bash
node bin/{{tool-name}}.js auth logout
```

Expected output:
- stdout: empty
- stderr: "No tokens to clear" or similar
- Exit code: 0

### Check F-XXX — OAuth: auth status --json validity

```bash
node bin/{{tool-name}}.js auth status --json 2>/dev/null | jq .
```

Expected output:
- Valid JSON with `provider`, `refresh_token`, `access_token` fields
- No raw token values in output
- Exit code: 0 (from jq, confirming valid JSON)

### Check F-XXX — OAuth: no token values in auth status output

```bash
# After auth login (manual step or mocked), verify no raw tokens appear:
node bin/{{tool-name}}.js auth status 2>&1 | grep -c "stored\|configured\|cached\|expires"
# Expected: matches metadata words, not raw token strings
```

## 7. Exit Code Checks

Verify the exit code contract from GOAL.md Section 7.

| Scenario | Expected Exit Code | Verification |
|----------|-------------------|-------------|
| Successful operation | 0 | `node bin/{{tool-name}}.js {{cmd}} {{valid-args}}; echo $?` |
| `--version` | 0 | `node bin/{{tool-name}}.js --version; echo $?` |
| `--help` | 0 | `node bin/{{tool-name}}.js --help; echo $?` |
| `--dry-run` | 0 | `node bin/{{tool-name}}.js {{cmd}} --dry-run; echo $?` |
| Missing required config | 1 | `env -i node bin/{{tool-name}}.js {{cmd}} 2>&1; echo $?` |
| File not found | 1 | `node bin/{{tool-name}}.js {{cmd}} nonexistent.txt 2>&1; echo $?` |
| Invalid arguments | 2 | `node bin/{{tool-name}}.js --bad-flag 2>&1; echo $?` |
{{When OAuth is confirmed, add these rows:}}
| `auth login` success | 0 | After OAuth flow completes |
| `auth login` timeout | 1 | Redirect server timed out |
| `auth status` (authenticated) | 0 | Tokens present and valid |
| `auth status` (not authenticated) | 1 | No tokens or expired |
| `auth logout` | 0 | Tokens cleared (or none to clear) |
| `auth logout --dry-run` | 0 | Preview without side effects |

## 8. Integration Checks

End-to-end flows verifying multi-step operations.

{{For API-calling tools:}}

### Check I-001 — End-to-end {{flow description}}

Setup: {{describe test environment / mock server if needed}}

```bash
{{sequence of commands}}
```

Expected:
- {{end state assertion}}
- {{data assertion}}

{{For local-only tools:}}
Not applicable — all behavior is covered by functional checks above.

## 9. Regression Checks

/goal must confirm these existing behaviors still work:

- [ ] {{Existing behavior 1, or "No prior behavior — greenfield tool."}}
- [ ] Binary boots without errors (`--version` prints, `--help` prints).
- [ ] No unhandled promise rejections under any tested path.
- [ ] Existing tests pass (if any existed before this goal).

## 10. Security Checks

/goal must verify:

- [ ] Secret env var values do not appear in stdout (including `--json` output).
- [ ] Secret env var values do not appear in error messages.
- [ ] Secret env var values do not appear in `--debug` / verbose output.
- [ ] `.env` is listed in `.gitignore`.
- [ ] No credentials are hard-coded in source files.
- [ ] User-provided file paths don't escape expected directories.
- [ ] No shell injection via user-provided arguments (if applicable).

{{When OAuth is confirmed, add these security checks:}}

- [ ] `auth status` output does not contain raw token values (refresh or access).
- [ ] `auth status --json` output does not contain raw token values.
- [ ] Error messages from auth failures do not leak token values.
- [ ] ENCRYPTION_KEY value does not appear in any output.
- [ ] OAuth `state` parameter is validated on redirect callback (not just generated).

## 11. Documentation Checks

/goal must verify:

- [ ] `README.md` includes the tool name and usage examples for each command.
- [ ] Commands in `README.md` actually work when run.
- [ ] Configuration names in docs match the code.
- [ ] Changelog entry is updated if the project keeps one.

## 12. Evidence Format

/goal must add this section to `goals/{{slug}}/PROGRESS.md` before marking complete. The tables below are **schema-only examples** — leave the data rows empty. /goal populates them at completion time. Do not fill them in when generating VERIFY.md.

```md
## Final Verification Evidence

### Commands Run

| Command | Result | Notes |
| ------- | ------ | ----- |
|         |        |       |

### Functional Check Evidence

| AC ID | Check ID | Expected | Actual | Status |
| ----- | -------- | -------- | ------ | ------ |
|       |          |          |        |        |

### Exit Code Evidence

| Scenario | Expected | Actual | Status |
| -------- | -------- | ------ | ------ |
|          |          |        |        |

### Integration Check Evidence

| Check ID | Expected | Actual | Status |
| -------- | -------- | ------ | ------ |
|          |          |        |        |

### Acceptance Criteria Evidence

| AC ID | Evidence | Status |
| ----- | -------- | ------ |
|       |          |        |

### Files Changed

- _(populated by /goal)_

### Remaining Risks

- _(populated by /goal, "None known" if clean)_
```

## 13. Failure Handling

If a required check fails:

1. Identify whether the failure is related to this goal.
2. Fix related failures.
3. Re-run the targeted check.
4. Re-run the full required-command list before completion.
5. If unrelated or blocked, document it in `PROGRESS.md` and continue with the next item.

/goal must not mark the goal complete if any required verification is missing, failing, or uncertain.

## 14. Budget-Limit Behavior

If /goal reaches a token or time budget:

- Stop new substantive work.
- Update `goals/{{slug}}/PROGRESS.md`:
  - completed requirements
  - unverified requirements
  - blockers
  - recommended next `/goal` objective
````
