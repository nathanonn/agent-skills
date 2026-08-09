# Outputs: README, report, porting note, capture

A high-fidelity lookalike is more persuasive than a rough sketch, which makes its
documentation more load-bearing, not less. These outputs are what stop the
artifact becoming a source of false confidence.

## P10 · The README

Start from [`kit/README.template.md`](kit/README.template.md). It opens with an
unambiguous throwaway marker, the mode, and the spec it was built from, then
carries seven sections:

| Section | Contents |
| --- | --- |
| **Run** | The single command, copy-pasteable, plus the URL |
| **Where to start** | A numbered tour hitting the highest-value behaviour first |
| **Prototype controls** | Every driver-panel control and what it does — the heading matches the caption the kit panel carries on screen |
| **Fixtures** | Every entity and **which rule cluster it exists to exercise** |
| **Coverage** | Each spec section mapped to where it can be seen |
| **Honest limits** | Three lists — see below |
| **Layout** | The file tree, with the domain engine called out |

**Order the tour by what is most likely to be wrong**, not by the spec's section
order. Settings validation and the resolution model come before cosmetic
surfaces.

**Organise the coverage table by the spec's own sections**, so a reader can check
the prototype against the document rather than against a narrative.

### Honest limits — three distinct lists

1. **Simulated** — what is faked, and how faithfully. Describe each fake
   precisely enough that a reader knows **where the seam is**. Not "remote images
   are faked" but: *"Remote URLs are never fetched. Validation is real and
   synchronous; the redirect chain comes from a fixed table. Saved addresses are
   mapped to bundled files so they render, and the address a merchant sees and
   saves is always the remote one."*
2. **Genuine** — what is real browser behaviour and can be trusted.
3. **Not verified** — carried from the verification pass, including everything
   the harness could not exercise, plus every assumption recorded where the spec
   was silent.

## P10 · Reporting to the user

Report the run command, the mode, what was verified **with measured results**,
what was not verified, any bugs found, and any spec contradictions found.

**"Implemented" and "verified" are different claims. State them separately** and
claim no coverage the verification did not establish.

Where the spec used rule IDs, say how many were cited in source and confirm none
were invented — then say plainly that **citation density is not a coverage
metric**. In the source run, 147 of 216 rule IDs were cited with zero phantoms,
yet four demonstrably-implemented rules were uncited, and a cited rule can still
be wrong.

## P11 · The porting note

The domain engine is the part of a prototype that survives. Stopping at a running
artifact leaves the payoff on the table.

Required in full-coverage mode; optional in focused mode. It is a **document, not
PHP code** — this skill does not write plugin code.

| Section | Contents |
| --- | --- |
| **Engine map** | Each engine function → the spec rules it encodes → its intended PHP home (class, hook, filter) |
| **Data shapes** | Each fixture entity → its intended storage (post meta, option, taxonomy, custom table) |
| **Validated** | Rules confirmed by measurement, with the measured result |
| **Assumed** | Rules implemented under an interpretation the spec did not state |
| **Spec defects** | Contradictions found while building, with the interpretation adopted |
| **Not transferable** | Prototype-only constructs with no PHP equivalent, and why |

**Distinguish rules validated by measurement from rules implemented by reading.**
Only the former carry evidence.

**Every spec contradiction found during the build appears here.** These are among
the most valuable outputs of the whole exercise and are worth more than the
artifact — do not leave them in a transcript.

Where a rule proved unimplementable as written, say so plainly and describe what
was built instead.

Name the **browser artifacts** — pointer capture, transform-based zoom, autoplay
policy — so the implementer does not attempt to port them into PHP.

## Capture

**Where it lives.** In the repository it prototypes for, in a directory whose
name identifies it as a prototype, at the repo root or beside the module it
concerns. Never inside the plugin's own source tree, where it could be mistaken
for shipping code or swept into a build.

**Branch.** A prototype normally lands on a throwaway branch out of `main`, with
a context pointer on the implementation issue; `main` keeps only the validated
decision. Focused mode follows that. **Full-coverage mode may stay on `main`** as
a durable reference — a several-thousand-line prototype doubling as the visual
spec the implementation will be read against earns its place. State which was
chosen and why.

Either way: state where the prototype landed, and **commit only when asked**.

**Continuity.** Offer a handoff document covering the mode, the answers to the
shape questions, where things live, what was verified and what was not, bugs
found, spec defects found, and open follow-ups.

Record that the shape answers were **the user's**, so a later session does not
silently reverse a decision it takes for a default — a session that adds a state
inspector to a prototype whose owner declined one has undone a deliberate choice.

Where this prototype supersedes an earlier one, ask what happens to the old one
rather than deleting it or leaving it silently.
