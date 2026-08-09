---
name: prototype-wp
description: Prototype a WordPress or WooCommerce plugin from its written spec as a runnable offline browser simulation — admin screens, front-end surfaces, and the rules connecting them — so the spec can be evaluated as a product before any PHP is written. Use when asked to prototype or simulate a WP plugin, build a clickable or demoable version of one, or check whether plugin requirements hold together. A focused mode builds only named surfaces, for requests like "build me a working WordPress admin settings screen" or "show me what this settings tab would look like". Not for writing production plugin code, not for logic-only prototypes with no WordPress surface, and not for exploring visual variations of a single component.
---

# Prototype a WordPress plugin

A prototype is throwaway code that answers a question. This one answers:

> **Does this specified plugin hold together as a product?**

Not *"does this logic feel right?"* and not *"what should this look like?"*
Those are different prototypes. A state machine with no WordPress surface wants a
throwaway terminal app that re-renders the whole state after every keystroke.
Visual variations on one component want several structurally different renderings
of one route, switched from a floating bar. If the question is really one of
those, say so and build that instead — this skill is the wrong shape for it.

This skill applies when there is a WordPress plugin, an admin or front-end
surface, and an intent to evaluate behaviour before implementing it.

## What this needs

| | |
| --- | --- |
| Static file server | One command, any runtime. `kit/package.json` aliases `python3 -m http.server 4174`; `npx serve`, `php -S localhost:4174` and `ruby -run -e httpd -- -p 4174` are equivalents |
| Browser driver | Anything that can evaluate JavaScript in the page **and** capture a screenshot — see [`VERIFY.md`](VERIFY.md) |
| `ffmpeg` | Optional, for the video recipes only; [`kit/RECIPES.md`](kit/RECIPES.md) covers its absence |

No Node version, no dependency install, no build step. The prototype is classic
scripts served as files.

## Three layers

Every prototype is built as three separable layers. Keeping them separate is what
makes two-thirds of the work copyable and the last third portable.

| | Layer | Where it comes from |
| --- | --- | --- |
| **Spine** | WordPress-generic chrome — admin bar, menu, notices, list tables, metaboxes, capability and dependency gates | Copied from [`kit/KIT.md`](kit/KIT.md) |
| **Overlay** | Host-plugin chrome — WooCommerce settings tabs, product editor, storefront | Copied from `kit/`, optional |
| **Engine** | The spec's own rules: resolution, precedence, validation, derivation. DOM-free | Written fresh, every time |

The engine is the single resolution path. Every surface consumes it; no surface
re-implements a rule that belongs in it.

The kit and every measured claim in these documents come from **the source run**
— a 4,916-line WooCommerce gallery-plugin prototype built from a written spec.
Every file in this skill uses that phrase for it.

## Modes

State the mode before building and put it in the README. The user steers the
budget — never size the work silently.

| | **Full-coverage** | **Focused** |
| --- | --- | --- |
| Input | A spec meeting the bar in P0 | A spec, or a named surface |
| Output | Every spec section represented | Only the named surfaces |
| Spine + overlay | Full | Full |
| Engine | Complete | Only rules the named surfaces touch |
| Driver panel | Required | Required |
| Verification | Both passes | Both passes, scoped |
| Porting note | Required | Optional |
| Capture | May stay on `main` as a durable reference — state which and why | Throwaway branch out of `main`, with a pointer on the implementation issue |

Focused mode exists because neither of the other two prototype shapes serves
"build me a working WordPress settings screen."

---

# The build

Twelve phases. The order is a dependency graph, not a preference.

## P0 · Assess the spec

Read the spec **in full**. The questions in P1 are only visible to someone who
has read the whole document.

Run a pre-flight and report what is present and what is absent — state the
consequence for the build, and stop there. Deliver the report before building
anything:

| Check | Looking for |
| --- | --- |
| Structure | Numbered sections that can become a build order and a coverage table |
| Rule IDs | `BR-*`, `REQ-*`, `FR-*`, or "shall" sentences — anything addressable |
| Worked examples | Cases stating both inputs **and** expected output |
| Non-goals | "out of scope", "deferred", "later stage" |
| Tables | State tables, decision tables, precedence rules |
| Acceptance criteria | Given/When/Then, checklists, release criteria |

**Full-coverage needs all six of:** an entity model with fields · a resolution or
precedence rule where more than one source of truth exists · enumerated settings
with types and defaults · the failure states that matter · at least one worked
example with stated expected output · explicit non-goals.

Below that bar, say so, offer focused mode, and wait for the answer. Settling the
mode is not a shape question — the round-trip limit at the foot of this file
counts shape questions only. Rule IDs, acceptance criteria and state tables are
upside, not requirements.

**No worked example anywhere?** Propose one — inputs and expected output — and
get agreement before building. A prototype with no assertable expected output
cannot be verified, only admired.

**No spec at all?** State the gap and offer the fork: write a thin spec first —
problem, solution, user stories, implementation decisions, out of scope — or
build a narrow prototype answering one question. If the user proceeds anyway,
drop to focused mode, elicit only the six-item list inline as a handful of
questions, and record every assumption at the top of the README so invented
requirements stay visible as inventions. Never present an assumed
requirement as a specified one.

**Honour stated non-goals as constraints.** Leave a deferred feature
unimplemented *and exercise its absence* — implementing it silently
short-circuits the fallback rule the spec does define.

**Done when:** the pre-flight report is delivered and the mode is named.

## P1 · Ask

> **Escalate shape. Decide construction.**

**One batched question round** — `AskUserQuestion` where the harness provides it,
otherwise a single numbered message — after reading the spec and before writing
any code. Three questions — four in focused mode. Every option carries a
recommendation and its reasoning; the recommended option is listed first and
marked.

1. **Fidelity** — WordPress admin **lookalike**, or **neutral prototype UI**?
   Lookalike reproduces admin chrome faithfully so the artifact doubles as a
   visual spec, and costs the full spine plus overlay (505 lines of CSS).
   Neutral is much cheaper and useless as a visual reference. This has the
   largest blast radius of anything asked here, and nothing in a spec or a repo
   predicts the answer.

2. **Debug surface** — a live **rule/state inspector**, a **state-only**
   inspector, or **neither**? If the answer is *neither*, state in one line that
   this overrides the standing rule that a prototype renders the full relevant
   state after every action, so the override is a recorded choice rather than an
   omission — then honour it, and leave it honoured. Rule IDs still go into
   source comments either way (P5):
   declining an on-screen surface never costs traceability.

3. **Overlay** — detect it first, from plugin headers, `composer.json` /
   `package.json`, required-plugin statements in the spec, and domain vocabulary
   (`product`, `variation`, `cart`). Present the detection as the recommendation
   **with its evidence**, for the user to confirm or correct. Asked rather than
   inferred because a wrong guess means rebuilding the most expensive layer, and
   a third question inside a round that is already happening costs nothing. Only
   WooCommerce ships as an overlay — where none applies, the answer is *plain
   WordPress admin* and only the spine is built.

4. **Surfaces** *(focused mode)* — which surfaces are in scope. Build nothing
   outside them.

After this round, do not ask again unless proceeding under any assumption would
be unsafe or would make the work useless if wrong. Construction questions —
libraries, file layout, naming, styling — are answered by the table at the bottom
of this file.

**Done when:** three (or four) answers are in hand, from one round trip.

## P2 · Scaffold → [`kit/KIT.md`](kit/KIT.md)

Copy the spine into the **prototype root** — a directory whose name identifies it
as a prototype, inside the repository the plugin belongs to, at the repo root or
beside the module it concerns, never inside the plugin's own source tree. Decide
it here, because this is where the copy happens; the Capture section of
[`OUTPUTS.md`](OUTPUTS.md) reasons about the choice at P10.

Copy the overlay if the answer to question 3 named one. Wire up the four
configure calls, uncomment the four prototype `<script>` tags in `index.html`,
and delete the placeholder boot block beneath them.

The shell does not stand up on kit files alone. `WP.configure()` resets the store
as it runs, so it throws without a `fixtures` function, and the router renders an
error notice with no route registered. Write a throwaway stub fixture function
and one stub route — scaffolding, not spec work, replaced by P4 and P7.

**Done when:** the shell serves from one command with an admin bar, a menu and a
routed empty screen, and the placeholder boot block is gone. A page reading *"no
prototype scripts are wired up yet"* is that block still in place — the
`index.html` edit at the top of this phase, not a boot bug.

## P3 · Media → [`kit/RECIPES.md`](kit/RECIPES.md)

Before fixtures — a fixture pointing at a missing file is invisible until render.

**Done when:** every file the fixtures will reference exists, at varied aspect
ratios.

## P4 · Fixtures → [`BUILD.md`](BUILD.md)

**Done when:** every spec worked example is a fixture verbatim, the adversarial
checklist is covered, and the fixture pre-flight passes all three checks.

## P5 · Domain engine → [`BUILD.md`](BUILD.md)

**Done when:** the engine holds every rule the mode covers, contains no DOM
reference, and cites spec rule IDs in source comments with none invented.

## P6 · Verify the engine → [`VERIFY.md`](VERIFY.md)

A distinct phase, before any screen exists. Do not fold it into P9.

**Done when:** every worked example, state table, validation rule, precedence
level and derived-key stability check has been asserted with measured values
quoted.

## P7 · Screens → [`BUILD.md`](BUILD.md)

**Done when:** every screen and meaningful sub-state has a URL, and the mode's
surfaces are built.

## P8 · Driver panel → [`DRIVER.md`](DRIVER.md)

**Done when:** every baseline state the spec mentions is drivable, and each has
an observable effect on a default route.

## P9 · Verify the interface → [`VERIFY.md`](VERIFY.md)

**Done when:** both measurement and visual review have run, every route loads
with zero console errors, and every spec acceptance criterion has been exercised.

## P10 · Document → [`OUTPUTS.md`](OUTPUTS.md)

**Done when:** the README carries all seven sections, a coverage table organised
by the spec's own sections, and three honest-limits lists.

## P11 · Porting note → [`OUTPUTS.md`](OUTPUTS.md)

Required in full-coverage mode, optional in focused mode.

**Done when:** the engine is mapped to its intended PHP home, and rules validated
by measurement are distinguished from rules implemented by reading — or, in
focused mode, the phase is declined out loud rather than skipped quietly.

---

## Decided without asking

Each of these is settled so that a future change is a deliberate revision rather
than drift.

| Decision | Default |
| --- | --- |
| Routing | Hash-routed single page; every state deep-linkable |
| Language | Classic scripts, `window` globals, no modules, no framework |
| Build | None |
| Run | Static file server, one command |
| Network | Zero calls; remote resources validated for real, resolved to bundled files |
| Persistence | In memory; reload resets to fixtures |
| Media | Generated; real browser primitives where cheap |
| Driver panel | Always present, always labelled |
| Engine | DOM-free, single resolution path |
| Fixtures | Encode the spec's worked examples verbatim |
| Rule IDs | Source comments only, never on screen |
| Verification | Two passes, measured |
| Polish | None — no tests, no abstractions, no error handling beyond runnability |

Mark the prototype as throwaway in the README title and in a header comment in
every source file.

## What failure looks like

The prototype has failed, however good it looks, if it produces:

- fidelity that makes **invented requirements** look specified — the worst
  outcome available here;
- a coverage claim the verification did not establish;
- no assertable expected output anywhere;
- a driver panel indistinguishable from the plugin's own UI;
- a rule ID in the source that does not exist in the spec;
- more than one round trip of shape questions.

## Credit

Derived from Matt Pocock's `prototype` skill (github.com/mattpocock/skills,
`skills/engineering/prototype/`), which supplies this skill's framing and its
throwaway / one-command / in-memory / no-polish / surface-the-state / capture-it
rules. The WordPress-specific build — the twelve phases, the spine/overlay/engine
split, the driver panel, the asset kit and the two-pass verification — is new
here. Matt's skills are MIT licensed.
