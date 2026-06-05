# PROGRESS.md template — initial skeleton

Read this file when generating `goals/<slug>/PROGRESS.md`. The skill writes the initial skeleton; `/goal` populates it as work proceeds and finalizes the evidence sections before marking complete.

---

```md
# PROGRESS.md — {{Plugin or Feature Name}}

## Current Status

Status: Not started

## Summary

{{One short line; the skill leaves this blank for /goal to fill.}}

## Completed Work

{{/goal will check items off as it works.}}

- [ ] Initial scaffold present
- [ ] Acceptance criteria implemented
- [ ] Verification commands pass
- [ ] Documentation updated
- [ ] Final evidence recorded

## Remaining Work

- [ ] {{AC-001.1 — short title}}
- [ ] {{AC-001.2 — short title}}
- [ ] {{AC-002.1 — short title}}

## Commands Run

| Command     | Result                | Notes     |
| ----------- | --------------------- | --------- |
|             |                       |           |

## Files Changed

- {{/goal records each changed file here.}}

## Decisions Made

| Decision   | Reason   |
| ---------- | -------- |

## Blockers

| Blocker   | Impact   | Needed From Human |
| --------- | -------- | ----------------- |

## Acceptance Criteria Evidence

| Requirement | Evidence           | Status                |
| ----------- | ------------------ | --------------------- |
| AC-001.1    |                    | Pending               |
| AC-001.2    |                    | Pending               |

## Final Verification Evidence

{{/goal fills this in only before marking complete. Sections to populate:}}

### Commands Run

### PHP-Internal Check Evidence

### Browser Check Evidence

### Acceptance Criteria Evidence

### Files Changed

### Remaining Risks
```
