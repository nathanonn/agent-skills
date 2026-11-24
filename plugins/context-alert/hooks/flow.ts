// The handoff-compact flow (proposal 05/06): write the handoff doc, wait for busy agents (folding in each
// result), then compact with focus instructions. Started by `/handoff-compact` and by the dialog's
// "Handoff, then compact" option (D25). Main thread only; hooks.ts filters sub-agent events before calling in.
import type { EngineInterface } from 'claude-code'
import type { Runtime } from './alert'
import {
  afterAutoNotification, afterAutoPrompt, ALREADY_COMPACTING_TOAST, alreadyRunningToast, AUTO_DONE_TITLE, autoCancelledToast,
  autoDoneNotification, autoHandoffArgs, autoHandoffPrompt, busyAgentIds, CANCELLED_TOAST, continuePrompt, countsTowardWritingCap, diffBusy,
  focusInstructions, foldPrompt, HANDOFF_COMPACTING_TOAST, NO_DOC_WRITTEN_TOAST, nudgeMatches, NOW_UPGRADE_TOAST,
  parseHandoffCompactArgs, pathIgnored, SKILLS, TURN_NOT_FINISHED_TOAST, unionIds, WAITED_NOTIFICATION,
  WAITED_NOTIFICATION_TITLE, waitToast, whyLabel, type ListedAgent,
} from './flow-logic'
import {
  belowFirst, COMPACT_AFTER_MAX_TURNS, CYCLE_NOTE, cycleAllowed, effectiveReserve, fmtNext, formatTokens, handoffPathFromWrite,
  nextThreshold, resetTiers, roomLeft, waitDecision, type Config,
} from './logic'
import { loadConfig, loadSession, recordAutoStart, rememberHandoffPath, setAutoHeld, updateSession } from './state'

/** This plugin's name, as a prompt.submit origin names it. */
export const PLUGIN_NAME = 'context-alert'

export type Flow = {
  /** `auto`: started by a threshold crossing in auto mode (no dialog); it never asks and cancels while writing too. */
  source: 'command' | 'dialog' | 'auto'
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
  /** When the wait for busy agents began (`$.clock.now()`), for maxWait. */
  waitStart?: number
  /** Auto flows: the maxWait timer. Cancelled whenever the flow ends (`endFlow`). */
  timer?: { cancel: () => void }
  /** When the timer is due (`$.clock.now()` scale), to bring it forward when maxWait is lowered. */
  timerDue?: number
}

/** End `f` (or the current flow): clear it from the runtime and cancel its maxWait timer. */
export function endFlow(rt: Runtime, f: Flow | undefined = rt.flow): void {
  if (!f) return
  if (f.timer) {
    try { f.timer.cancel() } catch { /* ignore */ }
    f.timer = undefined
  }
  f.timerDue = undefined
  if (rt.flow === f) rt.flow = undefined
}

function log($: EngineInterface, text: string): void {
  try { $.ui.log(`context-alert: ${text}`, { to: 'debug' }) } catch { /* ignore */ }
}

// The dialog opens because context is heavy; the command is the person's own choice of moment, so it says less.
const ASK_PATH =
  'Ask me for the destination path with AskUserQuestion, and recommend one based on this project\'s handoff ' +
  'folder and its naming pattern if it has one.'

function noPathPrompt(source: 'command' | 'dialog'): string {
  const lead = source === 'dialog' ? 'Context is getting heavy, so I want a handoff doc now.' : 'I want a handoff doc now.'
  return `${lead} Use ${SKILLS}. ${ASK_PATH}`
}

function withPathPrompt(path: string, source: 'command' | 'dialog'): string {
  const lead = source === 'dialog' ? 'Context is getting heavy, so please write' : 'Please write'
  return `${lead} the handoff doc for this session, using ${path} (the existing doc there or the next one in its series), with ${SKILLS}.`
}

/** project skill, then the bundled copy, then a plain prompt worded for `source`. Never throws. */
export async function runHandoff(
  $: EngineInterface, path: string | undefined, source: Flow['source'] = 'dialog', dir?: string,
): Promise<void> {
  try {
    if (path) {
      // An auto flow never asks (S5): the skill takes the directive in the args as the person's own instruction.
      const args = source === 'auto' ? autoHandoffArgs(path) : path
      try {
        await $.command.run({ command: 'handoff-doc', args })
        $.ui.log('context-alert: handoff via command handoff-doc')
        return
      } catch { /* no project skill, or $.command.run cannot run skills */ }
      try {
        await $.command.run({ command: 'context-alert:handoff-doc', args })
        $.ui.log('context-alert: handoff via command context-alert:handoff-doc')
        return
      } catch { /* fall through */ }
      $.ui.log('context-alert: handoff via prompt (update, known path)')
      await $.prompt.submit({ text: source === 'auto' ? autoHandoffPrompt(path, dir) : withPathPrompt(path, source), asUser: true })
      return
    }
    // No known path: skip the commands (they need an argument). Claude picks the skill and asks for the path, except in
    // auto mode (S5), where the prompt tells it to pick the path itself.
    $.ui.log(`context-alert: handoff via prompt (no known path${source === 'auto' ? ', no questions' : ''})`)
    await $.prompt.submit({ text: source === 'auto' ? autoHandoffPrompt(undefined, dir) : noPathPrompt(source), asUser: true })
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
      if (rt) await afterCompaction($, rt, instructions, 'plugin', (result as { tokensAfter?: number }).tokensAfter)
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
  $: EngineInterface, rt: Runtime, o: { source: Flow['source']; path?: string; force: boolean; dir?: string },
): Promise<void> {
  rt.notifyOnCompact = false
  rt.nudgeAfterCompact = undefined
  endFlow(rt)
  const f: Flow = {
    source: o.source, phase: 'writing', path: o.path, pathLocked: false, wrote: false, turns: 0, force: o.force,
    waited: false, busy: [], foldPending: false, labels: {}, shown: 0,
  }
  rt.flow = f
  log($, `handoff-compact flow started (${o.source}${o.force ? ', now' : ''})`)
  // Snapshot before the handoff turn: an agent that reports inside that turn, after the doc is written, is then
  // still seen as finished at the move to waiting and folded in.
  f.busy = (await liveAgents($, f)) ?? []
  await runHandoff($, o.path, o.source, o.dir)
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

type GoInfo = {
  why: 'no-agents' | 'room' | 'maxWait' | 'force'
  /** Labels of the top-level agents still busy as the flow goes ahead. */
  left: string[]
  /** Name them in the focus text (S2: room or maxWait cut the wait short; `now` keeps today's text). */
  mention: boolean
}

/** Toast, clear the flow, remember its path (D18) and compact with the focus text; session.compact notifies. */
async function compactFlow(
  $: EngineInterface, rt: Runtime, f: Flow, toast = HANDOFF_COMPACTING_TOAST,
  go: GoInfo = { why: 'no-agents', left: [], mention: false },
): Promise<void> {
  endFlow(rt, f)
  const auto = f.source === 'auto'
  const instructions = focusInstructions(f.path, go.mention ? go.left : [])
  // Auto flows send their own end-of-cycle notification when the compaction lands (S1).
  rt.notifyOnCompact = auto ? false : f.waited
  // Sent from afterCompaction, once it lands
  rt.nudgeAfterCompact = { path: f.path, instructions, ...(auto ? { auto: { left: go.left.length } } : {}) }
  if (auto) {
    log($, `auto cycle: path ${f.path ?? 'none'}, waited ${f.waited ? 'yes' : 'no'}, agents left running ${go.left.length}, why ${whyLabel(go.why, f.waited)}`)
  }
  $.ui.toast(toast)
  // This mod's own command.run hooks never see its /handoff-doc call, so a path outside handoff/ is recorded here.
  if (f.path) await rememberHandoffPath($, f.path).catch(() => undefined)
  if (!(await compactNow($, rt, instructions))) {
    rt.notifyOnCompact = false
    rt.nudgeAfterCompact = undefined
    if (auto) log($, 'auto cycle: compaction failed')
  }
}

/**
 * The room before Claude Code's own auto-compact, and its threshold. Both undefined when auto-compact is off or the
 * usage is unreadable. The fill is the breakdown's own `totalTokens` (the same estimate as the threshold, and present
 * right after a compaction), else `context.tokens`.
 */
async function roomNow($: EngineInterface): Promise<{ room?: number; threshold?: number }> {
  try {
    const { context } = await $.session.usage({ breakdown: 'summary' })
    const threshold = context.breakdown?.autoCompactThreshold
    const fill = context.breakdown?.totalTokens ?? context.tokens
    return { room: roomLeft(threshold, fill), threshold }
  } catch (err) {
    log($, `usage breakdown unreadable: ${String(err)}`)
    return {}
  }
}

/** The maxWait timer fired. A running turn (agent report, fold-in) defers the check to its end. */
async function onWaitDeadline($: EngineInterface, rt: Runtime, f: Flow): Promise<void> {
  if (rt.flow !== f || f.phase !== 'waiting') return
  if (rt.mainTurnRunning || f.foldPending || rt.compacting) { log($, 'maxWait reached; checking when the running turn ends'); return }
  await check($, rt)
}

/** Arm the maxWait timer, or bring it forward when the deadline moved earlier (maxWait lowered mid-wait). */
function armWaitTimer($: EngineInterface, rt: Runtime, f: Flow, nowMs: number, remainingMs: number): void {
  const due = nowMs + Math.max(1, Math.ceil(remainingMs))
  if (f.timer) {
    if (f.timerDue === undefined || due >= f.timerDue) return
    try { f.timer.cancel() } catch { /* ignore */ }
    f.timer = undefined
  }
  try {
    f.timerDue = due
    f.timer = $.clock.after(due - nowMs, () => {
      f.timer = undefined
      f.timerDue = undefined
      if (rt.flow !== f) log($, 'maxWait timer fired after the flow ended') // endFlow cancels it, so this is a bug trace
      void onWaitDeadline($, rt, f).catch(() => undefined)
    })
  } catch (err) {
    f.timerDue = undefined
    log($, `maxWait timer failed: ${String(err)}`)
  }
}

/** `maxWait` changed while an auto flow waits: check again now, so a lowered limit takes effect at once. */
export async function recheckWait($: EngineInterface, rt: Runtime): Promise<void> {
  const f = rt.flow
  if (!f || f.source !== 'auto' || f.phase !== 'waiting' || rt.mainTurnRunning || f.foldPending || rt.compacting) return
  await check($, rt)
}

/**
 * Agents are (or may be) still busy: S2's tree. Go ahead when the room before Claude Code's own auto-compact is
 * short (any flow) or an auto flow has waited maxWait; otherwise toast once per count and keep the timer armed.
 * `ids` is the live busy list, or the last known one when the list could not be read (`known` false: then nothing
 * may be assumed about who is busy, but the limits still apply).
 */
async function waitOrGo($: EngineInterface, rt: Runtime, f: Flow, ids: string[], known: boolean): Promise<void> {
  f.waited = true
  if (known) f.busy = ids
  const cfg = await loadConfig($)
  const nowMs = await $.clock.now()
  if (f.waitStart === undefined) f.waitStart = nowMs
  const maxWaitMs = cfg.maxWait * 60_000
  const waitedMs = nowMs - f.waitStart
  const { room, threshold } = await roomNow($)
  if (rt.flow !== f || f.foldPending) return // cancelled, or a fold-in turn began while we looked: its turn end re-checks
  const reserve = effectiveReserve(cfg.reserve, threshold)
  const d = waitDecision({ busy: true, room, reserve, waitedMs, maxWaitMs, auto: f.source === 'auto' })
  if (d.go) {
    const left = ids.map((id) => f.labels[id] ?? id)
    log($, `going ahead with ${ids.length} agent(s) running${known ? '' : ' (agent list unreadable)'}: ${d.why === 'room' ? `room left ${room}, under reserve ${reserve}` : `waited ${Math.round(waitedMs / 1000)}s, maxWait ${cfg.maxWait} min`}`)
    await compactFlow($, rt, f, undefined, { why: d.why as 'room' | 'maxWait', left, mention: true })
    return
  }
  if (known && ids.length !== f.shown) {
    f.shown = ids.length
    $.ui.toast(waitToast(ids.length, rt.backgroundTasks))
  }
  if (f.source === 'auto' && maxWaitMs > 0) armWaitTimer($, rt, f, nowMs, maxWaitMs - waitedMs)
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
      // The limits still apply, so an unreadable list cannot hold an auto flow forever.
      if (f.force) await compactFlow($, rt, f, undefined, { why: 'force', left: [], mention: false })
      else {
        log($, 'agent list unreadable; still waiting')
        await waitOrGo($, rt, f, f.busy, false)
      }
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
    // A second check (the maxWait timer beside a turn end) must not compact while a fold-in is queued.
    if (f.foldPending) return
    if (now.length > 0 && !f.force) return await waitOrGo($, rt, f, now, true)
    await compactFlow($, rt, f, undefined, {
      why: now.length > 0 ? 'force' : 'no-agents', left: now.map((id) => f.labels[id] ?? id), mention: false,
    })
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
        endFlow(rt, f) // Esc or a failure in the fold-in turn: the doc may not be updated, so no compaction
        $.ui.toast(TURN_NOT_FINISHED_TOAST)
        return
      }
      f.foldPending = false
      await check($, rt)
      return
    }
    if (ended.isAborted || ended.reason !== 'answer') {
      endFlow(rt, f)
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
      endFlow(rt, f)
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

/**
 * A prompt entering the session. Only the person's own typed (or Remote Control) message cancels a flow. Manual and
 * dialog flows cancel while waiting (D22); an auto flow cancels while writing or waiting (D35), since nobody asked for it.
 */
export function onFlowPrompt(
  $: EngineInterface, rt: Runtime, e: { text: string; command?: unknown; origin: { kind: string } },
): void {
  const f = rt.flow
  if (!f) return
  log($, `prompt during handoff-compact (${f.phase}${f.source === 'auto' ? ', auto' : ''}), origin ${e.origin.kind}`)
  if (f.phase !== 'waiting' && f.source !== 'auto') return
  if (e.origin.kind !== 'composer' && e.origin.kind !== 'bridge') return
  if (e.command !== undefined) return // a slash command (the engine sets `command`) never cancels; "/etc is odd" does
  endFlow(rt, f)
  if (f.source === 'auto') void autoCancelledNotice($, f.phase === 'writing').catch(() => undefined)
  else $.ui.toast(CANCELLED_TOAST)
}

/** `Auto handoff-compact cancelled; the next alert is at …`: the tier stays used. */
async function autoCancelledNotice($: EngineInterface, writing: boolean): Promise<void> {
  const cfg = await loadConfig($)
  const state = await loadSession($, await $.session.id())
  $.ui.toast(autoCancelledToast(fmtNext(cfg, nextThreshold(state, cfg)), writing))
}

/** Pause: an auto flow stops (the person asked for no auto cycles); a manual or dialog flow is theirs and stays. */
export function cancelAutoFlow(rt: Runtime): boolean {
  const f = rt.flow
  if (!f || f.source !== 'auto') return false
  endFlow(rt, f)
  return true
}

/**
 * A main-thread compaction landed (not vetoed): the tiers start over (D15), any flow ends, and the notification
 * goes out only when the flow waited for agents (D26). The state resets run before the first await.
 * An auto flow's compaction gets its own notification and the loop-breaker read; Claude Code's own auto-compaction
 * (`trigger: 'auto'`) may queue the after-compaction prompt (S4).
 */
export async function afterCompaction(
  $: EngineInterface, rt: Runtime, instructions: string | undefined, trigger?: string, tokensAfter?: number,
): Promise<void> {
  rt.compacting = false
  rt.pending = false
  rt.suggestAnnounced = undefined
  const hadHandoff = rt.handoffSinceCompact // a doc written since the previous compaction (S4)
  rt.handoffSinceCompact = false
  const waited = rt.notifyOnCompact || rt.flow?.waited === true
  if (rt.flow || rt.notifyOnCompact) log($, `compaction landed, instructions ${instructions ? 'present' : 'absent'}`)
  // Taken here, before any await: this runs once per compaction, whichever hook or call reaches it first.
  const nudge = rt.nudgeAfterCompact
  const epoch = rt.epoch
  const endedAuto = rt.flow?.source === 'auto' // its cycle was counted when it started (S4 must not count it twice)
  endFlow(rt)
  rt.notifyOnCompact = false
  rt.nudgeAfterCompact = undefined
  rt.afterAuto = undefined // a queued after-compaction prompt belongs to the compaction before this one
  const m = nudge ? nudgeMatches(nudge.instructions, instructions, trigger) : undefined
  const autoLanded = nudge?.auto !== undefined && m?.send === true
  try { await updateSession($, await $.session.id(), resetTiers) } catch { /* the notification still goes */ }
  if (waited && rt.interactive) {
    try {
      if ((await loadConfig($)).notify) await $.ui.notify(WAITED_NOTIFICATION, { title: WAITED_NOTIFICATION_TITLE })
    } catch { /* the nudge still goes */ }
  }
  if (autoLanded && nudge?.auto) {
    if (rt.interactive) {
      try {
        if ((await loadConfig($)).notify) {
          await $.ui.notify(autoDoneNotification(nudge.path, nudge.auto.left), { title: AUTO_DONE_TITLE })
        }
      } catch { /* the loop check and nudge still go */ }
    }
    await loopBreaker($, rt, tokensAfter)
  }
  if (nudge && m && !m.send) log($, `no continue nudge: ${m.note}`)
  if (trigger === 'auto') return afterAutoCompaction($, rt, hadHandoff, epoch, endedAuto)
  if (!nudge || !m || !m.send) return
  if (instructions === undefined) log($, `continue nudge: ${m.note}`)
  await nudgeToContinue($, rt, nudge.path, epoch)
}

// ---- loop breaker (S6) ----

/** The window, from the usage call (present after a compaction, unlike the fill). */
async function windowSize($: EngineInterface): Promise<number | undefined> {
  try {
    const { context } = await $.session.usage()
    return context.window
  } catch {
    return undefined
  }
}

/** The conversation's size right after the compaction: the compaction's own `tokensAfter`, else the breakdown's estimate. */
async function sizeAfter($: EngineInterface, tokensAfter: number | undefined): Promise<number | undefined> {
  if (typeof tokensAfter === 'number') return tokensAfter
  try {
    const { context } = await $.session.usage({ breakdown: 'summary' })
    return context.breakdown?.totalTokens
  } catch {
    return undefined
  }
}

/**
 * After an auto cycle's compaction lands, decide from the size it left (S6, review F2): `tokensAfter` from the
 * compaction result, else the breakdown's `totalTokens`. Still past the first threshold: hold auto for this session.
 * `context.tokens` is absent until the next response, and the first measure after it also holds the next turn's growth,
 * so a measure decides only when neither size is available (`rt.loopCheck`, read in hooks.ts).
 */
async function loopBreaker($: EngineInterface, rt: Runtime, tokensAfter?: number): Promise<void> {
  try {
    const cfg = await loadConfig($)
    const tokens = await sizeAfter($, tokensAfter)
    const window = await windowSize($)
    if (tokens === undefined || !window) {
      rt.loopCheck = true
      return log($, 'loop check: size after the compaction unknown; the next measure decides (it includes a turn of growth)')
    }
    rt.loopCheck = false
    const percent = Math.round((tokens / window) * 100)
    log($, `loop check: ${formatTokens(tokens)} (${percent}%) after the compaction`)
    if (!belowFirst(cfg, percent, tokens)) await holdAuto($, rt, cfg, percent)
  } catch (err) {
    log($, `loop check failed: ${String(err)}`)
  }
}

/** The loop breaker's action: auto is held until the fill drops below the first threshold; crossings use the dialog. */
export async function holdAuto($: EngineInterface, rt: Runtime, cfg: Config, percent: number): Promise<void> {
  const text = `Compaction left context at ${percent}%; auto handoff paused.`
  try {
    await setAutoHeld($, await $.session.id(), true)
    log($, `loop breaker: ${text}`)
    $.ui.toast(text)
    if (cfg.notify && rt.interactive) await $.ui.notify(text, { title: 'Auto handoff paused' })
  } catch (err) {
    log($, `loop breaker failed: ${String(err)}`)
  }
}

// ---- S4: Claude Code's own auto-compaction ----

/**
 * Claude Code compacted by itself. In auto mode (afterAutoCompact on, interactive, not paused or held, cap not reached)
 * queue one prompt for the next idle point: write the handoff doc and carry on, or just carry on when a doc was written
 * since the previous compaction. It counts as an auto cycle. Never throws.
 */
async function afterAutoCompaction(
  $: EngineInterface, rt: Runtime, hadHandoff: boolean, epoch: number, endedAuto: boolean,
): Promise<void> {
  try {
    const cfg = await loadConfig($)
    if (cfg.mode !== 'auto') return
    if (!cfg.afterAutoCompact) return log($, 'no after-compaction prompt: afterAutoCompact is off')
    if (!rt.interactive) return log($, 'no after-compaction prompt: not an interactive session')
    const sid = await $.session.id()
    const state = await loadSession($, sid)
    if (state.paused) return log($, 'no after-compaction prompt: paused')
    if (state.autoHeld) return log($, 'no after-compaction prompt: auto is held by the loop breaker')
    const nowMs = await $.clock.now()
    // An auto flow cut off by Claude Code's own compaction already counted as this crossing's cycle (F5).
    if (!endedAuto) {
      const c = cycleAllowed(state.autoStarts, nowMs, cfg)
      if (!c.ok) {
        $.ui.toast(CYCLE_NOTE(c.count, cfg.cycleWindow))
        return log($, `no after-compaction prompt: ${c.count} cycle(s) in the last ${cfg.cycleWindow} min`)
      }
      if (rt.epoch !== epoch) return log($, 'no after-compaction prompt: the conversation was cleared')
      await recordAutoStart($, sid, nowMs, cfg)
    }
    // Stamped with the epoch of the compaction, and re-checked after the store write: a turn that started meanwhile
    // (the person's queued prompt) has cleared this intent already (F4).
    if (rt.epoch !== epoch) return log($, 'no after-compaction prompt: a new turn started or the conversation was cleared')
    rt.afterAuto = { kind: hadHandoff ? 'continue' : 'handoff', path: state.handoff, dir: cfg.handoffDir, epoch }
    if (rt.mainTurnRunning) return log($, `after-compaction ${rt.afterAuto.kind} prompt queued for the end of this turn`)
    await sendAfterAuto($, rt)
  } catch (err) {
    log($, `after-compaction prompt failed: ${String(err)}`)
  }
}

/**
 * Send the queued after-compaction prompt (now, or at the main turn's end). Dropped when the turn was interrupted, the
 * conversation was cleared, auto was paused or switched off, or a handoff-compact flow runs. True when it was sent.
 * "Handoff or continue" is decided here, not at landing: a doc written later in the same turn makes it a continue (F5).
 */
export async function sendAfterAuto(
  $: EngineInterface, rt: Runtime, ended?: { isAborted: boolean; reason: string },
): Promise<boolean> {
  const a = rt.afterAuto
  if (!a) return false
  try {
    if (ended && (ended.isAborted || ended.reason !== 'answer')) { log($, 'after-compaction prompt dropped: the turn did not finish'); return false }
    if (a.epoch !== rt.epoch) { log($, 'after-compaction prompt dropped: the conversation moved on'); return false }
    if (rt.flow || rt.mainTurnRunning) { log($, 'after-compaction prompt dropped: busy'); return false }
    const cfg = await loadConfig($)
    const state = await loadSession($, await $.session.id())
    if (cfg.mode !== 'auto' || !cfg.afterAutoCompact || !rt.interactive || state.paused) {
      log($, 'after-compaction prompt dropped: auto is off, paused or not interactive')
      return false
    }
    if (rt.afterAuto !== a || rt.epoch !== a.epoch || rt.mainTurnRunning) return false
    const kind = rt.handoffSinceCompact ? 'continue' : a.kind
    const path = state.handoff ?? a.path
    log($, `auto cycle (after Claude Code's auto-compaction): ${kind} prompt sent, path ${path ?? 'none'}`)
    // While this handoff turn runs, a .md it writes counts as the handoff, wherever it lives (F16).
    if (kind === 'handoff') rt.afterAutoHandoff = { locked: false }
    const r = await $.prompt.submit({ text: afterAutoPrompt(kind, path, a.dir), asUser: true })
    const dropped = (r as { drop?: string } | undefined)?.drop
    if (dropped) {
      rt.afterAutoHandoff = undefined
      log($, `after-compaction prompt dropped by the host: ${dropped}`)
      return false
    }
    if (cfg.notify && rt.interactive) void $.ui.notify(afterAutoNotification(kind), { title: AUTO_DONE_TITLE }).catch(() => undefined)
    return true
  } catch (err) {
    rt.afterAutoHandoff = undefined
    log($, `after-compaction prompt failed: ${String(err)}`)
    return false
  } finally {
    if (rt.afterAuto === a) rt.afterAuto = undefined
  }
}

/** A main-thread .md write while an S4 handoff turn runs: it is the handoff doc (F16). Never throws. */
export function noteAfterAutoWrite($: EngineInterface, rt: Runtime, tool: unknown, filePath: string): void {
  const h = rt.afterAutoHandoff
  if (!h) return
  rt.handoffSinceCompact = true
  // The first Write fixes the path (an Edit of a CLAUDE.md pointer afterwards does not move it).
  if (!h.locked && tool === 'Write') {
    h.locked = true
    void rememberHandoffPath($, filePath).catch(() => undefined)
  }
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

/** The live flow and what is queued, for `/context-alert status`. Never throws. */
export async function runtimeStatus($: EngineInterface, rt: Runtime): Promise<{ flow: string; queued: string; interactive: boolean }> {
  let flow = 'none'
  const f = rt.flow
  if (f) {
    const tag = f.source === 'auto' ? 'auto ' : f.source === 'dialog' ? 'dialog ' : ''
    if (f.phase === 'writing') flow = `${tag}flow writing the handoff doc`
    else {
      const agents = (await liveAgents($, f).catch(() => undefined)) ?? f.busy
      const bits: string[] = []
      try {
        const cfg = await loadConfig($)
        if (f.source === 'auto' && cfg.maxWait > 0 && f.waitStart !== undefined) {
          const left = Math.max(0, cfg.maxWait * 60_000 - ((await $.clock.now()) - f.waitStart))
          bits.push(`maxWait left ${Math.ceil(left / 60_000)} min`)
        } else if (f.source === 'auto') bits.push(cfg.maxWait > 0 ? 'maxWait not started' : 'no maxWait')
        const { room } = await roomNow($)
        if (room !== undefined) bits.push(`room left ${formatTokens(room)}`)
      } catch { /* the line is still useful without them */ }
      flow = `${tag}flow waiting for ${agents.length} ${agents.length === 1 ? 'agent' : 'agents'}${bits.length ? ` (${bits.join(', ')})` : ''}`
    }
  }
  const queued = [
    `compaction queued ${rt.compacting ? 'yes' : 'no'}`,
    `continue prompt armed ${rt.nudgeAfterCompact ? 'yes' : 'no'}`,
    `after-compaction prompt ${rt.afterAuto ? `queued (${rt.afterAuto.kind})` : 'none'}`,
  ].join(' · ')
  return { flow, queued, interactive: rt.interactive }
}
