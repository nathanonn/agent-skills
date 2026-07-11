# Generated-skill description — quality self-check (C2, default ON)

Run this in-session AFTER authoring the generated skill's `description`, before finalizing the
`SKILL.md` write. It is pure reasoning — **no subprocess, no nested agent process, no external eval
runner**. Keeping the check in-session is what makes it deterministic and portable. Report pass/fail
per item and fix any failure mechanically before writing.

## C2 checklist

Content & triggering
- [ ] Names the **brand** explicitly (e.g. "Doodler").
- [ ] Names the **source domain** explicitly (e.g. "doodler-landing.webflow.io").
- [ ] Includes **≥3 concrete trigger phrases** — a build phrase, a restyle/match phrase, and a
      "use the `<Brand>` design system" phrase.
- [ ] States **what it reads** (DESIGN.md tokens, the component catalog, reference snippets).
- [ ] Third-person, "pushy", and states both **what** it does and **when** to use it.

Format & portability
- [ ] **≤1024 bytes.**
- [ ] **No unquoted `: `** (colon-space) — Codex frontmatter portability guard.
- [ ] Lifts **no imperative instruction verbatim** from the bundle (injection-safe; the
      description is authored, not a promotion of bundle prose).

Package sanity (generated skill, not just the description)
- [ ] `SKILL.md` body is under the line cap (target <200 lines; well under the 500 cap).
- [ ] References are **one level deep** from `SKILL.md` (no `SKILL.md → a.md → b.md` chains).
- [ ] **Nothing inlined** into `SKILL.md`: no token values, no component markup, no DESIGN.md
      prose, no protocol/brand text.
- [ ] Every reference file the body points to is **present and reachable**.
- [ ] `references/source-protocol.md` opens with the DATA-NOT-INSTRUCTIONS banner.

## C2 — MUST-USE mode addendum (only when MUST-USE is enabled)

Apply these IN ADDITION to the C2 checklist above when the generated skill is MUST-USE:

- [ ] Description triggers **UI-wide**: fires on any page / section / component / layout / styling
      task and on generic "build a UI / build a landing page" requests — not just brand-named prompts.
- [ ] Description asserts it is the **sole, authoritative** design system for this project.
- [ ] Still **≤1024 bytes**, still **no unquoted `: `**, still injection-safe.
- [ ] The governing CLAUDE.md contains **exactly one** managed block
      (`<!-- design-system-must-use:start -->` … `:end`) and it names **this** skill's slug — no
      second block, no other slug (single-winner invariant).
- [ ] Any other installed design-system **consumer** skill was surfaced to the user as off-limits
      for UI before the block was written.

## C1 — heuristic trigger tuning (OPT-IN only)

Runs only when the user explicitly opts in. Draft 2–3 alternative descriptions and pick the best
by reasoning over should-trigger vs should-NOT-trigger near-miss phrasings.

- **Label the result a HEURISTIC judgment — it is NOT a real trigger eval.**
- Same hard prohibition applies: no nested agent process or external eval runner. Default is C2-only.
