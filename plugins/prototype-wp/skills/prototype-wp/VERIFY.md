# Verification

The single most transferable finding from the source run:

> **Three of the four real bugs looked completely correct in a screenshot.**

| Bug | The screenshot showed | The measurement showed |
| --- | --- | --- |
| Class list swallowed by a tag-selector regex | a notice | `.notice-error` matched nothing — every notice had no classes |
| `Object.assign` dropping CSS custom properties | thumbnails | the setting was 96, the render was 80 — two settings entirely dead |
| Derived items rebuilt with fresh ids | a gallery | selection reset to 0 instead of holding at 4 |

Call these **silent** bugs: the page renders a plausible result and nothing
announces the failure. Screenshots caught the layout defects and none of these.
Measurement caught these and none of the layout defects. **The two sets barely
overlap, which is why both passes are mandatory.**

Drive the browser with whatever automation the environment provides — Playwright,
Puppeteer, a browser MCP server, a CLI wrapper. Two capabilities are required and
neither is optional: **evaluate JavaScript in the page**, and **capture a
screenshot**. If only one is available, say so and mark the other pass as not run
rather than reporting a pass that did not happen.

## Pass 1 · The engine (P6)

As soon as the domain engine exists, and **before any screen is built**, verify
it by direct assertion. This is cheap precisely because the engine is DOM-free —
a whole rule matrix goes through one evaluation.

Assert, at minimum:

- **every worked example** from the spec, against its stated expected output;
- **every state table or decision table**, exhaustively;
- **every enumerated validation rule**, with both accepted and rejected inputs;
- **the precedence model, at each level** — check the `source` map, not just the
  resolved value, or a coincidence reads as correct precedence;
- **derived-key stability** across repeated resolution.

**Quote measured values, not impressions.** "The thumbnail is 80 × 60" is a
result. "The thumbnails look right" is not, and cannot fail.

A failing worked example stops the build long enough to report it: either the
engine is wrong or the spec is, and both matter more than the next screen.

> Two source-run bugs lived in layers that already existed at this point and were
> found only after every screen was built: derived-key instability, and pruning
> that ran on the failure path. Both were reachable here, in one evaluation, for
> the price of an assertion.

## Pass 2 · The interface (P9)

After screens and the driver panel exist. Use **both** modes — they detect
different things.

| Mode | Detects | Use for |
| --- | --- | --- |
| **Measurement** (evaluate JS in the page) | Behaviour, applied styles, computed geometry, element state | Settings taking effect, selection persistence, class application, computed sizes, instance isolation |
| **Visual** (screenshot) | Layout, stacking, overflow, glyph rendering, contrast | Elements painting behind others, stretched containers, missing icons, broken alignment |

Cover:

- **every route**, with **zero console errors** — the kit logs one deliberately
  for every media source that fails to load, so a fixture set following the
  three shapes in [`kit/RECIPES.md`](kit/RECIPES.md) produces none of them, and
  one that appears is a fixture pointing at a file that is not there;
- **every acceptance criterion in the spec** — when the spec has a verification
  plan, use it rather than inventing a parallel one;
- **every simulation**, toggled on *and* off, with the observed effect recorded;
- **every capability boundary**;
- **every destructive action** and its confirmation;
- **instance isolation**, wherever more than one instance can appear on a page.

Confirm all bundled assets load and all sources pass a syntax check.

## Protocol

**Cache-bust from the first run of the loop**, not as a debugging step after
something confusing happens. A static server under active editing serves stale
sources, and a stale source looks exactly like a fix that did not work.

**A shell with no screens is a missed edit, not a boot bug.** A page rendering
admin chrome and the notice *"no prototype scripts are wired up yet"* is
`index.html`'s placeholder boot block still in place, with the four prototype
`<script>` tags still commented out — the P2 `index.html` edit, surfacing here
after everything else was built.

**Route around partial states.** Where a state machine has a "partial input"
state, test transitions between complete states *without passing through it*. A
source-run test of "an incomplete selection must not change the view" was routed
through a partial state that legitimately resets — so it measured the wrong
transition and had to be re-run.

**Exercise failure-path rules on the failure path.** Obsolete-option pruning ran
even when the save was rejected, so the message demonstrating it could never
appear in the flow that was supposed to show it. A rule that only applies when
something goes wrong is only verified when something goes wrong.

## Reporting

**Keep a not-verified list as you go**, and carry it into the README and any
handoff. Name what the harness could not exercise rather than assuming it. In the
source run that was: `file://` operation (the harness blocks the protocol), real
touch and pinch gestures, real OS file drag-and-drop, and responsive breakpoints
— media queries existed and were never rendered at those widths.

**Where something is unverified, the artifact does not claim it.** The source
README documents only the server run command, because that is the only one that
was tested.

**Report every bug with the measurement that exposed it** rather than fixing it
quietly. Three of the four source-run bugs are now closed in the kit — two as
hardened primitives, the third inside `saveSettings()`; that transfer only
happens if they are surfaced.
