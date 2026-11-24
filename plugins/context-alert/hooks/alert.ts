import type { EngineInterface } from 'claude-code'
import { compactNow, endFlow, runHandoff, startFlow, type Flow } from './flow'
import { autoStartToast, type TurnOrigin } from './flow-logic'
import {
  classifyAskError, CYCLE_NOTE, cycleAllowed, dialogOptions, formatTokens, isBusyStatus, isEnabled, nextThreshold, questionText,
  rearm, shouldFire, type Asked, type Config, type SessionState,
} from './logic'
import { loadConfig, recordAutoStart, recordTier, unrecordTier, updateSession } from './state'

/**
 * Per-load state of the hooks module (its "module variables"). One object, created by `register`,
 * so a reload or a test starts clean. Read and written by hooks after they called next(e).
 */
export type Runtime = {
  /** The main loop has a turn running (turn.start .. turn.complete, main thread only). */
  mainTurnRunning: boolean
  /** An alert may be due and was held back: ask at the next idle point. */
  pending: boolean
  /** A dialog (or its decision) is in flight: no second one. */
  asking: boolean
  /** False for `-p` and SDK runs (session.start's isInteractive). */
  interactive: boolean
  /** `background_tasks` length from the last classic.Stop. */
  backgroundTasks: number
  /** Config cache, refreshed on every measure and by /context-alert set and reset. */
  config?: Config
  /** The tier a suggest-mode toast and notification went out for, so a retry does not repeat them. */
  suggestAnnounced?: string
  /** Consecutive refused dialogs; after MAX_REFUSALS the tier is consumed so it cannot loop. */
  refusals: number
  /**
   * A handoff-compact flow (`/handoff-compact`, or the dialog's "Handoff, then compact"): see flow.ts.
   * Cleared when it compacts, is cancelled or gives up, or by any main-thread compaction. Alerts are held meanwhile.
   */
  flow?: Flow
  /** The flow that just asked for a compaction waited for agents: session.compact sends the notification. */
  notifyOnCompact: boolean
  /**
   * A handoff flow asked for a compaction: once it lands, nudge the session to continue from the doc at `path`
   * (if no agent is then busy and `continue` is on). Set beside notifyOnCompact, cleared at the same points.
   */
  nudgeAfterCompact?: { path?: string; instructions: string; auto?: { left: number } }
  /** Raised on every main turn.start and conversation reset: a nudge started before a raise is stale (S1). */
  epoch: number
  /** Origin of the prompt about to start a main turn (recorded by prompt.submit, taken by turn.start). */
  nextTurnOrigin?: TurnOrigin
  /** Origin of the main turn running or last ended; undefined when this mod did not see its prompt. */
  turnOrigin?: TurnOrigin
  /** A compaction this mod started is queued: no dialog until it lands (session.compact) or a main turn starts. */
  compacting: boolean
  /** A main-thread handoff doc write since the last landed compaction (S4); every landed compaction clears it. */
  handoffSinceCompact: boolean
  /**
   * S4: Claude Code compacted by itself and a handoff/continue prompt waits for the next idle point.
   * Cleared when it is sent or dropped, at the next compaction, a main turn start or a conversation reset.
   */
  afterAuto?: { kind: 'handoff' | 'continue'; path?: string; dir: string; epoch: number }
  /** An S4 handoff prompt was sent and its turn runs: a .md written meanwhile is the handoff doc. Cleared when the turn ends. */
  afterAutoHandoff?: { locked: boolean }
  /** The loop breaker could not read the fill right after an auto cycle's compaction: check at the next measure. */
  loopCheck: boolean
}

export const MAX_REFUSALS = 3

/**
 * What a crossing does in this session right now: `auto` starts the handoff-compact flow with no dialog; otherwise the
 * dialog, with `cap` set when auto mode fell back to it because `maxCycles` was reached (S6). Auto never runs in a
 * non-interactive run, while paused, or while the loop breaker holds it.
 */
export function autoPlan(
  cfg: Config, state: SessionState, rt: Pick<Runtime, 'interactive'>, now: number,
): { auto: boolean; cap?: { count: number } } {
  if (cfg.mode !== 'auto' || !rt.interactive || state.paused || state.autoHeld) return { auto: false }
  const c = cycleAllowed(state.autoStarts, now, cfg)
  return c.ok ? { auto: true } : { auto: false, cap: { count: c.count } }
}

/** /clear or an in-process /resume: the conversation this state described is gone, the process goes on. */
export function resetConversation(rt: Runtime): void {
  endFlow(rt)
  rt.notifyOnCompact = false
  rt.nudgeAfterCompact = undefined
  rt.afterAuto = undefined
  rt.afterAutoHandoff = undefined
  rt.loopCheck = false
  rt.handoffSinceCompact = false
  rt.epoch++
  rt.compacting = false
  rt.pending = false
  rt.suggestAnnounced = undefined
  rt.refusals = 0
  rt.mainTurnRunning = false
  rt.backgroundTasks = 0
  rt.nextTurnOrigin = undefined
  rt.turnOrigin = undefined
}

export const newRuntime = (): Runtime => ({
  mainTurnRunning: false, pending: false, asking: false, interactive: true, backgroundTasks: 0, refusals: 0,
  compacting: false, notifyOnCompact: false, epoch: 0, handoffSinceCompact: false, loopCheck: false,
})

export type Fill = { percent: number | undefined; tokens: number | undefined; window: number }

export async function getConfig($: EngineInterface, rt: Runtime): Promise<Config> {
  return rt.config ?? (await refreshConfig($, rt))
}

export async function refreshConfig($: EngineInterface, rt: Runtime): Promise<Config> {
  rt.config = await loadConfig($)
  return rt.config
}

/** busy = an agent pending, running or waiting, or background work seen at the last Stop. */
export async function isBusy($: EngineInterface, rt: Runtime): Promise<boolean> {
  try {
    if ((await $.agent.list()).some((a) => isBusyStatus(a.status))) return true
  } catch { /* fall through to the cached background tasks */ }
  return rt.backgroundTasks > 0
}

async function currentFill($: EngineInterface): Promise<Fill | undefined> {
  try {
    const { context } = await $.session.usage()
    return { percent: context.percent, tokens: context.tokens, window: context.window }
  } catch {
    return undefined
  }
}

/**
 * Ask now if an alert is due and the main loop is idle. Start it with `void tryAlert(...).catch(...)`
 * from a hook that has already called next(e): nothing here may be awaited by the hook. Never throws.
 *
 * with a turn running it only marks `pending`; the next idle point (turn.complete or an idle measure) retries.
 * A tier is recorded only once the dialog opens (or the suggestion is shown).
 */
export async function tryAlert($: EngineInterface, rt: Runtime, given?: Fill): Promise<void> {
  if (rt.asking || rt.compacting) return
  // held while a handoff-compact flow runs (D25) or an after-compaction prompt waits (S4); retried once it ends
  if (rt.flow || rt.afterAuto) { rt.pending = true; return }
  if (rt.mainTurnRunning) { rt.pending = true; return }
  rt.asking = true // held from the decision through the answer, so two callers cannot both decide
  let action: { kind: 'handoff'; thenCompact: boolean } | { kind: 'compact' } | { kind: 'text'; text: string } | { kind: 'auto' } | undefined
  let handoff: string | undefined
  let dir: string | undefined
  try {
    const cfg = await refreshConfig($, rt)
    if (!isEnabled(cfg)) { rt.pending = false; return }
    const fill = given ?? (await currentFill($))
    if (!fill || fill.percent === undefined || fill.tokens === undefined) return
    const { percent, tokens, window } = fill
    const sid = await $.session.id()
    const state = await updateSession($, sid, (s) => rearm(s, cfg, percent, tokens))
    if (state.paused) { rt.pending = false; return } // /context-alert pause: no alerts, no auto cycles
    if (!shouldFire(state, cfg, percent, tokens)) { rt.pending = false; return }
    if (rt.mainTurnRunning) { rt.pending = true; return } // a turn began while we looked
    handoff = state.handoff
    dir = cfg.handoffDir
    const entry: Asked = { pct: percent, tokens, at: await $.clock.now() }
    const plan = autoPlan(cfg, state, rt, entry.at)
    crossing: {
    if (plan.auto) {
      // Auto mode (S1): no dialog. The tier is used, the cycle counted, and the flow starts outside the guard below.
      await recordTier($, sid, entry)
      await recordAutoStart($, sid, entry.at, cfg)
      rt.pending = false
      $.ui.toast(autoStartToast(percent, tokens))
      action = { kind: 'auto' }
      break crossing
    }
    if (plan.cap) $.ui.toast(CYCLE_NOTE(plan.cap.count, cfg.cycleWindow)) // the cap is reached: this crossing asks instead
    const question = questionText(percent, tokens, window, handoff)
    const tier = nextThreshold(state, cfg)
    const tierKey = `${tier.pct}/${tier.tokens}`

    if (cfg.whenBusy === 'suggest' && (await isBusy($, rt))) {
      // toast + notification once per tier, the suggestion on every attempt until it is shown.
      if (rt.suggestAnnounced !== tierKey) {
        rt.suggestAnnounced = tierKey
        $.ui.toast(`Context at ${percent}% (${formatTokens(tokens)}). Background work is running; Tab to ask for a handoff doc.`)
        if (cfg.notify && rt.interactive) {
          void $.ui.notify(question, { title: `Context at ${percent}%` }).catch(() => undefined)
        }
      }
      const shown = await $.prompt.suggest({ text: handoff ? `update the handoff doc at ${handoff}` : 'write a handoff doc' })
      if (shown.isShown) {
        await recordTier($, sid, entry)
        rt.pending = false
      } else {
        rt.pending = true // keep the tier; retry at the next idle point
        $.ui.log(`context-alert: suggestion not shown at ${percent}% (draft in the box, or headless); will retry`, { to: 'debug' })
      }
      return
    }

    // Dialog. The tier is recorded as it opens and rolled back if the host refuses to open it.
    await recordTier($, sid, entry)
    rt.pending = false
    if (cfg.notify && rt.interactive) {
      void $.ui.notify(question, { title: `Context at ${percent}%` }).catch(() => undefined)
    }
    const opt = dialogOptions(handoff)
    try {
      const answer = await $.ui.ask(question, {
        header: 'Context', options: [opt.thenCompact, opt.only, opt.compact, opt.notNow],
      })
      rt.refusals = 0
      if (answer === opt.thenCompact) action = { kind: 'handoff', thenCompact: true }
      else if (answer === opt.only) action = { kind: 'handoff', thenCompact: false }
      else if (answer === opt.compact) action = { kind: 'compact' }
      else if (answer !== opt.notNow && answer.trim()) action = { kind: 'text', text: answer }
    } catch (err) {
      const failure = classifyAskError(err)
      $.ui.log(
        failure.kind === 'refused'
          ? `context-alert: dialog refused: ${failure.reason}`
          : `context-alert: dialog ended without an answer (${failure.kind}): ${failure.reason}`,
        { to: 'debug' },
      )
      if (failure.kind === 'refused' && rt.refusals < MAX_REFUSALS) {
        rt.refusals++
        await unrecordTier($, sid, entry)
        rt.pending = true
        $.ui.log(`context-alert: dialog refused: ${failure.reason}. Tier rolled back; retry at the next idle point.`)
      }
      return
    }
    }
  } catch {
    // headless (-p), or a host call refused: stay silent
    return
  } finally {
    rt.asking = false
  }

  // The dialog is closed; run the chosen action outside the guard.
  try {
    if (action?.kind === 'auto') await startFlow($, rt, { source: 'auto', path: handoff, force: false, dir })
    else if (action?.kind === 'handoff') {
      // "Handoff, then compact" is the same flow as /handoff-compact (D25), with the agent wait.
      if (action.thenCompact) await startFlow($, rt, { source: 'dialog', path: handoff, force: false })
      else await runHandoff($, handoff)
    }
    else if (action?.kind === 'compact') await compactNow($, rt)
    else if (action?.kind === 'text') await $.prompt.submit({ text: action.text, asUser: true })
  } catch { /* ignore */ }
}
