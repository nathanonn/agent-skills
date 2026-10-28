# Context Alert

A Claude Code mod that notices when your context window is getting heavy and offers to write a handoff doc before compaction.

**Version 0.1.1, beta.** The core flow is verified live. Some behaviour is not yet verified live (see Known limits).

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

The dialog never opens in the middle of a turn. If the fill crosses a threshold while Claude is working, the alert is held and asked when the turn ends. It is designed not to stop or delay background agents; that is not confirmed until it has been checked live (see Known limits).

## The options

| Option | What happens |
|---|---|
| Handoff, then compact | Runs the handoff chain below, then compacts once the handoff turn ends with a `.md` written. It waits up to 3 turns (for example while Claude asks for the path). An interrupted turn, or 3 turns with no write, cancels the compaction with a toast |
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
- **Mid-turn toast.** On by default. If a long turn crosses a threshold, one toast per tier says so. The dialog still waits for the turn to end.
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
3. A prompt asking Claude to update the handoff at that path.

**No path known** ("Write handoff doc"). The plugin sends a prompt that names both skills, `handoff-doc` (the project's, if it has one) and `context-alert:handoff-doc` (the bundled one). Claude picks the skill, asks you for the destination with a question dialog, and recommends one based on the project's handoff folder and naming pattern if it has one.

The plugin learns the path from `/handoff-doc <path>` typed by you, from handoff-doc Skill calls Claude makes, and from any Write or Edit of a `.md` file inside a `handoff/` folder (the latest wins, so a sequel file replaces the earlier path).

On a fresh start of Claude Code with a resumed session, it also looks back through the transcript for the same three signals: handoff-doc Skill calls, writes into a `handoff/` folder, and a typed `/handoff-doc <path>` in your messages. That scan runs only at process start. An in-process `/resume` or `/clear` does not re-scan.

## The `/context-alert` command

```
/context-alert                      show settings, current fill, tiers asked, next alert
/context-alert status               same as above
/context-alert show                 same as above
/context-alert set <key> <value>    change a setting (takes effect at once)
/context-alert reset                restore all settings to defaults
/context-alert reset session        clear this session's asked tiers so it can alert again
```

Anything else after `reset` prints the usage text and changes nothing.

| Key | Default | Values |
|---|---|---|
| `enabled` | `true` | `true` / `false`. When false, nothing runs, including toast and notification |
| `trigger` | `percent` | `percent` / `tokens` / `either`. Which limit counts (see Trigger modes) |
| `percent` | `40` | first alert at this percent of the window (above 0, up to 100; decimals such as 0.5 are accepted). Setting it switches the trigger to `percent` |
| `tokens` | `300000` | first alert at this many tokens (whole number). Setting it switches the trigger to `tokens` |
| `stepPercent` | `15` | later alerts every this many points (same range as `percent`) |
| `stepTokens` | `150000` | later alerts every this many tokens (whole number) |
| `notify` | `true` | `true` / `false` |
| `midTurnToast` | `true` | `true` / `false` |
| `whenBusy` | `dialog` | `dialog` / `suggest` |

### Trigger modes

The trigger decides which limit counts, for the first alert and for the later steps.

- `percent` (default): only `percent` and `stepPercent` count. Token counts are ignored.
- `tokens`: only `tokens` and `stepTokens` count. The percent fill is ignored.
- `either`: whichever limit is crossed first. This is the "40% or 300k tokens" behaviour, and it is useful on 1M windows, where 40% is 400k tokens and you want a 300k cap.

`/context-alert set percent 35` stores 35 and switches to `percent`. `/context-alert set tokens 250000` stores the number and switches to `tokens`. `/context-alert set trigger either` uses both limits. `set stepPercent` and `set stepTokens` never change the trigger. When a `set` changes the trigger, the reply says so.

**Upgrading from 0.1.0:** a saved config without a trigger reads as `percent`, so the token limit no longer counts. Run `/context-alert set trigger either` to keep the old "whichever first" behaviour with the 300k cap.

Settings are kept across sessions. A bad key or value is refused with a message.

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

## Known limits and unverified behaviour

Not yet verified live:

- Whether the dialog disturbs background agents, and whether the follow-up waits for agents to finish. The "does not stop or delay background agents" design goal is unverified until then.
- Background work that is not an agent (shells, monitors, workflows) is known only from the last turn-end (Stop) event. A shell started after that point is invisible until the next Stop, and a task that has since finished still counts as busy until then. Agents are read live. This only matters for `whenBusy suggest`.
- Whether the host queues, replaces or refuses a second dialog while Claude's own question is open. Claude Code's hook API defines no rejection reason, so a refusal is told from a dismissal by the message text; unknown reasons count as a dismissal.
- Session resume: the handoff path is recovered only at process start (see The handoff chain). The typed `/handoff-doc` form in the transcript is matched by text and is unconfirmed.
- Two sessions at once share one settings file; a change made in one reaches the other at its next turn end. Concurrent writes are untested.
- Whether `$.command.run` can run a skill at all. If not, the chain falls to step 3, the prompt.
- What happens when the dialog fires while you are typing a draft, or while Claude's own question dialog is open.
- The exact input shape of the Skill tool, used to learn the handoff path. Each handoff-doc Skill call logs its raw shape to the debug log.
- Where the dialog appears on a phone or remote surface.
- Headless runs (`-p`) have no dialog and no notification. The plugin stays silent.
- Fill is unknown on a fresh or just-compacted session; the plugin skips until a response reports it.
- Sessions older than 30 days are dropped from stored state.
- No icon is included yet.
