// Pure helpers for the /handoff-compact flow (proposal 05/06). No `$` calls here.
import { isBusyStatus } from './logic'

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

/** Compaction focus instructions (D26). */
export function focusInstructions(path: string | undefined): string {
  return path
    ? `A handoff doc for this session is at ${path}. Keep that path and its Open follow-ups in the summary.`
    : 'A handoff doc was written for this session. Keep its path and its Open follow-ups in the summary.'
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
