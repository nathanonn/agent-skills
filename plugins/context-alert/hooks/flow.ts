// The handoff-compact flow (proposal 05/06): write the handoff doc, wait for busy agents (folding in each
// result), then compact with focus instructions. Started by `/handoff-compact` and by the dialog's
// "Handoff, then compact" option (D25). Main thread only; hooks.ts filters sub-agent events before calling in.
import type { EngineInterface } from 'claude-code'
import type { Runtime } from './alert'
import {
  ALREADY_COMPACTING_TOAST, alreadyRunningToast, busyAgentIds, CANCELLED_TOAST, continuePrompt, countsTowardWritingCap,
  diffBusy, focusInstructions, nudgeMatches, foldPrompt, HANDOFF_COMPACTING_TOAST, NO_DOC_WRITTEN_TOAST, NOW_UPGRADE_TOAST,
  parseHandoffCompactArgs, pathIgnored, TURN_NOT_FINISHED_TOAST, unionIds, WAITED_NOTIFICATION,
  WAITED_NOTIFICATION_TITLE, waitToast, type ListedAgent,
} from './flow-logic'
import { COMPACT_AFTER_MAX_TURNS, handoffPathFromWrite, resetTiers } from './logic'
import { loadConfig, loadSession, rememberHandoffPath, updateSession } from './state'

/** This plugin's name, as a prompt.submit origin names it. */
export const PLUGIN_NAME = 'context-alert'

export type Flow = {
  source: 'command' | 'dialog'
  phase: 'writing' | 'waiting'
  /** From the arg or the known handoff path; updated by .md writes. */
  path?: string
  /** The path came from a Write under handoff/: later writes (a sequel's back-link Edit) do not move it. */
  pathLocked: boolean
  /** Writing phase: a main-thread Write/Edit of a .md landed. */
  wrote: boolean
  /** Writing phase only: main turns ended with no .md write (cap COMPACT_AFTER_MAX_TURNS, D21). */
  turns: number
  /** `now`: skip the agent wait (D23, D24). */
  force: boolean
  /** Agents were waited on at some point (decides the notification, D26). */
  waited: boolean
  /** Agent ids busy at the last check (from the flow's start, while writing), to spot finishes. */
  busy: string[]
  /** A fold-in prompt is queued; its turn's turn.complete clears this and re-checks. */
  foldPending: boolean
  /** Agent id → its task description, captured while busy, so the fold-in prompt can name it. */
  labels: Record<string, string>
  /** The agent count last toasted: the wait toast shows only when the count changes. */
  shown: number
}

function log($: EngineInterface, text: string): void {
  try { $.ui.log(`context-alert: ${text}`, { to: 'debug' }) } catch { /* ignore */ }
}

// The two skill ids are named in full so Claude resolves the project's copy first, then the bundled one.
// The dialog opens because context is heavy; the command is the person's own choice of moment, so it says less.
const SKILLS = 'the skill `handoff-doc` if this project has one, otherwise the bundled skill `context-alert:handoff-doc`'
const ASK_PATH =
  'Ask me for the destination path with AskUserQuestion, and recommend one based on this project\'s handoff ' +
  'folder and its naming pattern if it has one.'

function noPathPrompt(source: Flow['source']): string {
  const lead = source === 'dialog' ? 'Context is getting heavy, so I want a handoff doc now.' : 'I want a handoff doc now.'
  return `${lead} Use ${SKILLS}. ${ASK_PATH}`
}

function withPathPrompt(path: string, source: Flow['source']): string {
  const lead = source === 'dialog' ? 'Context is getting heavy, so please write' : 'Please write'
  return `${lead} the handoff doc for this session, using ${path} (the existing doc there or the next one in its series), with ${SKILLS}.`
}

/** project skill, then the bundled copy, then a plain prompt worded for `source`. Never throws. */
export async function runHandoff($: EngineInterface, path: string | undefined, source: Flow['source'] = 'dialog'): Promise<void> {
  try {
    if (path) {
      try {
        await $.command.run({ command: 'handoff-doc', args: path })
        $.ui.log('context-alert: handoff via command handoff-doc')
        return
      } catch { /* no project skill, or $.command.run cannot run skills */ }
      try {
        await $.command.run({ command: 'context-alert:handoff-doc', args: path })
        $.ui.log('context-alert: handoff via command context-alert:handoff-doc')
        return
      } catch { /* fall through */ }
      $.ui.log('context-alert: handoff via prompt (update, known path)')
      await $.prompt.submit({ text: withPathPrompt(path, source), asUser: true })
      return
    }
    // No known path: skip the commands (they need an argument) and let Claude pick the skill and ask for the path.
    $.ui.log('context-alert: handoff via prompt (no known path)')
    await $.prompt.submit({ text: noPathPrompt(source), asUser: true })
  } catch (err) {
    try { $.ui.log(`context-alert: handoff failed: ${String(err)}`) } catch { /* ignore */ }
  }
}

/**
 * /compact (with `instructions` as its args) queued until idle; on a rejection, session.compact({ instructions });
 * if that is refused too, a toast. Resolves true when a compaction was started or queued. Never throws.
 */
export async function compactNow($: EngineInterface, rt?: Runtime, instructions?: string): Promise<boolean> {
  if (rt) rt.compacting = true
  try {
    await $.command.run({ command: 'compact', ...(instructions ? { args: instructions } : {}) })
    log($, `compact via command.run${instructions ? ' (focus in args)' : ''}`)
    return true
  } catch (err) {
    log($, `/compact via command failed: ${String(err)}`)
  }
  let why: string
  try {
    const result = await $.session.compact(instructions ? { instructions } : undefined)
    if (!result.skip) {
      log($, `compact via session.compact${instructions ? ' (focus in instructions)' : ''}`)
      // This mod's own session.compact skips its own hooks, so the hook's work is done here.
      if (rt) await afterCompaction($, rt, instructions, 'plugin')
      return true
    }
    why = `vetoed: ${result.skip}` // another plugin's hook skipped it
  } catch (err) {
    why = `rejected: ${String(err)}`
  }
  if (rt) { rt.compacting = false; rt.nudgeAfterCompact = undefined }
  try {
    $.ui.log(`context-alert: session.compact ${why}`)
    $.ui.toast("Compaction couldn't start; run /compact")
  } catch { /* ignore */ }
  return false
}

/** Arm the flow (before the handoff is queued, so its turn's writes count), then run the handoff chain. */
export async function startFlow(
  $: EngineInterface, rt: Runtime, o: { source: Flow['source']; path?: string; force: boolean },
): Promise<void> {
  rt.notifyOnCompact = false
  rt.nudgeAfterCompact = undefined
  const f: Flow = {
    source: o.source, phase: 'writing', path: o.path, pathLocked: false, wrote: false, turns: 0, force: o.force,
    waited: false, busy: [], foldPending: false, labels: {}, shown: 0,
  }
  rt.flow = f
  log($, `handoff-compact flow started (${o.source}${o.force ? ', now' : ''})`)
  // Snapshot before the handoff turn: an agent that reports inside that turn, after the doc is written, is then
  // still seen as finished at the move to waiting and folded in.
  f.busy = (await liveAgents($, f)) ?? []
  await runHandoff($, o.path, o.source)
}

/** Busy top-level agent ids, or undefined when the list cannot be read (then nobody may assume "no agents"). */
async function liveAgents($: EngineInterface, f: Flow): Promise<string[] | undefined> {
  let agents: (ListedAgent & { description?: string })[]
  try {
    agents = await $.agent.list()
  } catch (err) {
    log($, `agent.list failed: ${String(err)}`)
    return undefined
  }
  const now = busyAgentIds(agents)
  for (const a of agents) if (now.includes(a.id) && a.description) f.labels[a.id] = a.description
  return now
}

/** Toast, clear the flow, remember its path (D18) and compact with the focus text; session.compact notifies. */
async function compactFlow($: EngineInterface, rt: Runtime, f: Flow, toast = HANDOFF_COMPACTING_TOAST): Promise<void> {
  if (rt.flow === f) rt.flow = undefined
  rt.notifyOnCompact = f.waited
  rt.nudgeAfterCompact = { path: f.path, instructions: focusInstructions(f.path) } // sent from afterCompaction, once it lands
  $.ui.toast(toast)
  // This mod's own command.run hooks never see its /handoff-doc call, so a path outside handoff/ is recorded here.
  if (f.path) await rememberHandoffPath($, f.path).catch(() => undefined)
  if (!(await compactNow($, rt, focusInstructions(f.path)))) { rt.notifyOnCompact = false; rt.nudgeAfterCompact = undefined }
}

/** 06's check(): fold in finished agents, wait while any are busy (unless `force`), else compact. Never throws. */
export async function check($: EngineInterface, rt: Runtime): Promise<void> {
  const f = rt.flow
  if (!f || f.phase !== 'waiting' || rt.compacting) return
  try {
    const now = await liveAgents($, f)
    if (rt.flow !== f) return // cancelled or compacted while the list was read
    if (!now) {
      // Unknown is not "none": keep waiting (the next turn end re-checks), unless `now` said not to wait at all.
      if (f.force) await compactFlow($, rt, f)
      else log($, 'agent list unreadable; still waiting')
      return
    }
    const finished = diffBusy(f.busy, now)
    if (finished.length > 0 && !f.foldPending) {
      // busy moves on here, or the fold-in turn's own check would see the same finishes and fold them again.
      f.busy = now
      f.foldPending = true
      log($, `fold-in for ${finished.join(', ')}`)
      try {
        const r = await $.prompt.submit({ text: foldPrompt(finished.map((id) => ({ id, label: f.labels[id] })), f.path), asUser: true })
        const dropped = (r as { drop?: string } | undefined)?.drop
        if (!dropped) return
        f.foldPending = false // no fold turn will come to re-check (nor to let `now` through): carry on below
        log($, `fold-in prompt dropped: ${dropped}`)
      } catch (err) {
        f.foldPending = false // no fold turn will come to re-check: carry on below
        log($, `fold-in prompt failed: ${String(err)}`)
      }
    }
    if (now.length > 0 && !f.force) {
      f.waited = true
      f.busy = now
      if (now.length !== f.shown) {
        f.shown = now.length
        $.ui.toast(waitToast(now.length, rt.backgroundTasks))
      }
      return
    }
    await compactFlow($, rt, f)
  } catch (err) {
    log($, `check failed: ${String(err)}`)
  }
}

/**
 * A main-thread Write/Edit of a .md that succeeded, while a flow exists. The first Write under handoff/ fixes the
 * path (a sequel's later back-link Edit of the previous doc does not move it); before that a handoff/ Edit sets it,
 * and any other .md only fills a missing path (a CLAUDE.md pointer update never becomes the focus).
 */
export function noteFlowWrite(f: Flow, tool: unknown, filePath: string): void {
  if (f.phase === 'writing') f.wrote = true
  if (f.pathLocked) return
  if (handoffPathFromWrite(tool, filePath)) {
    f.path = filePath
    f.pathLocked = tool === 'Write'
  } else if (!f.path) {
    f.path = filePath
  }
}

/** Each main-thread turn.complete while a flow exists. Never throws. */
export async function onFlowTurnEnd(
  $: EngineInterface, rt: Runtime, ended: { isAborted: boolean; reason: string },
): Promise<void> {
  const f = rt.flow
  if (!f) return
  try {
    if (f.phase === 'waiting') {
      if (f.foldPending && (ended.isAborted || ended.reason !== 'answer')) {
        rt.flow = undefined // Esc or a failure in the fold-in turn: the doc may not be updated, so no compaction
        $.ui.toast(TURN_NOT_FINISHED_TOAST)
        return
      }
      f.foldPending = false
      await check($, rt)
      return
    }
    if (ended.isAborted || ended.reason !== 'answer') {
      rt.flow = undefined
      $.ui.toast(TURN_NOT_FINISHED_TOAST)
      return
    }
    if (f.wrote) {
      // The start snapshot plus any agent spawned while writing: one that finished since is folded in (at worst
      // a second, in-place fold of a result the doc already has).
      f.phase = 'waiting'
      f.busy = unionIds(f.busy, (await liveAgents($, f)) ?? [])
      await check($, rt)
      return
    }
    if (!countsTowardWritingCap(rt.turnOrigin, PLUGIN_NAME)) return // an agent's report turn is not a refusal to write
    f.turns++
    if (f.turns >= COMPACT_AFTER_MAX_TURNS) {
      rt.flow = undefined
      $.ui.toast(NO_DOC_WRITTEN_TOAST)
    }
  } catch { /* ignore */ }
}

/** Serves `/handoff-compact [now] [path]`. Ignores cfg.enabled (D16). Never throws. */
export async function onFlowCommand($: EngineInterface, rt: Runtime, args: string): Promise<void> {
  try {
    const { now, path } = parseHandoffCompactArgs(args)
    const sid = await $.session.id() // also lets the command.run hook return before any $.command.run below
    const f = rt.flow
    if (f) {
      let ignored: string | undefined = path
      if (now && path && f.phase === 'writing' && !f.path) { f.path = path; ignored = undefined }
      if (!now) {
        const waiting = f.phase === 'waiting' ? ((await liveAgents($, f)) ?? f.busy).length : undefined
        $.ui.toast(pathIgnored(alreadyRunningToast(waiting), ignored))
        return
      }
      f.force = true
      log($, 'handoff-compact upgraded to now')
      if (f.phase === 'waiting' && !rt.mainTurnRunning && !f.foldPending && !rt.compacting) {
        await compactFlow($, rt, f, pathIgnored(HANDOFF_COMPACTING_TOAST, ignored))
      } else {
        $.ui.toast(pathIgnored(NOW_UPGRADE_TOAST, ignored))
      }
      return
    }
    if (rt.compacting) { $.ui.toast(ALREADY_COMPACTING_TOAST); return } // the last run's compaction is still queued
    const known = path ?? (await loadSession($, sid)).handoff
    await startFlow($, rt, { source: 'command', path: known, force: now })
  } catch (err) {
    log($, `handoff-compact failed: ${String(err)}`)
  }
}

/** A prompt entering the session. Only the person's own typed (or Remote Control) message cancels a waiting flow (D22). */
export function onFlowPrompt(
  $: EngineInterface, rt: Runtime, e: { text: string; command?: unknown; origin: { kind: string } },
): void {
  const f = rt.flow
  if (!f) return
  log($, `prompt during handoff-compact (${f.phase}), origin ${e.origin.kind}`)
  if (f.phase !== 'waiting') return
  if (e.origin.kind !== 'composer' && e.origin.kind !== 'bridge') return
  if (e.command !== undefined) return // a slash command (the engine sets `command`) never cancels; "/etc is odd" does
  rt.flow = undefined
  $.ui.toast(CANCELLED_TOAST)
}

/**
 * A main-thread compaction landed (not vetoed): the tiers start over (D15), any flow ends, and the notification
 * goes out only when the flow waited for agents (D26). The state resets run before the first await.
 */
export async function afterCompaction(
  $: EngineInterface, rt: Runtime, instructions: string | undefined, trigger?: string,
): Promise<void> {
  rt.compacting = false
  rt.pending = false
  rt.suggestAnnounced = undefined
  const waited = rt.notifyOnCompact || rt.flow?.waited === true
  if (rt.flow || rt.notifyOnCompact) log($, `compaction landed, instructions ${instructions ? 'present' : 'absent'}`)
  // Taken here, before any await: this runs once per compaction, whichever hook or call reaches it first.
  const nudge = rt.nudgeAfterCompact
  const epoch = rt.epoch
  rt.flow = undefined
  rt.notifyOnCompact = false
  rt.nudgeAfterCompact = undefined
  try { await updateSession($, await $.session.id(), resetTiers) } catch { /* the notification still goes */ }
  if (waited && rt.interactive) {
    try {
      if ((await loadConfig($)).notify) await $.ui.notify(WAITED_NOTIFICATION, { title: WAITED_NOTIFICATION_TITLE })
    } catch { /* the nudge still goes */ }
  }
  if (!nudge) return
  const m = nudgeMatches(nudge.instructions, instructions, trigger)
  if (!m.send) return log($, `no continue nudge: ${m.note}`)
  if (instructions === undefined) log($, `continue nudge: ${m.note}`)
  await nudgeToContinue($, rt, nudge.path, epoch)
}

/**
 * After a handoff flow's compaction: with no top-level agent busy nothing would wake the session, so submit one
 * continue prompt. Skipped (and logged) when `continue` is off, the run is headless, the agent list cannot be read,
 * or a new turn began (or /clear ran) since the compaction landed.
 * With agents still running their reports wake it. Background shells do not count. Never throws.
 */
async function nudgeToContinue($: EngineInterface, rt: Runtime, path: string | undefined, epoch: number): Promise<void> {
  try {
    if (!rt.interactive) return log($, 'no continue nudge: not an interactive session')
    if (!(await loadConfig($)).continue) return log($, 'no continue nudge: continue is off')
    let busy: string[]
    try {
      busy = busyAgentIds(await $.agent.list())
    } catch (err) {
      return log($, `no continue nudge: agent.list failed: ${String(err)}`)
    }
    if (busy.length > 0) return log($, `no continue nudge: ${busy.length} agent(s) still running`)
    // The awaits above let a turn start (the person's queued message) or /clear run: then the nudge is stale.
    if (rt.epoch !== epoch || rt.mainTurnRunning) return log($, 'no continue nudge: a new turn started or the conversation was cleared')
    const r = await $.prompt.submit({ text: continuePrompt(path), asUser: true })
    const dropped = (r as { drop?: string } | undefined)?.drop
    log($, dropped ? `continue nudge dropped: ${dropped}` : `continue nudge sent (${path ? 'path known' : 'no path'})`)
  } catch (err) {
    log($, `continue nudge failed: ${String(err)}`)
  }
}
