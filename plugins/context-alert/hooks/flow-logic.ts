// Pure helpers for the /handoff-compact flow (proposal 05/06). No `$` calls here.
import { dirWithSlash, formatTokens, isBusyStatus, NO_PATH_AUTO_FOCUS, shortPath } from './logic'

export type HandoffCompactArgs = { now: boolean; path?: string }

function stripQuotes(s: string): string {
  const first = s[0]
  return s.length >= 2 && (first === '"' || first === "'") && s.endsWith(first) ? s.slice(1, -1).trim() : s
}

/**
 * `[now] [path]`. `now` is a keyword only as the first whitespace-separated token (case-insensitive).
 * Everything after it, trimmed, is the path (spaces allowed, one pair of surrounding quotes stripped).
 * So `now` anywhere else is part of the path: `docs/now` and `path now` are both paths.
 */
export function parseHandoffCompactArgs(args: string): HandoffCompactArgs {
  let rest = args.trim()
  let now = false
  const m = /^now(?:\s+|$)/i.exec(rest)
  if (m) {
    now = true
    rest = rest.slice(m[0].length).trim()
  }
  const path = stripQuotes(rest)
  return path ? { now, path } : { now }
}

export type ListedAgent = { id: string; status: unknown; parentId?: string; kind?: string; teammateId?: string }

/**
 * Ids of top-level agents that are pending, running or waiting. A nested agent is its parent's to wait for, and a
 * teammate (`in_process_teammate`, or a `teammateId`) can sit busy for the life of a team, so neither is waited on.
 */
export function busyAgentIds(agents: readonly ListedAgent[]): string[] {
  return agents
    .filter(a => a.parentId === undefined && a.kind !== 'in_process_teammate' && a.teammateId === undefined)
    .filter(a => isBusyStatus(a.status))
    .map(a => a.id)
}

/** `a` then the ids of `b` not in it. */
export function unionIds(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])]
}

export type TurnOrigin = { kind: string; name?: string }

/**
 * Whether a main turn counts toward the writing phase's give-up cap (D21). Turns that answer the person or this
 * mod's own handoff prompt count; deliveries that start a turn of their own (an agent's report, another plugin's
 * prompt, a scheduled trigger, a peer or channel message) do not, as they are not Claude declining to write.
 * `undefined` is a turn whose prompt this mod did not see: its own (its hooks skip its own calls) or a mid-turn queue.
 */
export function countsTowardWritingCap(origin: TurnOrigin | undefined, ownName: string): boolean {
  if (!origin) return true
  if (origin.kind === 'plugin') return origin.name === ownName
  return ['composer', 'bridge', 'sdk', 'auto-continuation', 'unclassified', 'slack-ping'].includes(origin.kind)
}

/** Ids in `before` that are gone from `now` (finished). Order of `before` kept, no duplicates. */
export function diffBusy(before: readonly string[], now: readonly string[]): string[] {
  const still = new Set(now)
  return [...new Set(before)].filter(id => !still.has(id))
}

/**
 * Compaction focus instructions (D26). `running` (labels of top-level agents still busy when the flow went ahead
 * without them, S2) adds a line saying their reports arrive after the compaction.
 */
export function focusInstructions(path: string | undefined, running: readonly string[] = []): string {
  const base = path
    ? `A handoff doc for this session is at ${path}. Keep that path and its Open follow-ups in the summary.`
    : 'A handoff doc was written for this session. Keep its path and its Open follow-ups in the summary.'
  return running.length > 0
    ? `${base} Agents still running: ${running.join(', ')}. Their reports arrive after the compaction.`
    : base
}

/** Claude Code's own auto-compaction (S4): the known doc, or "keep the work in progress". */
export function autoCompactFocus(path: string | undefined): string {
  return path ? focusInstructions(path) : NO_PATH_AUTO_FOCUS
}

// The two skill ids are named in full so Claude resolves the project's copy first, then the bundled one.
export const SKILLS = 'the skill `handoff-doc` if this project has one, otherwise the bundled skill `context-alert:handoff-doc`'

/**
 * The auto flow's handoff prompt (S5): never asks. With a path, the known-path wording plus a no-question line;
 * without, Claude picks the path from the project's handoff folder and pattern, else `dir` (or ./handoff/).
 */
export function autoHandoffPrompt(path: string | undefined, dir?: string): string {
  if (path) {
    return (
      `Context is getting heavy, so please write the handoff doc for this session, using ${path} ` +
      `(the existing doc there or the next one in its series), with ${SKILLS}. ` +
      'Do not ask me anything; if it is unclear whether to update that doc or write a sequel, write a sequel. Say which file you wrote.'
    )
  }
  return (
    `Context is getting heavy, so write the handoff doc for this session now with ${SKILLS}. ` +
    'Do not ask me anything: pick the path yourself. Use this project\'s handoff folder and its naming pattern if it has one ' +
    `(a "Latest handoff" line in CLAUDE.md names it), otherwise create ${dirWithSlash(dir)}YYYYMMDD_01_<short-slug>.md. ` +
    'If the existing doc rules leave it unclear, write a sequel. Say which file you wrote.'
  )
}

/** S4, after Claude Code's own auto-compaction with no handoff since the last one: write one, then carry on. */
export function afterAutoHandoffPrompt(path: string | undefined, dir?: string): string {
  return `${autoHandoffPrompt(path, dir)} Then continue the work in progress. If nothing is left, or the next step needs the user, say so and stop.`
}

/** Auto mode toasts (S1). */
export function autoStartToast(percent: number, tokens: number): string {
  return `Context at ${percent}% (${formatTokens(tokens)}). Auto handoff-compact: writing the handoff doc. Type anything to cancel.`
}
export function autoMidTurnToast(percent: number, tokens: number): string {
  return `Context at ${percent}% (${formatTokens(tokens)}). Auto handoff-compact runs when this turn ends.`
}
export const autoCancelledToast = (next: string, writing = false): string =>
  `Auto handoff-compact cancelled; the next alert is at ${next}.${writing ? ' The handoff doc may still be written.' : ''}`

/**
 * The args of the auto flow's `/handoff-doc <path>` call (S5): the path (quoted when it has spaces) and a directive that
 * the skill must not ask. The skill takes an explicit "sequel" as the person's own instruction, so unclear cases resolve.
 */
export function autoHandoffArgs(path: string): string {
  const p = /\s/.test(path) ? `"${path}"` : path
  return `${p} Do not ask me anything and do not use AskUserQuestion: decide update or sequel yourself; if it is unclear, write a sequel. Say which file you wrote.`
}

/** The end-of-cycle notification: where the doc went, and agents that were left running. */
export function autoDoneNotification(path: string | undefined, left: number): string {
  const doc = path ? `Handoff written to ${shortPath(path)}, context compacted.` : 'Handoff written, context compacted.'
  return left > 0 ? `${doc} ${left} ${left === 1 ? 'agent' : 'agents'} still running.` : doc
}
export const AUTO_DONE_TITLE = 'Auto handoff-compact done'

export const afterAutoNotification = (kind: 'handoff' | 'continue'): string =>
  kind === 'handoff'
    ? 'Claude Code compacted the context. Writing a handoff doc, then carrying on.'
    : 'Claude Code compacted the context. Carrying on from the handoff doc.'

/** Why a flow went ahead, for the one log line per cycle. */
export function whyLabel(why: 'no-agents' | 'room' | 'maxWait' | 'force', waited: boolean): string {
  if (why === 'no-agents') return waited ? 'all done' : 'no agents'
  if (why === 'room') return 'room'
  if (why === 'maxWait') return 'maxWait'
  return 'now'
}

/** The after-compaction prompt for S4 (when Claude Code compacted by itself). */
export function afterAutoPrompt(kind: 'handoff' | 'continue', path: string | undefined, dir?: string): string {
  return kind === 'handoff' ? afterAutoHandoffPrompt(path, dir) : continuePrompt(path)
}

/** The nudge sent once a handoff flow's compaction landed with no agent still running. */
export function continuePrompt(path: string | undefined): string {
  const doc = path ? `the handoff doc at ${path}` : 'the handoff doc'
  return `Continue the work in progress from ${doc}. If nothing is left, or the next step needs the user, say so and stop.`
}

/**
 * Whether the compaction that landed is the one the flow asked for. With `instructions` they must equal the focus
 * text the flow sent (a typed `/compact <text>` or another plugin's compaction differs). Without them, a manual
 * trigger counts (whether the command path hands `/compact`'s args over as instructions is not verified live),
 * and an auto, plugin or precompute trigger never does.
 * Known hole: a bare typed `/compact` after the flow's queued compaction was silently dropped would nudge.
 */
export function nudgeMatches(
  stored: string, instructions: string | undefined, trigger: string | undefined,
): { send: boolean; note: string } {
  if (instructions !== undefined) {
    return instructions === stored
      ? { send: true, note: 'instructions match' }
      : { send: false, note: 'instructions differ: another compaction' }
  }
  return { send: trigger === 'manual', note: `instructions missing, trigger ${trigger ?? 'unknown'}` }
}

/** `Waiting for N agent(s) before compacting`, plus the other-background-tasks note when any are known. */
export function waitToast(count: number, otherTasks = 0): string {
  const base = `Waiting for ${count} ${count === 1 ? 'agent' : 'agents'} before compacting`
  return otherTasks > 0 ? `${base} (${otherTasks} other background ${otherTasks === 1 ? 'task' : 'tasks'} not waited on)` : base
}

export type FinishedAgent = string | { id: string; label?: string }

/** The follow-up prompt that folds finished agents' results into the handoff doc in place (D20). */
export function foldPrompt(finished: readonly FinishedAgent[], path?: string): string {
  const names = finished.map(a => (typeof a === 'string' ? a : a.label ? `${a.label} (${a.id})` : a.id))
  const who = names.length === 0 ? 'the agents that just finished' : names.join(', ')
  const doc = path ? `\`${path}\`` : 'the handoff doc'
  return (
    `Fold the result from ${who} into ${doc}. Edit the existing sections in place. ` +
    'Do not ask overwrite / append / sequel. Do not start any new work and do not compact; ' +
    'the compaction happens automatically once the doc is updated.'
  )
}

// User-facing strings (wording from proposal 05).
export const HANDOFF_COMPACTING_TOAST = 'Handoff written, compacting.'
export const CANCELLED_TOAST = 'Compaction cancelled; run /handoff-compact again when ready.'
export const TURN_NOT_FINISHED_TOAST = 'Handoff turn did not finish, so no compaction. Run /compact when ready.'
export const NO_DOC_WRITTEN_TOAST = 'No handoff doc was written, so no compaction. Run /compact when ready.'
/** Not worded in 05; added for the `now` upgrade (D24). */
export const NOW_UPGRADE_TOAST = 'Skipping the agent wait; compacting as soon as the handoff doc is written.'
/** Not worded in 05; sent only when the flow waited for agents and `notify` is on. */
export const WAITED_NOTIFICATION = 'Handoff written and context compacted.'
export const WAITED_NOTIFICATION_TITLE = 'Handoff-compact done'

/** A re-trigger while a compaction this mod asked for is still queued. */
export const ALREADY_COMPACTING_TOAST = 'Handoff-compact: a compaction is already queued.'

/** A path given to a re-trigger that the running flow cannot take (it already has one, or is past writing). */
export function pathIgnored(toast: string, path: string | undefined): string {
  return path ? `${toast} (path ${path} ignored)` : toast
}

/** Re-trigger toast. `waiting` is the live agent count while in the waiting phase. */
export function alreadyRunningToast(waiting?: number): string {
  return waiting && waiting > 0
    ? `Handoff-compact already in progress (waiting for ${waiting} ${waiting === 1 ? 'agent' : 'agents'})`
    : 'Handoff-compact already in progress'
}
