# Building: fixtures, engine, screens

Construction reference for P4, P5 and P7. Media generation is in
[`kit/RECIPES.md`](kit/RECIPES.md); the kit's wiring is in
[`kit/KIT.md`](kit/KIT.md).

## P4 · Fixtures

A fixture set is a simulated WordPress install: options, entities, media,
environment, and the simulation block. The environment and simulation blocks are
separate, resettable structures — the driver panel writes to them.

### Worked examples come first

Every worked example in the spec becomes a fixture, with the spec's stated inputs
reproduced **verbatim**, one entity per example. This is the highest-value thing
a spec can carry: it turns verification from judgement into assertion. A fixture
that "captures the spirit" of a worked example asserts nothing.

### The adversarial checklist is permanent demo data

Not special test states — permanent entities in the fixture set, so every pass
over the prototype walks past them. Cover each of these the domain allows:

- a duplicate of something the spec says must be deduplicated;
- a hidden or excluded item **in the middle** of an ordered sequence;
- an entity with **zero** usable items;
- an entity with exactly **one** item;
- an entity in every lifecycle state the spec names — draft, private, trashed;
- a derived item that **collides** with an existing one;
- a derived item whose **source is absent**.

The hidden-in-the-middle, zero-item and single-item entities are where off-by-one
and empty-state rules live. The last two are where derivation rules break.

### Fixture pre-flight

Three checks, before P5. Both defects the source run found late were caught by
checks 1 and 2.

1. **No fixture value is one the plugin's own validation would reject.** The
   source run's remote fixtures sat under a `.test` TLD — which the plugin's own
   blocked-suffix list rejects. Use `example.com` and its subdomains.
2. **Every derived field agrees with what the engine derives from its source.** A
   fixture that disagrees with its own derivation produces a permanent spurious
   state that reads as an engine bug for as long as it takes to find.
3. **Every simulation has an observable effect on the default route.** Covered in
   [`DRIVER.md`](DRIVER.md) — check it here, when the fixtures are being chosen,
   because that is when the target is picked.

When a fixture built from the spec disagrees with the spec's own stated output,
the spec has a defect. Report it, record it for the porting note, and proceed
under a stated interpretation rather than stopping. **Finding this is a result of
the prototype, not a fault in it.**

## P5 · Domain engine

### No DOM, at all

Not a style rule. A DOM-free engine lets a whole rule matrix be asserted in one
evaluation, without driving a UI — the source run asserted a 20-case URL
validation matrix in a single call. The moment the engine touches `document`,
every assertion has to go through a screen.

### One entry point per resolved concept

Consumed identically by every surface. The source engine's `resolveGallery()` had
five consumers and one implementation. When a screen re-implements a rule, the
two copies diverge and the prototype starts disagreeing with itself — and the
spec cannot tell you which copy was wrong.

Where the spec states a resolution or precedence model in prose, it maps onto one
named function. Where it states none, flag that the engine's shape is a design
decision being made on the user's behalf and record it as an assumption.

### Derived entities get deterministic keys

Computed from their source, never generated. Derived items rebuilt with a fresh
id on every recomputation broke "preserve the current selection" silently in the
source run — the lookup could never match, and nothing on screen said so.

### Rule IDs in source comments

Placed where a rule constrains a **non-obvious** decision, never in rendered
output. The comment supplies the reasoning; the ID alone is only a pointer:

```js
/* BR-SYNC-011 — a repeated attachment is a legitimate gallery record but must
   appear once in the synchronised list, so dedup happens on write, not on read. */
```

Never cite a rule ID that does not exist in the spec. Where a rule was
implemented under an interpretation rather than a stated requirement, the comment
says so.

Citation density maps where the hard parts were. It is **not** a coverage metric.

## P7 · Screens

### Real primitives beat simulated ones

Where a real browser primitive is cheap, use it, and say in the README which is
which. Real `<video>` with real files makes autoplay, muting, looping and —
crucially — **autoplay rejection** genuine browser behaviour. A mocked player
that always plays cannot falsify an autoplay policy. Reach for it on the screen
that plays something; the kit's media grid renders a poster and a play
affordance instead, for the reason in [`kit/KIT.md`](kit/KIT.md).

Real network fetches are the counter-example: expensive, and they cost
determinism. Correctly faked.

### Every state has a URL

Every screen and every meaningful sub-state, including parameterised variants.
Deep-linkability is what makes the verification loop cheap and the prototype
demoable — a state reachable only by clicking through three screens gets checked
once.

### Budget the entity editor

**The entity editor is the expensive surface**, not the domain engine. In the
source run it was 1,043 lines — larger than the 824-line engine it drove — while
the settings screen was formulaic. Plan for that, and warn the user if the editor
is being cut for budget rather than cutting it quietly.

### State lives in memory

Reload resets to fixtures. The second-order benefit is the reason this is not
just a shortcut: because "saving" mutates an in-memory store rather than a
database, pending-versus-saved state, save conflicts and record locks become
*observable* rather than infrastructural.

### Zero network calls

Remote resources are validated for real — scheme, credentials, host, redirect
chain, whatever the spec requires — then resolved through a fixture map to
bundled files. **The address the user sees and saves is always the remote one.**
A prototype that rewrites the stored URL to a local path has changed the data
model, not just the transport.

### Skip the polish

No tests, no abstractions, no performance work, no error handling beyond what
keeps the prototype runnable. Every source file opens with a one-line header
naming its role and marking it prototype code.
