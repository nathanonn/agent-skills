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
- **Sanity-check the filename against today's date.** If the date in the
  filename looks wrong (e.g. a year or month that doesn't match today, or it's
  out of order with its siblings), it's probably a typo. Surface it with
  `AskUserQuestion` and offer the corrected name — never silently rename.

### 2. Decide create vs. update

- If the target **doesn't exist** (or is an empty placeholder), create it.
- If the target **already exists with content**, don't assume. Use
  `AskUserQuestion` to ask how to proceed, with these options:
  - **Overwrite** in place (replace the contents).
  - **Append** a new dated section to the same file.
  - **Sequel** — write a new file at the next `_NN_` in the series, referencing
    the prior one.

  This is a genuine fork with no safe default — losing a handoff someone wanted
  kept is worse than asking one question.

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

- An existing file at the target (overwrite / append / sequel — always ask).
- A filename whose date or sequence looks like a typo (offer the fix).
- Genuinely ambiguous audience or scope that the conversation doesn't settle.

Everything else — section choices, what to include, phrasing — is yours to
decide from the session. Write the doc, then tell the user where it landed and
give a one-line summary of what it covers.
