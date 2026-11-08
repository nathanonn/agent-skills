# Model guide

Pick the agent type, `model` and `effort` for every task. Scores: higher = better;
for cost, higher = cheaper. They are this guide's own judgement-based ordering,
not measurements, so treat them as a rough ranking.

## Contents

1. Models
2. Routing rules
3. Haiku gate and triage-then-verify
4. Effort
5. Agent types and code search
6. Escalation ladder
7. Quick routing examples

## 1. Models

| Agent `model` | Model | cost | intelligence | taste | speed | Use for |
|---|---|---|---|---|---|---|
| `haiku` | Haiku 5.5 | 9 | 4 | 4 | 10 | narrow, read-only or mechanical sub-tasks, triage of many items (only through the gate in §3) |
| `sonnet` | Sonnet 5.5 | 6 | 7 | 7 | 8 | **default worker**: well-scoped implementation, bug fixes, docs, tests |
| `opus` | Opus 5.5 | 4 | 8 | 8 | 6 | the orchestrator itself; architecture, gnarly debugging, ambiguous or sprawling work, reviews, user-facing quality work |
| `fable` | Fable 5.1 | — | — | — | — | **opt-in only.** Never a default. Only when the user asks for it by name, or after Opus has missed twice and the user has approved it (§6) |

**Fable is opt-in.** Opus is close to Fable on most work at a much lower price.
Fable is never routed automatically: no "hardest task" default, no reviews, no
routine escalation. Use `model: "fable"` only when the user asks for it by name
in the current request, or after Opus has missed twice on the same task and the
user approves it when asked (§6). In no-ask mode, never, even if the request
names it. The ladder's default top is `opus`.

Why the others sit where they do:

- **Haiku 5.5** is much cheaper and faster, but clearly weaker at multi-step
  agentic coding. It suits summaries, extraction, classification and narrow
  sub-agent work; Sonnet or Opus are the right choice for complex coding. Long
  contexts erode its cost advantage, so keep its jobs short.
- **Sonnet 5.5** is close to Opus on scoped coding work and strong at well-scoped
  everyday tasks and polished documents. It is the workhorse.
- **Opus 5.5** is clearly stronger on open-ended work that needs sustained
  judgement, and it delegates and self-checks well, which is why it runs the
  orchestrator.

A family alias resolves to the main session's exact model when the orchestrator
is in that family: from an Opus 5.5 session, `model: "opus"` is Opus 5.5.

## 2. Routing rules

- **Defaults, not limits.** Escalate (haiku → sonnet → opus) without asking when
  output misses the bar. Judge the output, not the price. Fable is the exception:
  it needs the user's say-so (§1, §6).
- **User-facing work needs taste ≥ 7.** UI, copy, API and interface design: `sonnet`
  floor, `opus` when quality matters or the user will look at it closely.
- **Reviews go to `opus`.** For a second opinion, use a different lens
  (adversarial, security, requirements-conformance), never the same prompt twice.
- **Always pass `model` explicitly.** Built-in agents (general-purpose, Explore,
  Plan) otherwise inherit the main session's model, so a forgotten `model` turns
  every cheap task into an Opus task.
- **Always pass `effort` explicitly** (§4). Claude passes `effort` on an Agent call
  only when instructions ask for it, and this guide is that instruction.
- **Do not use `subagent_type: "fork"`** for routed work: a fork ignores `model`
  and runs on the orchestrator's model.

## 3. Haiku gate and triage-then-verify

Haiku is allowed only when **all** of these hold:

1. The task is read-only or mechanical: search, list, extract, summarise,
   classify, or reformat data into a file outside the repo. Haiku never edits
   repo files; a rename or reformat across the repo is coding work (`sonnet`).
2. It has a single objective with explicit done-criteria.
3. Its output is cheap to verify: a list, a path, a summary, a grep result, a
   shortlist.
4. It involves no multi-step terminal or coding work, no user-facing copy, UI or
   API design, and no reviews.
5. Its work is bounded: an explicit budget of tool calls and external requests,
   no unbounded or API-heavy loops (bulk calls to GitHub or any rate-limited API).
6. Its context stays short: a short brief, and a job that ends well under 100k
   tokens of context. Split a long job across several Haiku agents instead of
   one long-running one.

Every Haiku brief carries the guardrail block from the brief template: the
budget, "on any error body or rate-limit response, stop and report; never store
error output as data", and "over budget, stop and report what is left".

When you do use Haiku, spot-check its output against the files (open two or three
of the paths it cites). On a miss, see §6: a budget overrun, a flail or an error
loop escalates to `sonnet`; it is not retried on Haiku.

### Triage-then-verify

Use Haiku to cut a large set down, and a stronger model to judge what is left.

1. **Triage** (`haiku·medium`, possibly 2–3 agents over disjoint slices): apply a
   cheap, explicit check to every item and return a shortlist with one line of
   evidence per item. Over-include rather than miss.
2. **Spot-check** the shortlist yourself (a few items, both in and out).
3. **Verify** the shortlist (`sonnet·medium`, or `opus·high` when the judgement is
   subtle or the result is user-facing): confirm or reject each item with
   reasons. Only verified items feed later tasks.

Worked example: "Which of the 180 open issues are performance problems we can
fix in `src/`?"

| Task | Route | Output |
|---|---|---|
| t1 Export issue titles and bodies, split into two slices | yourself: one `gh issue list --json` call, then `jq` into two files | `/abs/tmp/issues-1.json`, `/abs/tmp/issues-2.json` (90 each) |
| t2, t3 Shortlist the issues in **its own slice** that mention slowness, load time, memory, timeouts | `general-purpose` · `haiku` · `medium`, budget: read its one file, no API calls | ~15 issue numbers each, one quoted line per issue |
| t4 Verify the shortlist against the code: real perf problem? where in `src/`? | `general-purpose` · `opus` · `high` | confirmed list with file pointers |

The Haiku agents never call the API themselves: you fetch once, and each reads
only its slice. Brief absolute paths (`$TMPDIR` can differ between your shell and
a sub-agent's).

## 4. Effort

The start point for all three 5.5 models is `medium` for agentic work.
Effort names are calibrated per model, so a level on one model is not equal on
another. Raise only for a measured or observed reason. `xhigh` and `max` exist on
all three but are not defaults anywhere.

| Model | Default | Raise to | When | Avoid |
|---|---|---|---|---|
| `haiku` | `medium` | `high` once, then escalate to `sonnet` | longer agent task, strict instruction following | `xhigh`/`max` (compare with Sonnet first) |
| `haiku` | `low` | n/a | quick, mechanical, single-lookup work only | `low` on searches that must not miss, or long briefs: it skips searches and checks |
| `sonnet` | `medium` | `high` | tricky debugging, subtle concurrency or state bugs, longer tasks | `xhigh`/`max`; `low` for code changes (skips verification) |
| `opus` | `medium` | `high` | reviews, architecture, ambiguous or edge-case-heavy work | `xhigh` unless `high` skipped work (§6); `max` almost never (overthinks, long turns) |

Opus at `medium` is enough for most work, so `opus` does not need `high` by
default. Thinking is never fully off on `opus`; on `haiku` and `sonnet`, `low`
may skip thinking on simple turns.

Mechanics:

- Effort goes in the Agent tool's `effort` parameter (Claude Code v2.1.292+,
  non-fork agents). It persists when you resume the agent with SendMessage. On an
  older version without the parameter, omit it and keep the intended effort in
  the task label, and say in the report that effort was not applied.
- `CLAUDE_CODE_EFFORT_LEVEL` overrides it and `maxEffortLevel` caps it. Preflight
  warns when it sees either; then the labels do not match what runs, so say so in
  the report.
- Sub-agents inherit the main session's thinking setting. Keep thinking on in the
  orchestrator session; turning it off turns it off for every worker.

## 5. Agent types and code search

| Need | `subagent_type` | Model · effort | Isolation |
|---|---|---|---|
| Find files, trace a symbol (quick) | `Explore` | `haiku` · `low` | none (read-only) |
| Map a module, search that must not miss (medium) | `Explore` | `haiku` · `medium` | none |
| Deep or cross-cutting tracing ("very thorough") | `Explore` | `sonnet` · `medium` | none |
| Triage many items into a shortlist (§3) | `general-purpose` | `haiku` · `medium` | none |
| Investigation likely to need follow-up questions | `general-purpose` | `sonnet` · `medium` | none |
| Implementation, tests, docs | `general-purpose` | `sonnet` · `medium` | none (one writer at a time); worktree only in worktree mode |
| Sprawling change; escalation from sonnet (see §6 for the effort) | `general-purpose` | `opus` · `medium` | none (one writer at a time); worktree only in worktree mode |
| Architecture, hard debugging, edge-case-heavy change | `general-purpose` | `opus` · `high` | none (one writer at a time); worktree only in worktree mode |
| Review of an integrated diff | `general-purpose` | `opus` · `high` | none (read-only brief) |
| Drive a flow and collect evidence (verifier brief) | `general-purpose` | `sonnet` · `medium` | none; one at a time when it changes app state (writer rule) |

Notes:

- **Explore** is read-only and cheap, and needs no worktree. Up to 5 read-only
  agents may run at once; writers run one at a time unless the user asked for
  worktrees. State the thoroughness in the prompt: `Thoroughness: quick`,
  `medium` or `very thorough`.
- **Explore skips CLAUDE.md and git status.** Restate any rule it needs in the
  prompt, especially the repo's web-tool rules if it may touch the web, and the
  directories in scope.
- **Explore and Plan are one-shot** and cannot be resumed with SendMessage. When
  follow-ups are likely, use `general-purpose` instead.
- **A single known target** (one file, one symbol) is a tiny task: grep it
  yourself instead of spawning an explorer.
- Explore returns findings, not edits. Ask for paths with line numbers and a
  one-line claim per path, capped at a word count.

## 6. Escalation ladder

For a task whose output misses its done-criteria, pick the step that fits the
failure. At most 2 delegated retries per task, then do it in-session (the one
exception is an approved Fable run, below).

- **Partial** (hit `maxTurns` or its budget, was cut off, or ended on its own
  and reported done with listable work missing): resume the same agent with
  `SendMessage` and say what is left. It keeps its history, its model and its
  effort, and this counts as a retry. If it misses again, raise effort (below).
  Not for Haiku budget overruns (below).
- **Review found a `confirmed` defect**: send the findings with SendMessage to
  the task's original agent when it ran unisolated, is still resumable and its
  context is small (under ~100k tokens).
  Otherwise brief one fresh writer, unisolated, with the findings and the
  author's report. A defect that spans several tasks' files always goes to one
  fresh writer. You make one-line fixes yourself. Each fix round counts as one
  of that task's 2 delegated retries.
- **Could not reproduce** (a bug-fix worker stopped as its brief says): not a
  model miss. Re-brief with a reproducer or more context, or allow the fix
  unreproduced and say so in the report.
- **Wrong or off-scope** (the brief was the problem): re-brief a fresh agent with
  what you learned (tighter scope, the missing context, the failing check).
- **The model fell short** (the brief was fine): raise effort one step if §4
  allows it, or escalate one model tier, same brief (adding the failing check or
  its output is not a re-brief). Either is a fresh Agent call: tell it what the
  last attempt left in the tree, or roll that back first. The worker's report
  hints at which to try first; it is a hint, not a rule:
  - **Skipped work** (did not read a file it needed, did not run the verify
    command, missed an edge case): raise effort one step. Listable work
    missing goes to Partial first.
  - **Tried with full context and still wrong** (wrong approach, misread the
    spec or data): at the model's default effort, one effort step is still
    allowed; above the default, go up a tier. If the misreading traces to the
    brief, re-brief first (wrong or off-scope, above).
  - **Opus tried with full context and still wrong**: a counting miss (the only
    kind that counts toward "Opus missed twice"). At `medium`, the effort step
    above applies. At `high` there is no next tier and no `xhigh`: after the
    first counting miss, brief a fresh agent with what the failed attempt
    showed (e.g. the wrong layer), or do it in-session; after the second, ask
    the Fable question (below).

  Effort steps: haiku `low` → `medium`, haiku `medium` → `high` (once); sonnet
  `medium` → `high`; opus `medium` → `high` → `xhigh` (only after `high`
  skipped work). Tier steps: haiku → `sonnet·medium`; sonnet → `opus·medium`, or
  `opus·high` when the task is in the `high` category (§5) or already failed at
  `sonnet·high`. Never drop effort on escalation.
- **Opus missed twice on the same task** (after the effort steps above): stop and
  ask the user with AskUserQuestion whether to run it on `fable`, with the
  reason. Do not run `fable` unless the user approves. If they decline, or in
  no-ask mode (never Fable there, even if the request names it), do it
  in-session or report what is stuck. A miss classed as skipped work never
  counts; only Opus misses with full context do. Ask even when the 2 retries are
  used up: an approved Fable run is the one attempt allowed past the cap.
- **Haiku overran its budget, flailed, or hit errors or rate limits**: escalate
  to `sonnet` (or do it yourself if it is small). Never retry it on Haiku.
- **Retries used up, or the task turned out to be tiny**: do it in-session.

Record each retry in the task's `metadata` (model, effort, attempt) so the final
report shows what actually produced the result.

## 7. Quick routing examples

| Task | Route |
|---|---|
| "List every caller of `loadConfig`" | `Explore` · `haiku` · `low`, `quick` |
| "Which files register REST routes?" | `Explore` · `haiku` · `medium`, `medium` |
| "Trace how a request flows from hook to DB, every layer" | `Explore` · `sonnet` · `medium`, `very thorough` |
| "Which of 180 issues are perf problems?" | triage-then-verify (§3): `haiku` · `medium` shortlist, `opus` · `high` verifies |
| "Add a field to the settings form and save it" | `general-purpose` · `sonnet` · `medium` |
| "Write unit tests for the parser module" | `general-purpose` · `sonnet` · `medium` |
| "Fix an intermittent race in the sync worker" | `general-purpose` · `sonnet` · `high`, escalate to `opus` · `high` on a miss |
| "Design the data model for the new feature" | decide it yourself, or `general-purpose` · `opus` · `high` |
| "Write the landing page copy" | `general-purpose` · `opus` · `high` (taste; the user will read it closely) |
| "Review the integrated diff against the spec" | `general-purpose` · `opus` · `high`, requirements-conformance lens |
| "Rename `fooBar` to `foo_bar` in 30 files" | `general-purpose` · `sonnet` · `medium` (a multi-file edit is coding work, so not Haiku; Haiku may only produce the file list) |
