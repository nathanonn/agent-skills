import type { EngineInterface } from 'claude-code'
import {
  classifyAskError, COMPACT_AFTER_MAX_TURNS, dialogOptions, formatTokens, isBusyStatus, nextThreshold, questionText, rearm, shouldFire,
  type Asked, type Config,
} from './logic'
import { loadConfig, recordTier, unrecordTier, updateSession } from './state'

// The two skill ids are named in full so Claude resolves the project's copy first, then the bundled one.
const NO_PATH_PROMPT =
  'Context is getting heavy, so I want a handoff doc now. Use the skill `handoff-doc` if this project ' +
  'has one, otherwise the bundled skill `context-alert:handoff-doc`. Ask me for the destination path ' +
  'with AskUserQuestion, and recommend one based on this project\'s handoff folder and its naming ' +
  'pattern if it has one.'

const withPathPrompt = (path: string) =>
  `Context is getting heavy, so please update the handoff doc at ${path} now, using the skill ` +
  '`handoff-doc` if this project has one, otherwise the bundled skill `context-alert:handoff-doc`.'

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
   * "Handoff, then compact" is waiting for the handoff turn: `wrote` once a main-thread Write/Edit of a .md
   * lands, `turns` counts main turns ended without one. Cleared on compaction or when it gives up.
   */
  compactAfter?: { wrote: boolean; turns: number }
  /** A compaction this mod started is queued: no dialog until it lands (session.compact) or a main turn starts. */
  compacting: boolean
}

export const MAX_REFUSALS = 3

export const newRuntime = (): Runtime => ({
  mainTurnRunning: false, pending: false, asking: false, interactive: true, backgroundTasks: 0, refusals: 0,
  compacting: false,
})

export type Fill = { percent: number | undefined; tokens: number | undefined; window: number }

export async function getConfig($: EngineInterface, rt: Runtime): Promise<Config> {
  return rt.config ?? (await refreshConfig($, rt))
}

export async function refreshConfig($: EngineInterface, rt: Runtime): Promise<Config> {
  rt.config = await loadConfig($)
  return rt.config
}

/** project skill, then the bundled copy, then a plain prompt. Never throws. */
export async function runHandoff($: EngineInterface, path: string | undefined): Promise<void> {
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
      await $.prompt.submit({ text: withPathPrompt(path), asUser: true })
      return
    }
    // No known path: skip the commands (they need an argument) and let Claude pick the skill and ask for the path.
    $.ui.log('context-alert: handoff via prompt (no known path)')
    await $.prompt.submit({ text: NO_PATH_PROMPT, asUser: true })
  } catch (err) {
    try { $.ui.log(`context-alert: handoff failed: ${String(err)}`) } catch { /* ignore */ }
  }
}

/** /compact queued until idle; on a rejection, session.compact(); then a toast. Never throws. */
export async function compactNow($: EngineInterface, rt?: Runtime): Promise<void> {
  if (rt) rt.compacting = true
  try {
    await $.command.run({ command: 'compact' })
    return
  } catch (err) {
    try { $.ui.log(`context-alert: /compact via command failed: ${String(err)}`, { to: 'debug' }) } catch { /* ignore */ }
  }
  let why: string
  try {
    const result = await $.session.compact()
    if (!result.skip) return
    why = `vetoed: ${result.skip}` // another plugin's hook skipped it
  } catch (err) {
    why = `rejected: ${String(err)}`
  }
  if (rt) rt.compacting = false
  try {
    $.ui.log(`context-alert: session.compact ${why}`)
    $.ui.toast("Compaction couldn't start; run /compact")
  } catch { /* ignore */ }
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
  if (rt.mainTurnRunning) { rt.pending = true; return }
  rt.asking = true // held from the decision through the answer, so two callers cannot both decide
  let action: { kind: 'handoff'; thenCompact: boolean } | { kind: 'compact' } | { kind: 'text'; text: string } | undefined
  let handoff: string | undefined
  try {
    const cfg = await refreshConfig($, rt)
    if (!cfg.enabled) { rt.pending = false; return }
    const fill = given ?? (await currentFill($))
    if (!fill || fill.percent === undefined || fill.tokens === undefined) return
    const { percent, tokens, window } = fill
    const sid = await $.session.id()
    const state = await updateSession($, sid, (s) => rearm(s, cfg, percent, tokens))
    if (!shouldFire(state, cfg, percent, tokens)) { rt.pending = false; return }
    if (rt.mainTurnRunning) { rt.pending = true; return } // a turn began while we looked
    handoff = state.handoff
    const entry: Asked = { pct: percent, tokens, at: await $.clock.now() }
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
  } catch {
    // headless (-p), or a host call refused: stay silent
    return
  } finally {
    rt.asking = false
  }

  // The dialog is closed; run the chosen action outside the guard.
  try {
    if (action?.kind === 'handoff') {
      // Armed before the handoff is queued, so its turn's writes are counted (see afterMainTurn).
      rt.compactAfter = action.thenCompact ? { wrote: false, turns: 0 } : undefined
      await runHandoff($, handoff)
    }
    else if (action?.kind === 'compact') await compactNow($, rt)
    else if (action?.kind === 'text') await $.prompt.submit({ text: action.text, asUser: true })
  } catch { /* ignore */ }
}

/**
 * "Handoff, then compact": called at each main turn.complete. Compacts once a turn that wrote a .md ends
 * normally; gives up on an interrupted or failed turn, or after COMPACT_AFTER_MAX_TURNS turns with no write.
 * Never throws.
 */
export async function afterMainTurn($: EngineInterface, rt: Runtime, ended: { isAborted: boolean; reason: string }): Promise<void> {
  const c = rt.compactAfter
  if (!c) return
  try {
    if (ended.isAborted || ended.reason !== 'answer') {
      rt.compactAfter = undefined
      $.ui.toast('Handoff turn did not finish, so no compaction. Run /compact when ready.')
      return
    }
    if (c.wrote) {
      rt.compactAfter = undefined
      $.ui.toast('Handoff doc written. Compacting.')
      await compactNow($, rt)
      return
    }
    c.turns++
    if (c.turns >= COMPACT_AFTER_MAX_TURNS) {
      rt.compactAfter = undefined
      $.ui.toast('No handoff doc was written, so no compaction. Run /compact when ready.')
    }
  } catch { /* ignore */ }
}
