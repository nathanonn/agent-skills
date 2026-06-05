# PROGRESS.md template — initial skeleton

Read this file when generating `goals/<NN>-<slug>/PROGRESS.md`. The skill writes the initial skeleton; `/goal` populates it as work proceeds and finalizes the evidence sections before marking complete.

---

````md
# PROGRESS.md — {{Goal Name}}

## Current Status

Status: Not started

## Summary

{{/goal will fill this in as work progresses.}}

## Completed Work

{{/goal will check items off as it works.}}

- [ ] Acceptance criteria implemented
- [ ] State bridge fields updated
- [ ] Playwright tests written and passing
- [ ] Previous goals' tests still pass (regression)
- [ ] Screenshots captured for SHOULD-tier checks
- [ ] Final evidence recorded

## Remaining Work

- [ ] {{AC-NN.1 — short title}}
- [ ] {{AC-NN.2 — short title}}
- [ ] {{AC-NN.3 — short title}}

## Commands Run

| Command | Result | Notes |
| ------- | ------ | ----- |
|         |        |       |

## Files Changed

- {{/goal records each changed file here.}}

## Decisions Made

| Decision | Reason |
| -------- | ------ |

## Blockers

| Blocker | Impact | Needed From Human |
| ------- | ------ | ----------------- |

## Acceptance Criteria Evidence

| Requirement | Evidence | Status |
| ----------- | -------- | ------ |
| AC-{{NN}}.1 | | Pending |
| AC-{{NN}}.2 | | Pending |
| AC-{{NN}}.3 | | Pending |

## Final Verification Evidence

{{/goal fills this in only before marking complete. Copy the schema from VERIFY.md Section 8.}}

### Automated Check Evidence (MUST tier)

| Check ID | AC ID | Expected | Actual | Status |
| -------- | ----- | -------- | ------ | ------ |
|          |       |          |        |        |

### Screenshot Evidence (SHOULD tier)

| Check ID | Screenshot Path | Human Verdict | Notes |
| -------- | --------------- | ------------- | ----- |
|          |                 |               |       |

### Edge Case Evidence (NICE tier)

| Check ID | Expected | Actual | Status |
| -------- | -------- | ------ | ------ |
|          |          |        |        |

### Regression

| Test Suite | Result | Notes |
| ---------- | ------ | ----- |
|            |        |       |

### Acceptance Criteria Summary

| AC ID | Check IDs | Status |
| ----- | --------- | ------ |
|       |           |        |

### Files Changed

- _(populated by /goal)_

### Remaining Risks

- _(populated by /goal, "None known" if clean)_
````
