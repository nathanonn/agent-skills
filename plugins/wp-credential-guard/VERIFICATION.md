# wp-credential-guard — live verification checklist

Five checks, run by hand, in one sitting, in order. The test suite covers the hooks; what it
cannot cover is a real engine deciding whether a refused prompt reaches disk, whether a toast
fires, and whether the model reads a mask. Read `README.md` first — it says what the plugin
covers and what it does not. This page tells you how to confirm that on your own machine.

---

## ⛔ DUMMY CREDENTIALS ONLY — READ BEFORE YOU TYPE ANYTHING

**Do not type, paste, or autocomplete a real WordPress username or a real Application Password
into any of these checks.**

Check 1 deliberately pushes a credential into the path that refuses it, and check 2 pushes one
into the path that is *supposed* to mask it. Neither is a reason to reach for a real password: a
typo, a stripped slash, or an engine build that behaves differently from the one these checks
were written against turns any of them into a real credential burned — and the value sits in your
terminal scrollback either way. Use these three values, and nothing else:

| Role | Value |
| --- | --- |
| Username | `wobblegoose` |
| Password A — check 1 | `ZZZZ YYYY XXXX WWWW VVVV UUUU` |
| Password B — checks 2, 3, 4 | `QQQQ RRRR SSSS TTTT PPPP NNNN` |

Two passwords, not one, because check 2 has to prove that a plain message stores the *mask* —
and it cannot prove that if check 1 already wrote the same string into the same file.

If a real credential goes in by accident: stop, revoke it in **WP Admin → Users → Profile →
Application Passwords**, and start over.

---

## Before the first keystroke

Installed from the marketplace, an ordinary session already has the plugin loaded. From a
checkout, start one with `claude --plugin-dir /path/to/wp-credential-guard`.

- **The vault dies with the session.** It is module-level memory: placeholders minted in one
  session mean nothing in the next, and `/clear` does not reset them but a reload does. Run all
  five checks in one sitting, in order.
- **`$.ui.log` lines are dim and are not sent to the model.** They are recorded in the debug log,
  so a line that scrolled past can be recovered with
  `grep -r wp-credential-guard ~/.claude/debug/ | tail`.
- **Count, do not print.** Several checks grep the transcript for a dummy password. Anything that
  echoes the value back — a `grep` with context, a `sed -n Np` of the matching line — is itself
  written to the transcript as a tool result and shows up as a hit on the next run. Use `grep -c`.
  A run that prints looks exactly like a leak.

## Check 1 — the slash-command path is refused

Nothing here checks that a slash command gets *masked*, because it cannot be. A typed
`/name args` carries its text to the model twice — the expansion `skill.prompt` masks, and a
`<command-args>` envelope beside it that no hook can rewrite — so one half arrives masked and the
other in the clear, in one message. The plugin therefore refuses the prompt. (`skill.prompt`
stays: it still covers the Skill-tool and preload paths, which have no submission to refuse.)

**Any command that takes arguments will do** — substitute one you have for `/your-command`.

**Type, using password A and no other:**

```
/your-command username: wobblegoose app password: ZZZZ YYYY XXXX WWWW VVVV UUUU
```

**A pass looks like all five of these:**

1. **The command does not run and the model never answers.** This is the whole check. If it
   executes, the engine ignored `{ drop }` on this path and the plugin is back to masking a
   message it cannot fully mask.
2. The refusal text replaces the prompt, beginning `wp-credential-guard: REFUSED — a WordPress
   credential was typed as a slash-command argument.` It says the command did not run and the
   model never read the value, leaves the on-disk question open and tied to the engine build,
   names terminal scrollback as where the value still is, and ends with the way back in via a
   placeholder. It must **not** claim nothing was stored: that claim was removed deliberately,
   and a build printing it has regressed to asserting what was only ever measured once.
3. Two dim lines: `wp-credential-guard: masked 1 username and 1 password (session-only)` and
   `wp-credential-guard: SLASH COMMAND — … refused rather than masked.`
4. A **toast**, about 20 seconds, where the engine's "context left" notice appears:
   `wp-credential-guard: prompt refused — paste the credential as a plain message`.
5. A **pinned status line** under the prompt:
   `wp-credential-guard: slash-command credential refused — treat it as exposed`.

A missing toast or status line is a real failure — `$.ui.notice` is unreachable from
`prompt.submit` (it needs an open tool dialog's id), so these two are the only loud surfaces this
event has.

**Then confirm nothing was written.** This has to come back empty:

```
grep -c 'ZZZZ YYYY' "$(ls -t ~/.claude/projects/*/*.jsonl | head -1)"
```

**A pass is 0**, and 0 is what was measured — once, on one engine build, where a refused
submission left no `user` record and no `last-prompt` record. The engine's own type definitions
describe `prompt.submit` as firing *after* the input became a user message, so a count above 0 is
a defensible outcome on your build rather than proof of a broken plugin — which is why neither the
refusal text nor the status line claims otherwise. If you get one, the refusal still keeps the
value out of the model; what it does not buy you is a clean transcript, so revoke the credential.

**Then check the way back in.** Paste the same credential as an ordinary message to mint its
placeholders, then send `/your-command [WP-USER-xxxx] [WP-PASS-xxxx]`. This must **not** be
refused — placeholder spans are reserved and nothing is minted from inside them, so a slash
command carrying only placeholders looks clean to the hook. If it is refused, the refusal has no
escape hatch and the slash path is unusable rather than guarded.

## Check 2 — the plain-message path (the one that must actually work)

**Type, as an ordinary message — no leading slash:**

```
username: wobblegoose app password: QQQQ RRRR SSSS TTTT PPPP NNNN
```

**A pass looks like:**

1. `wp-credential-guard: masked 1 username and 1 password (session-only)`
2. A hedging line beginning `wp-credential-guard: if that was a slash command …`
3. **No toast and no pinned status line.** The loud surfaces are for the refused path only; if
   they fire here, `looksLikeSlash` is over-triggering and every ordinary paste will cry wolf.
4. The message row on screen shows `[WP-USER-xxxx]` and `[WP-PASS-xxxx]`, not the values.
5. The model reads the mask. Ask it *"What password did I just give you?"* — it must answer with
   the placeholder and say it cannot read the value behind it.
6. The transcript stored the mask:

   ```
   grep -c 'QQQQ RRRR' "$(ls -t ~/.claude/projects/*/*.jsonl | head -1)"
   ```

   **A pass is 0.** Anything above 0 here is the bug the plugin exists to prevent, and the most
   serious failure on this page.

Write down the two placeholders. Checks 3 and 4 need them.

## Check 3 — a bare username after a labelled one (the sweep)

Check 2 pinned `wobblegoose` with a `username:` label — a **structural** form, which is the only
kind the sweep remembers. After that, every bare mention of the name in the same session is a
credential too.

**Type:** `log in as wobblegoose and list the drafts`

**A pass looks like:**

1. `wp-credential-guard: masked 1 username (session-only)` — username only, no password.
2. The row on screen shows **the same** `[WP-USER-xxxx]` placeholder as check 2, not a new one.

**A fail** is no log line at all, or `wobblegoose` still readable in the row.

A sweep that is too eager is its own bug, so send two more lines. First
`the wobblegoose_dev branch is stale` — nothing should be masked, because a pinned name inside a
longer word is one word, not a mention.

Then send `the user: quicksand who edits posts`, and follow it with
`the quicksand layer is unstable`. The word is masked in the first line, where a label and a
separator sit right beside it. It must be **readable in the second**. Masking and remembering are
separate decisions, and the determiner in front of the label is what marks the first line as prose
about users rather than a credential. If the word is masked in the second line too, the sweep is
being taught ordinary vocabulary, and from then on every mention of it is rewritten and any slash
command carrying it is refused.

Note what this check does **not** claim. A bare `login: quicksand` with no determiner *does* pin,
and should — that is exactly how a credential is written, and nothing distinguishes the two. The
gates are the stop list, the determiner test, a four-character floor, and the `GENERIC_USER` set.
A distinctive word in a credential-shaped line will still be remembered.

## Check 4 — a Bash round trip through a placeholder

Using the `[WP-PASS-xxxx]` from check 2, **ask the model:**

> Run exactly this, with the placeholder typed verbatim:
> `printf '%s' "[WP-PASS-xxxx]" | wc -c`

**A pass looks like:**

1. The command the model proposes still contains `[WP-PASS-xxxx]` — the model never held the
   value and cannot have substituted it itself.
2. The output is **29**. That is `QQQQ RRRR SSSS TTTT PPPP NNNN`: twenty-four characters and five
   spaces. A shorter count means the substitution lost the spaces or the quoting; 15 in particular
   means only the first group survived.

Then ask it to run `printf '%s' [WP-USER-xxxx]` — unquoted this time, to exercise the
bare-context quoting path. It must print `wobblegoose`.

## Check 5 — the deny path for an unknown placeholder

Pick four hex digits that do **not** appear in any placeholder on screen — this example uses
`beef`, so check first that no `[WP-PASS-beef]` was minted.

**Ask the model:** *Run: `printf '%s' [WP-PASS-beef]`*

**A pass looks like:**

1. The Bash call is **denied before it runs** — no command output at all.
2. The denial names `[WP-PASS-beef]` and says the vault is `session-scoped`.
3. The denial names no real credential and no other placeholder. Nothing the model reads may
   contain a value.
4. The model's follow-up asks you to paste the credential again in this session, rather than
   inventing a value or retrying with the literal text.

Expect this to bite once you go back to ordinary work: any Bash command that happens to contain a
placeholder-shaped string the vault does not hold is denied, including one that only quotes this
page. That is the check passing, not a bug — but it is worth recognising when it happens to a
command you did not expect it to.

## What this checklist cannot settle

Stated plainly, so nobody reads a clean run as more than it is. The README covers what the plugin
does not protect in general; this is narrower — what five green checks do and do not prove.

- **Whether a stored JSONL copy can ever be *rewritten*. It cannot.** No hook in the event set
  reaches a message the engine has already persisted. Refusing works because it stops the record
  being written at all, not because it edits one. A clean grep in check 1 is evidence about your
  build's ordering, not about a repair the plugin performs.
- **Whether refusal keeps the record off disk on every build.** Measured once, on one engine
  build; the engine's own types read like the opposite. Check 1's grep is the only thing that
  settles it for your build, and is worth re-running after an engine upgrade.
- **Whether a real WordPress accepts an expanded credential.** Nothing here touches a live site,
  on purpose. The round trip proves byte fidelity through bash, not that `curl` authenticates.
- **Whether the redaction rules hold against password shapes outside the test corpus.** The suite
  in `tests/hooks.test.mjs` is the corpus — run it for the current count. A live session adds one
  data point; it does not widen coverage. False positives are likewise unmeasured here: a rule
  that masks ordinary prose shows up as a mangled prompt weeks later, not in five checks.
- **Whether `{ drop }` is honoured on every host.** Check 1 observes one terminal. `--print`, the
  SDK host and a `/resume`d session each queue prompts differently, and none was tested.
- **Whether other engine paths carry the raw text onward**: subagent preload, compaction,
  `/resume`, session export. Each would need its own event, and none was investigated.
- **Whether another plugin loaded alongside this one rewrites the text after it.** Hook ordering
  across plugins is untested; run these checks with this plugin alone.
- **Whether the Skill-tool and preload paths into `skill.prompt` carry a credential the way a
  typed `/name` does.** Only the typed path is exercised above. Those two have no composer
  submission behind them, so there is nothing to refuse and the `skill.prompt` rewrite is the only
  cover they have — untested.
- **Whether a refused slash command had a legitimate reason to carry that text.** A false positive
  costs the whole submission rather than a mangled argument. The `NOT_A_VALUE` stop list is what
  stands between ordinary prose and a refused prompt, and its false-positive rate over a long
  working session is unmeasured.

## After the run

Record the outcome where you will find it after your next engine upgrade — a note in your own
project, or an issue on the repository if a check failed. Check 1's grep count is the number that
matters, because it is the one that varies by build. Nothing needs revoking, because nothing real
was typed; confirm that by reading back the dummy table above, not by printing anything the greps
found.
