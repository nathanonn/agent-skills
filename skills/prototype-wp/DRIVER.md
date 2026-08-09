# The driver panel

Roughly a third of a WordPress plugin spec describes states a healthy install
cannot produce on demand. Without a driver those rules are unreachable, and the
prototype quietly covers only the happy path while looking complete.

The driver creates a tension with fidelity: a pixel-faithful admin containing
hidden fake switches would mislead. Resolve it by making the driver **loud**.

Implementation is declarative — see `Driver.configure()` in
[`kit/KIT.md`](kit/KIT.md).

## The panel

Present in both modes.

- **Visually distinct** from the admin chrome it sits on, with an explicit
  caption stating it is not part of the plugin. The kit ships it dark and
  gold-captioned in a corner for exactly this reason.
- **Collapsible, collapsed by default**, showing a count of how many conditions
  are away from a healthy default. Without that count, a prototype left with a
  simulation switched on reads as a prototype with a bug.
- **Three groups:**

| Group | Contents |
| --- | --- |
| **Environment** | Activation state of the plugin and its dependencies; WordPress, PHP and host-plugin versions |
| **Acting as** | The role the current user holds |
| **Simulate** | Every failure condition the spec names |

- **Reset prototype data** and **Clear all simulations** controls.

## Baseline states

These apply to essentially every WordPress plugin. Implement each one the spec
mentions, and **report any you omit** rather than dropping it silently.

**Environment**
1. Dependency plugin missing or deactivated
2. Dependency plugin below its minimum version
3. WordPress below its minimum version
4. PHP below its minimum version
5. The plugin itself deactivated

**Permissions**

6. Acting as a role without the management capability
7. Acting as a role without the edit capability
8. Acting as an unprivileged visitor

**Data**

9. A referenced attachment or related record deleted
10. Stale option values written by an older version
11. A remote resource unreachable

**Concurrency**

12. Save conflict — another user saved first
13. Record locked by another user

**Client**

14. Interaction scripts fail to initialise

Domain-specific conditions from the spec are **added** to this list, not
substituted for it.

## What makes a simulation real

**Every simulation has an observable effect on the default route** of at least
one fixture. A source-run simulation targeted a record that happened to be
hidden, so toggling it changed nothing visible and the simulation looked broken.
Pick the target when the fixtures are chosen, not when the switch is wired.

**Model the condition, not the symptom.** Deleting a record from the fixture
store is a simulation. Hard-coding an error message is a screenshot of one — it
proves nothing about the rule it is meant to exercise, because the rule never
runs.

**Composable and individually reversible.** Enabling a second condition must not
require resetting the first.

## Honesty

**Make the fake structurally visible**, not merely disclosed. A framed provider
player wrapped in a branded shell is honest. A pixel-perfect fake claiming to be
a live embed is not, however carefully the README explains it. Each fake is
described in the README precisely enough that a reader knows **where the seam
is**.

**Deactivated ≠ broken.** An administrator switching the plugin off is expected
and raises no notice; a missing dependency or an unmet minimum is unexpected and
does. Conflating them is a common simplification that makes the prototype nag the
user for doing something deliberate. The kit's `dependencies()` already separates
them — keep the distinction in the screens.

**Notices respect capability.** A user without the relevant capability does not
see administrative notices intended for administrators. Showing every notice to
every role is the most common way a prototype misrepresents what a shop assistant
would actually see.

## What the panel is not

The driver panel is **not** the debug surface from question 2. The panel sets
*inputs*; an inspector reports *state*. A user who declined an inspector has not
declined the panel.

The panel simulates the **environment**, not the domain. It does not expose
controls that mutate the plugin's own data in ways the plugin's own UI cannot —
that would make it possible to demonstrate a state the real plugin can never
reach.
