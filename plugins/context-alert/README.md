# Context Alert

A Claude Code mod that notices when your context window is getting heavy and offers to write a handoff doc before compaction, or, in auto mode, writes the handoff, compacts and carries on by itself.

Version 0.3.0 · Works with: Claude Code plugin (marketplace install only)

**Beta.** The core flow is verified live.

After every main-thread turn, Claude Code reports how full the context is. When the fill reaches **40% of the window** (the default), Context Alert opens a question dialog. You can switch to a token limit, or use both (see Trigger modes below):

```
The context window is now at 40% (80k of 200k tokens).
Write a handoff doc before compaction?

  1. Handoff, then compact
  2. Handoff only
  3. Compact now
  4. Not now
  5. Other...
```

The dialog never opens in the middle of a turn. If the fill crosses a threshold while Claude is working, the alert is held and asked when the turn ends. It is designed not to stop or delay background agents.

## The options

| Option | What happens |
|---|---|
| Handoff, then compact | Runs the same flow as `/handoff-compact` (see below): the handoff chain, a wait for busy agents, then compaction. Alert dialogs are held while it runs. An interrupted turn, or 3 turns with no write, cancels the compaction with a toast |
| Handoff only | Runs the handoff chain below and leaves the context alone, for when you'd rather `/clear` and start fresh from the doc |
| Compact now | Queues `/compact`, which runs once the session is idle. If that is refused it tries the compaction call directly, and if that fails too it shows "Compaction couldn't start; run /compact" |
| Not now | Nothing. The next alert steps up one tier (+15 points by default; +150k tokens in tokens mode; whichever comes first in either mode) |
| Other... | Your text is sent to Claude as an instruction |

| Esc | Same as Not now |

If a handoff was already written in this session, the two handoff options read "Update handoff…", the question names the file, and that path is passed on.

## Alerts and notifications

- **Tiers.** After the first alert it asks again every +15 percentage points by default (+150k tokens in tokens mode; whichever comes first in either mode) above the fill recorded at the last alert (for example, an alert at 41% is followed by one at 56%). That fill is recorded when the dialog opens, so the step-up applies after any answer until a compaction resets it. A tier counts as used only once the dialog actually opens (or the suggestion is shown); a held or refused alert is retried at the next idle point. **Any compaction** (`/compact`, auto-compact, or one of the options above) starts the tiers over at the first threshold, whatever the fill after it. A `/clear` does too, once the fill drops below the first threshold. The step-up only applies while you keep going without compacting.
- **One dialog at a time.** While a dialog is open, a new tier does not open a second one.
- **Notification.** On by default. When the dialog opens (or the suggestion is raised), a desktop or phone notification is sent too. Headless runs (`-p`) send none. Turn it off with `/context-alert set notify false`.
- **Mid-turn toast.** On by default. If a long turn crosses a threshold, one toast per tier says so. The dialog still waits for the turn to end. In auto mode the toast says the auto handoff-compact runs when the turn ends. It stays silent while paused.
- **Sub-agents.** Their turns never trigger an alert.
- **Main session only.** The plugin acts for the main agent alone. No sub-agent event (turn, tool call, compaction, Stop, or a handoff-doc Skill call) raises an alert or toast, records a handoff path, resets the tiers, or moves the "Handoff, then compact" flow. Running sub-agents only count as busy for `whenBusy`.

## When agents are running (`whenBusy`)

| Value | Behaviour |
|---|---|
| `dialog` (default) | Always open the dialog |
| `suggest` | While background work is running, show a toast, send the notification, and offer a dim prompt suggestion (Tab to accept) instead of the dialog. With nothing running, the dialog opens as usual. If the suggestion cannot show (a draft is in the box), the tier stays unused and it is tried again at the next idle point |

"Background work" means any agent that is pending, running or waiting, plus anything listed in the `background_tasks` of the last turn-end (Stop) event: background shells, monitors and workflows.

## The handoff chain

What "Write handoff doc" does depends on whether a handoff path is already known for the session.

**Path known** (the option reads "Update handoff (.../file.md)"). Three steps in order:

1. The project's own `handoff-doc` skill, with that path.
2. The bundled `context-alert:handoff-doc` skill that ships with this plugin, with that path.
3. A prompt asking Claude to write this session's handoff using that path (the existing doc there or the next one in its series).

**No path known** ("Write handoff doc"). The plugin sends a prompt that names both skills, `handoff-doc` (the project's, if it has one) and `context-alert:handoff-doc` (the bundled one). Claude picks the skill, asks you for the destination with a question dialog, and recommends one based on the project's handoff folder and naming pattern if it has one.

The plugin learns the path from `/handoff-doc <path>` typed by you, from handoff-doc Skill calls Claude makes, and from any Write or Edit of a `.md` file inside a `handoff/` folder (the latest wins, so a sequel file replaces the earlier path).

On a fresh start of Claude Code with a resumed session, it also looks back through the transcript for the same three signals: handoff-doc Skill calls, writes into a `handoff/` folder, and a typed `/handoff-doc <path>` in your messages. That scan runs only at process start. An in-process `/resume` or `/clear` does not re-scan.

## The /handoff-compact command

```
/handoff-compact [now] [path]
```

Writes the handoff doc, then compacts. It works even when `mode` is `off`.

- **Path.** The argument if given, else the session's known handoff path, else Claude asks you and recommends one (see The handoff chain).
- **Compaction.** Runs with focus instructions that name the doc, so the summary keeps its path and open follow-ups.
- **Agents.** Before compacting it waits for busy agents (pending, running or waiting). The toast reads `Waiting for N agents before compacting`. Shells, monitors and workflows are not waited on. The wait ends early when fewer than `reserve` tokens are left before Claude Code's own auto-compaction (see Auto mode).
- **Finished agents.** An agent that ends during the wait gets a follow-up prompt that folds its result into the doc in place. Then compaction runs.
- **`now`.** Skips the wait. The doc is still written first.
- **Running it twice.** While a flow is in progress, a second `/handoff-compact` toasts "already in progress". `now` upgrades the running flow to skip the wait.
- **Dialog.** The dialog's "Handoff, then compact" uses the same flow. Alert dialogs are held while a flow is in progress.
- **Notification.** Sent after compaction only if the flow waited for agents and `notify` is on.

After the compaction lands, the mod sends one prompt so the session carries on instead of sitting idle: `Continue the work in progress from the handoff doc at <path>. If nothing is left, or the next step needs the user, say so and stop.` It is on by default. Turn it off with `/context-alert set continue off`.

No prompt is sent when:

- `continue` is off.
- The session is headless.
- An agent is still busy when the compaction lands. Its report wakes the session.
- The agent list can't be read.
- The compaction was a plain "Compact now", a typed `/compact`, or an auto-compaction. (After an auto-compaction, auto mode sends its own prompt: see Claude Code's own auto-compaction.)

Background shells do not block the prompt.

Ways out:

| What happens | Result |
|---|---|
| You type a message, or send one from Remote Control, during the wait | Cancelled, with a toast |
| Agent reports, the mod's own prompts, slash commands | The wait goes on |
| Esc during the handoff turn | No compaction |
| 3 main turns with no `.md` written | Gives up (writing phase only) |
| Agents never finish | It waits. There is no timeout for manual and dialog flows (auto flows have `maxWait`), except that it stops waiting when `reserve` is reached. Send a message to cancel, or run `/handoff-compact now` |

## Auto mode

```
/context-alert set mode auto
```

Set the threshold once and the session hands off, compacts and carries on by itself, cycle after cycle. The tiers, trigger modes and re-arming are the same as in ask mode. What changes is what a crossing does:

1. **At the next idle point** (never mid-turn; a long turn shows the toast `Context at X% (Yk). Auto handoff-compact runs when this turn ends.`) the mod toasts `Context at X% (Yk). Auto handoff-compact: writing the handoff doc. Type anything to cancel.` and starts the same flow as `/handoff-compact`.
2. **Write.** The doc is written without any question (see No questions below).
3. **Wait or go.** Busy agents are waited for and folded in, as in the manual flow, unless one of the limits below says go.
4. **Compact** with focus instructions, and a notification `Handoff written to <path>, context compacted.` (plus `N agents still running` when it went ahead without them). With `notify` off there is no notification.
5. **Continue.** The usual continue prompt follows (`continue` setting), the tiers reset, and the next crossing starts the next cycle.

Each cycle writes one line to the debug log: the path, whether it waited, how many agents were left running, and why it went (`no agents`, `all done`, `room`, `maxWait`).

Auto mode never runs in a non-interactive run (`-p`, SDK).

### Cancel

Your own typed message (or one from Remote Control) cancels an auto flow in the **writing or the waiting** phase, with the toast `Auto handoff-compact cancelled; the next alert is at …`. The tier stays used, so the next alert is the next tier. Cancelling while the doc is being written stops the compaction only: the handoff prompt is already queued, so the doc may still be written (the toast says so). Slash commands, agent reports and the mod's own prompts never cancel. Manual and dialog flows still cancel only while waiting.

### Wait or go

When the doc is written and a top-level agent is still busy, the flow compacts anyway in two cases:

| Case | Applies to | Setting |
|---|---|---|
| Fewer than `reserve` tokens left before Claude Code's own auto-compaction (room = its threshold minus the fill now) | every handoff-compact flow | `reserve` (default `auto`: `min(80k, 15% of the threshold)`; `0` = no check) |
| The flow has waited `maxWait` minutes (a timer fires it) | auto flows only | `maxWait` (default 20, `0` = no limit) |

If Claude Code's auto-compaction is off, or the room cannot be read, the room check is skipped and the flow keeps waiting. When it goes ahead with agents running, the focus text adds `Agents still running: <labels>. Their reports arrive after the compaction.` and no continue prompt is sent (their reports wake the session). The timer is cancelled whenever the flow ends. A manual or dialog flow has no timer.

### No questions

In auto mode the handoff prompt never asks you anything:

- **Path known** (from a handoff written earlier this session): the same chain as above, with the skill deciding between updating that doc and writing a sequel; if that is unclear it writes a sequel.
- **No path known:** Claude is told to pick the path itself. It uses the project's handoff folder and naming pattern if it has one (a "Latest handoff" line in `CLAUDE.md` names it), otherwise it creates `<handoffDir or ./handoff/>YYYYMMDD_01_<short-slug>.md`, writes a sequel when the doc rules are unclear, and says which file it wrote.

The manual command and the dialog keep asking for a path when none is known.

### Claude Code's own auto-compaction

- **Focus (any mode, `focusAutoCompact`).** When Claude Code compacts by itself, the mod adds focus instructions, appended to any already there: the known doc path and its open follow-ups, or `Keep the work in progress, the decisions made and the open follow-ups in the summary.` when no doc is known. It never blocks an auto-compaction, since the same trigger covers "prompt too long". It also applies while paused.
- **Afterwards (auto mode, `afterAutoCompact`).** Once it lands, if no handoff doc was written since the previous compaction, the mod queues one prompt for the next idle point (now if idle, otherwise the end of the running turn): write the handoff doc for this session (no questions), then continue the work in progress. If a doc was written since, it queues only the continue prompt. This counts as an auto cycle. The queued prompt is dropped when you interrupt the turn, `/clear`, `pause`, switch `mode` away from `auto` or turn `afterAutoCompact` off, a handoff-compact flow is running at the turn end, or a newer compaction or a new turn started first. Whether it is a handoff or only a continue prompt is decided when it is sent, so a doc written later in the same turn turns it into a continue. A handoff written by that turn counts as the handoff wherever it is saved.

### Guardrails

| Guard | Rule |
|---|---|
| Cycle cap | At most `maxCycles` (3) auto cycles within `cycleWindow` (60 min). Past that, the crossing opens the ask-mode dialog instead, with the toast `Auto paused: N cycles in the last M min.` |
| Loop breaker | After an auto cycle's compaction lands, the mod reads the fill. If it is still past the first threshold, auto is held for this session until the fill drops below it (crossings meanwhile use the dialog), and you get `Compaction left context at X%; auto handoff paused.` The size comes from the compaction's own result (`tokensAfter`), else the breakdown's estimate. Only when neither is available does the first later measure decide, which also holds a turn's growth |
| Pause | `/context-alert pause` stops all alerts and auto cycles for this session and stops a running auto flow. `/context-alert resume` undoes it (and lets go of an auto hold). `/handoff-compact` works while paused. The focus rewrite of Claude Code's own auto-compaction keeps running while paused (`focusAutoCompact off` turns it off), and `status` says so |
| Headless | Never auto in `-p` / SDK runs |
| Status | `/context-alert status` shows the mode, the limits, a `Paused` line in every mode, `held`, cycles in the window, the live flow (writing, or waiting for N agents with `maxWait` and room left), and any compaction or prompt queued |

## The `/context-alert` command

```
/context-alert                      show settings, current fill, tiers asked, next alert
/context-alert status               same as above
/context-alert show                 same as above
/context-alert set <key> <value>    change a setting (takes effect at once)
/context-alert pause                no alerts and no auto cycles for this session
/context-alert resume               undo pause (and let go of an auto hold)
/context-alert reset                restore all settings to defaults
/context-alert reset session        clear this session's asked tiers, auto cycle count and auto hold so it can alert again (a pause stays)
```

Anything else after `reset` prints the usage text and changes nothing.

| Key | Default | Values |
|---|---|---|
| `mode` | `ask` | `auto` / `ask` / `off`. `ask`: the dialog above. `auto`: a threshold crossing starts the handoff-compact flow with no dialog (see Auto mode). `off`: no alert runs, including toast and notification; `/handoff-compact` still runs, since you start it yourself |
| `enabled` | n/a | The old name, kept as an alias: `set enabled on` is `mode ask`, `set enabled off` is `mode off`. A config saved by 0.2 with `enabled: false` reads as `mode off`, anything else as `mode ask` |
| `trigger` | `percent` | `percent` / `tokens` / `either`. Which limit counts (see Trigger modes) |
| `percent` | `40` | first alert at this percent of the window (above 0, up to 100; decimals such as 0.5 are accepted). Setting it switches the trigger to `percent` |
| `tokens` | `300000` | first alert at this many tokens (whole number). Setting it switches the trigger to `tokens` |
| `stepPercent` | `15` | later alerts every this many points (same range as `percent`) |
| `stepTokens` | `150000` | later alerts every this many tokens (whole number) |
| `notify` | `true` | `on` / `off` (or `true` / `false`) |
| `midTurnToast` | `true` | `on` / `off` (or `true` / `false`) |
| `continue` | `true` | `on` / `off` (or `true` / `false`). After a handoff flow's compaction, send one prompt to carry on from the doc (see The /handoff-compact command) |
| `whenBusy` | `dialog` | `dialog` / `suggest`. Ask mode only: auto mode ignores it, since its flow already waits for agents |
| `maxWait` | `20` | minutes (decimals allowed, e.g. `0.5`). Auto flows: the longest wait for busy agents before compacting anyway. `0` = no limit |
| `reserve` | `auto` | whole number of tokens, `0` (no check) or `auto`. All handoff-compact flows: stop waiting for agents when fewer than this many tokens are left before Claude Code's own auto-compaction. `auto` is `min(80000, 15% of that threshold)`, so a 200k window (threshold about 167k) uses about 25k and a 1M window uses 80k. A number you set is used as is. With auto-compaction off or unreadable there is no check |
| `maxCycles` | `3` | whole number. Auto cycles allowed per `cycleWindow` before auto falls back to the dialog. `0` = no cap |
| `cycleWindow` | `60` | minutes (decimals allowed, above 0). The window `maxCycles` counts over |
| `focusAutoCompact` | `true` | `on` / `off`. Any mode: Claude Code's own auto-compaction gets focus instructions |
| `afterAutoCompact` | `true` | `on` / `off`. Auto mode: after Claude Code's own auto-compaction with no handoff since the last compaction, write one, then carry on |
| `handoffDir` | unset | a folder path, or `none` to clear it. Auto mode with no known handoff path and no handoff folder Claude can find: where a new doc goes (otherwise `./handoff/`) |

### Trigger modes

The trigger decides which limit counts, for the first alert and for the later steps.

- `percent` (default): only `percent` and `stepPercent` count. Token counts are ignored.
- `tokens`: only `tokens` and `stepTokens` count. The percent fill is ignored.
- `either`: whichever limit is crossed first. This is the "40% or 300k tokens" behaviour, and it is useful on 1M windows, where 40% is 400k tokens and you want a 300k cap.

`/context-alert set percent 35` stores 35 and switches to `percent`. `/context-alert set tokens 250000` stores the number and switches to `tokens`. `/context-alert set trigger either` uses both limits. `set stepPercent` and `set stepTokens` never change the trigger. When a `set` changes the trigger, the reply says so.

**Upgrading from 0.1.0:** a saved config without a trigger reads as `percent`, so the token limit no longer counts. Run `/context-alert set trigger either` to keep the old "whichever first" behaviour with the 300k cap.

Every true/false setting also accepts `on` / `off`. Settings are kept across sessions. A bad key or value is refused with a message.

## Install

From the published marketplace, inside a Claude Code session:

```
/plugin marketplace add nathanonn/agent-skills
/plugin install context-alert@nathanonn-agent-skills
```

If the marketplace is already added, run `/plugin marketplace update nathanonn-agent-skills` first. Choose **user** scope when asked. Then run `/reload-plugins`. `/context-alert` prints the status.

Do not also start the session with `--plugin-dir` pointing at a copy of this plugin. It would load twice.

**Maintainer note.** `skills/handoff-doc/` is a verbatim copy of the handoff-doc plugin's skill (MIT, Nathan Onn). Keep it identical; `./sync-skills.sh --check` fails if the two copies differ. From the repo root:

```
diff -r plugins/context-alert/skills/handoff-doc plugins/handoff-doc/skills/handoff-doc
```

## Develop

From the repo root:

```
claude --plugin-dir ./plugins/context-alert
claude --debug --plugin-dir ./plugins/context-alert     # debug log includes the plugin's log lines
claude plugin validate plugins/context-alert
claude plugin test plugins/context-alert
```

## Known limits

- Background work that is not an agent (shells, monitors, workflows) is known only from the last turn-end (Stop) event. A shell started after that point is invisible until the next Stop, and a task that has since finished still counts as busy until then. Agents are read live. This only matters for `whenBusy suggest`.
- An agent that finishes during the `/handoff-compact` wait is noticed only at the next main turn end, not the moment it finishes.
- Claude Code's hook API defines no reason when it refuses a dialog, so a refusal is told from a dismissal by the message text; unknown reasons count as a dismissal.
- Session resume: the handoff path is recovered only at process start (see The handoff chain).
- Two sessions at once share one settings file; a change made in one reaches the other at its next turn end.
- Headless runs (`-p`) have no dialog, no notification, no continue prompt and no auto mode. The plugin stays silent (it still adds focus instructions to Claude Code's own auto-compaction).
- Auto mode cancels on your typed message while the doc is being written. If Claude Code attributes the skill's own prompt to your typing, that would cancel the cycle at once; this has not been seen live yet.
- The room check needs Claude Code's auto-compaction threshold. When auto-compaction is off, `reserve` has no effect.
- **Upgrading from 0.2.x:** manual and dialog flows now also stop waiting when the room before Claude Code's auto-compaction is short. The default `reserve` scales with the window (15% of the threshold, at most 80k), so 200k windows still wait for agents in normal use. Set `reserve 0` for the old behaviour of never stopping early.
- A config saved by 0.3 keeps an `enabled` flag beside `mode` so a downgrade to 0.2.x keeps alerts off when `mode` is `off`.
- Fill is unknown on a fresh or just-compacted session; the plugin skips until a response reports it.
- Sessions older than 30 days are dropped from stored state.
- No icon is included yet.
