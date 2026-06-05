# GOAL.md template — WordPress plugin / feature

Read this file when generating `goals/<slug>/GOAL.md`. Substitute every `{{...}}` placeholder with values confirmed in Step 3 of the skill flow. Do not delete sections that don't apply — write `Not applicable.` plus a one-line reason instead.

---

```md
# GOAL.md — {{Plugin or Feature Name}}

## 1. Objective

{{One clear paragraph describing the outcome /goal must achieve.}}

By the end of this goal, the repository should support:

- {{Outcome 1}}
- {{Outcome 2}}
- {{Outcome 3}}

## 2. Background

{{Brief context /goal needs to understand the task.}}

Relevant existing behavior:

- {{Current behavior 1}}
- {{Current behavior 2}}

Problem / opportunity:

- {{Why this change is needed}}

## 3. Source of Truth

/goal must treat these as the authoritative references:

- `AGENTS.md`
- `README.md`
- `goals/{{slug}}/VERIFY.md`
- Existing plugin files under `{{slug}}/`
- Existing tests under `{{slug}}/tests/` (if present)
- WordPress coding standards already used in the repo

If anything conflicts, follow this priority order:

1. This `GOAL.md`
2. `goals/{{slug}}/VERIFY.md`
3. `AGENTS.md`
4. Existing code conventions
5. README / older docs

## 4. Scope

### In scope

- {{Specific feature / behavior 1}}
- {{Specific feature / behavior 2}}
- Add capability checks, input validation, output escaping where relevant.
- Add or update tests inside `{{slug}}/tests/` where practical.
- Update `README.md` examples.

### Out of scope

- {{Anything /goal must not touch}}
- New admin redesign.
- New paid third-party services.
- Database schema changes unless explicitly described in Section 11.
- Behavior in other plugins (WooCommerce, Rank Math, etc.) outside this feature's surface.

## 5. Allowed Files / Areas

/goal may edit:

- `{{slug}}/**`
- `goals/{{slug}}/PROGRESS.md`
- `README.md`
- `composer.json` only if needed for autoload or dev scripts
- `package.json` only if needed for verification scripts

/goal should avoid editing:

- generated build files
- unrelated plugin modules
- production configuration files
- `package-lock.json` / `composer.lock` unless dependencies change intentionally

## 6. User Stories

{{Generate one US block per user story confirmed in Step 3. Use stable IDs.}}

### US-001 — {{Story title}}

As a {{user/admin/developer}},
I want {{capability}},
so that {{benefit}}.

Acceptance criteria:

- [ ] AC-001.1 — {{Observable behavior}}
- [ ] AC-001.2 — {{Observable behavior}}
- [ ] AC-001.3 — {{Error/edge behavior}}

### US-002 — {{Story title}}

As a {{user/admin/developer}},
I want {{capability}},
so that {{benefit}}.

Acceptance criteria:

- [ ] AC-002.1 — {{Observable behavior}}
- [ ] AC-002.2 — {{Observable behavior}}

## 7. Business / Functional Rules

- BR-001 — {{Rule}}
- BR-002 — {{Rule}}
- BR-003 — {{Rule}}

Default rules to include unless explicitly contradicted:

- BR-XXX — Do not expose private metadata to unauthorized users.
- BR-XXX — Do not modify posts unless the feature explicitly performs an update.
- BR-XXX — Return machine-readable errors for any programmatic surface.
- BR-XXX — Preserve backward compatibility with existing plugin behavior.

## 8. Technical Constraints

- TC-001 — Must follow existing namespace and PSR-4 conventions in `{{slug}}/composer.json`.
- TC-002 — Must remain compatible with the WordPress and PHP versions declared in `{{slug}}/{{slug}}.php`.
- TC-003 — Must not introduce new runtime dependencies without documenting why.
- TC-004 — Must preserve existing public APIs unless explicitly listed in scope.

## 9. Error Handling

/goal must handle:

- {{Invalid input case}}
- {{Permission failure}}
- {{Missing data}}
- {{External service unavailable, if applicable}}
- {{Edge case from spec}}

Expected behavior:

- {{What the system should return / show / do}}
- No raw PHP warnings or notices may leak to output.
- Errors should be machine-readable for programmatic surfaces (REST, WP-CLI).

## 10. Security / Permission Requirements

- {{Capability check, e.g. current_user_can('manage_options')}}
- {{Nonce / CSRF requirement, if state-changing}}
- {{Input sanitization rule, e.g. sanitize_text_field, absint, sanitize_email}}
- {{Output escaping rule, e.g. esc_html, esc_attr, esc_url}}
- No secrets or sensitive metadata may be logged.

## 11. Data / Migration Requirements

- Database changes required: {{Yes / No}}
- Migration required: {{Yes / No}}
- Backward compatibility required: {{Yes / No}}

Details:

- {{Data model notes, or "Not applicable."}}
- {{Migration notes, or "Not applicable."}}
- {{Rollback notes, or "Not applicable."}}

## 12. Documentation Requirements

/goal must update:

- [ ] `README.md` usage example
- [ ] Inline comments only where the *why* is non-obvious
- [ ] Changelog entry if the project keeps one

## 13. Definition of Done

The goal is complete only when:

- [ ] Every acceptance criterion is implemented.
- [ ] Every required verification command in `goals/{{slug}}/VERIFY.md` passes or has a documented external blocker.
- [ ] New or changed behavior has tests where practical.
- [ ] Existing behavior is not regressed.
- [ ] `README.md` is updated.
- [ ] `goals/{{slug}}/PROGRESS.md` contains final evidence.
- [ ] /goal has performed a completion audit mapping each AC to evidence.

## 14. Completion Audit Format

Before marking the goal complete, /goal must update `goals/{{slug}}/PROGRESS.md` with this table:

| Requirement | Evidence                            | Status                |
| ----------- | ----------------------------------- | --------------------- |
| AC-001.1    | {{file / test / command output}}    | Pass / Fail / Blocked |
| AC-001.2    | {{file / test / command output}}    | Pass / Fail / Blocked |

## 15. Stop Conditions

/goal must stop and ask for human review if:

- A required architectural decision is ambiguous.
- A required command would be destructive (drop tables, delete users, etc.).
- A migration is needed but not specified in Section 11.
- Tests fail for reasons unrelated to this goal.
- The implementation requires touching out-of-scope files.
- Secrets, credentials, production data, or paid services are required.

## 16. Notes for Future Goals

- {{Known follow-up 1, or "None at this time."}}
- {{Known follow-up 2}}
```
