---
name: handoff-doc
description: Write or update a session handoff doc that lets a future session (Claude or human) resume work without re-reading the whole transcript. Use this skill whenever the user asks to "write a handoff", "create a handoff doc", "update the handoff", "write a doc so the next session can continue", "session handoff note", "hand this off", or points at a path and says to capture where things stand. The user only needs to give the destination file path — the content is distilled from the current session. Do NOT use for general project documentation, READMEs, API docs, code comments, or changelogs.
---

# Handoff Doc

Write a concise handoff doc that captures the current session's work so a future
session can pick up cold. The whole point is leverage: instead of the next
session re-reading a long transcript, it reads one tight doc and knows what was
done, where things live, what's verified, and what's still open.

The user gives you a **destination path**. You supply the content by distilling
what actually happened in this session. Keep it concise — a handoff is a launch
pad, not a transcript.

## Workflow

### 1. Resolve the target path

Look at the path the user gave and the folder it lives in.

- **List sibling files** in the target directory. Many handoff folders use a
  `YYYYMMDD_NN_short-slug.md` convention (date, then a two-digit sequence). If
  the siblings follow a pattern, match it — continue the numbering and use
  today's date.
- **Only when the target doesn't exist yet,** sanity-check the filename against
  today's date. An existing doc's date is never a typo; step 2 decides what to
  do with it. If the new filename's date looks wrong (e.g. a year or month that
  doesn't match today, or it's out of order with its siblings), it's probably a
  typo. Surface it with `AskUserQuestion` and offer the corrected name — never
  silently rename.

### 2. Decide create vs. update

- If the target **doesn't exist** (or is an empty placeholder), create it.
- If the target **already exists with content**, decide without asking:
  1. **It already covers this session's work.** Claude wrote it earlier in this
     same session (including before a context compaction) and the session is
     still on that same piece of work. A conversation resumed on a later day
     counts as an earlier session. Update it in place: revise the sections
     and add what's new, keeping what's still true. A short dated "Update"
     section at the end is fine when that reads better.
  2. **It's from an earlier session, or covers earlier work this session has
     since moved past, and the folder uses a `YYYYMMDD_NN_slug.md` series.**
     Write a sequel at the next `_NN_` with today's date and link back to the
     prior doc. Never rewrite an earlier session's doc in this case.
  3. **It's a single fixed file with no series** (e.g. `HANDOFF.md`) from an
     earlier session, or covers earlier work this session has since moved past.
     Append a new dated section. Don't wipe the old content.
  4. **None of these settles it.** For example, the target doesn't look like a
     handoff doc, the user's own words point a different way, or it's unclear
     whether the doc is this session's work. Ask with `AskUserQuestion`, with
     options **Overwrite**, **Append** and **Sequel**.

  If the user explicitly says overwrite, append or sequel, do that. A plain
  "update the handoff" does not override rules 1–3.
  Always name the choice in the final report (e.g. "Wrote a sequel at … (prior
  doc from an earlier session)") so the user can redirect.

### 3. Distill the session into the doc

Read back over what happened this session and pull out what the next session
actually needs. Default audience is **a future Claude session**, and default
scope is **as-built state plus open follow-ups** — these fit most cases, so just
proceed with them unless the conversation makes the audience or scope genuinely
ambiguous (then ask).

Use this skeleton as a **starting point**, not a cage. Keep the sections that
carry weight for this session; drop ones that don't apply; add one if the work
needs it. A small infra change won't need a "Git state" section; a big refactor
might need an "Architecture decisions" one.

```markdown
# Handoff: <subject> (<date>)

Audience: <who this is for>. <If a sequel: one line pointing to the prior doc.>

## What happened this session
<The work done, in the order it matters. Decisions made and why.>

## Where things live / what landed
<Files created/changed, key paths, where the important code is.>

## Verification done
<What was tested/checked and the result — and honestly, what was NOT verified.>

## Git state
<Branch, commit hash, pushed or not, how to ship.>

## Open follow-ups
<Numbered. What's left, including anything offered-but-not-confirmed. Carry
forward still-open items from a prior handoff.>
```

### 4. Keep it concise and honest

- **Concise by default.** Favor short sections and tight bullets over prose. The
  reader wants orientation fast, then the details when they dig in.
- **Be honest about gaps.** If something wasn't tested, say so. A handoff that
  hides an untested area sets the next session up to trust something it
  shouldn't.
- **Make paths and commands copy-pasteable.** The next session will act on them.
- **Convert relative time to absolute.** "Yesterday" is meaningless to a session
  that runs next week — write the date.
- **Link sequels.** If this continues a prior handoff, name it and point to it so
  the chain is followable.

## When to ask vs. just write

This skill leans autonomous — the user's whole ask is "give a path, get a doc,"
so don't interrogate them. Reserve `AskUserQuestion` for the cases where a wrong
guess is costly:

- An existing file at the target that the rules in step 2 don't settle
  (overwrite / append / sequel). Otherwise decide and say which you chose.
- A new filename whose date or sequence looks like a typo (offer the fix).
- Genuinely ambiguous audience or scope that the conversation doesn't settle.

Everything else — section choices, what to include, phrasing — is yours to
decide from the session. Write the doc, then tell the user where it landed and
give a one-line summary of what it covers.
