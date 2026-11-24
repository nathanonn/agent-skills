// Headless tests for autopilot (0.3.0, proposal 07): auto mode, wait-or-go, auto cancel, guardrails, S4, status.
import { test, expect } from 'claude-code/testing'
import {
  afterAutoHandoffPrompt, autoCancelledToast, autoHandoffArgs, autoDoneNotification, autoHandoffPrompt, autoMidTurnToast, autoStartToast,
  continuePrompt, focusInstructions,
} from '../hooks/flow-logic'
import { CYCLE_NOTE, NO_PATH_AUTO_FOCUS } from '../hooks/logic'
import { measure, NOW, settle, turnEnd, turnEndAs, turnStart, typed, world, writeMd, type Dollar, type World } from './world'

const DOC = '/p/handoff/20261124_01_x.md'
const MIN = 60_000
const AUTO = { mode: 'auto' }
const known = { 'session:S1': { asked: [], handoff: DOC, updatedAt: NOW } }
const LOW = { percent: 5, tokens: 50_000 }
const HIGH = { percent: 45, tokens: 450_000 }

const compacts = (w: World) => w.runs.filter((r) => r.command === 'compact')
const prompts = (w: World) => w.submits.map((s) => s.text)
const nudges = (w: World) => w.submits.filter((s) => s.text.startsWith('Continue the work in progress'))
const prompt = ($: Dollar, text: string, origin: Record<string, unknown>, command?: { name: string; args: string }) =>
  $.prompt.submit({ text, origin, wait: false, ...(command ? { command } : {}) } as never)
const clear = ($: Dollar) => $.session.end({ reason: 'clear', sessionId: 'S1', resume: {} } as never)
const landsAs = ($: Dollar, trigger: string, instructions?: string, agentId?: string) =>
  $.session.compact({
    trigger, instructions, ...(agentId ? { agentId } : {}), messages: [{ role: 'user', text: 'hi', toolUses: [] }],
  } as never)
const compactLands = ($: Dollar, instructions?: string) => landsAs($, 'manual', instructions)
const flowsStarted = (w: World) => w.logs.filter((l) => l.includes('handoff-compact flow started (auto)')).length
const session = (w: World) => w.store.get('session:S1') as { autoStarts?: number[]; paused?: boolean; autoHeld?: boolean; asked: unknown[] }

/** The main-thread handoff turn: it writes the doc and ends normally. */
async function handoffTurn($: Dollar, w: World, path = DOC): Promise<void> {
  await turnStart($)
  await writeMd($, path)
  await turnEnd($)
  await settle(w)
}
async function plainTurn($: Dollar, w: World): Promise<void> {
  await turnStart($)
  await turnEnd($)
  await settle(w)
}
/** A crossing in auto mode, idle: the flow starts. */
async function cross($: Dollar, w: World, percent = 45, tokens = 450_000): Promise<void> {
  await measure($, percent, tokens)
  await settle(w)
}

// ---- S1: auto mode ----

test('auto: a crossing at an idle point starts the flow with no dialog, toast says how to cancel', async ($, on) => {
  const w = world($, on, { store: { config: AUTO } })
  await cross($, w)
  expect(w.asks.length).toBe(0)
  expect(w.toasts).toContain(autoStartToast(45, 450_000))
  expect(w.toasts[0]).toContain('Type anything to cancel')
  expect(w.logs.some((l) => l.includes('handoff-compact flow started (auto)'))).toBe(true)
  expect(w.submits.length).toBe(1)
  const stored = session(w)
  expect(stored.asked.length).toBe(1)
  expect(stored.autoStarts).toEqual([NOW])
})

test('auto: no agents: doc written, compaction goes with focus on the doc, notification names the doc', async ($, on) => {
  const w = world($, on, { store: { config: AUTO } })
  await cross($, w)
  await handoffTurn($, w)
  expect(compacts(w)).toEqual([{ command: 'compact', args: focusInstructions(DOC) }])
  expect(w.notifies.length).toBe(0) // the notification is for the landing
  w.tokensAfter = 50_000
  await compactLands($, focusInstructions(DOC))
  await settle(w)
  expect(w.notifies).toEqual([{ text: autoDoneNotification(DOC, 0), title: 'Auto handoff-compact done' }])
  expect(w.notifies[0]!.text).toContain('…/handoff/20261124_01_x.md')
  expect(w.logs.some((l) => l.includes(`auto cycle: path ${DOC}, waited no, agents left running 0, why no agents`))).toBe(true)
  expect(w.logs.filter((l) => l.includes('auto cycle:')).length).toBe(1)
  expect(nudges(w).length).toBe(1) // the continue prompt follows (D15 tiers reset)
  expect((session(w).asked as unknown[]).length).toBe(0)
})

test('auto: notify off sends no end-of-cycle notification', async ($, on) => {
  const w = world($, on, { store: { config: { ...AUTO, notify: false } } })
  await cross($, w)
  await handoffTurn($, w)
  w.tokensAfter = 50_000
  await compactLands($, focusInstructions(DOC))
  await settle(w)
  expect(w.notifies.length).toBe(0)
})

test('auto: known path goes through the /handoff-doc command, like a dialog flow', async ($, on) => {
  const w = world($, on, { store: { ...known, config: AUTO } })
  await cross($, w)
  expect(w.runs).toEqual([{ command: 'handoff-doc', args: autoHandoffArgs(DOC) }])
  await handoffTurn($, w)
  expect(compacts(w)[0]!.args).toBe(focusInstructions(DOC))
})

test('F1: the auto command chain carries the no-question directive, with the path first (and quoted when it has spaces)', async ($, on) => {
  const w = world($, on, { store: { ...known, config: AUTO } })
  await cross($, w)
  const args = w.runs[0]!.args
  expect(args.startsWith(`${DOC} `)).toBe(true)
  expect(args).toContain('Do not ask me anything')
  expect(args).toContain('AskUserQuestion')
  expect(args).toContain('write a sequel')
  expect(autoHandoffArgs('/p/my docs/h.md').startsWith('"/p/my docs/h.md" ')).toBe(true)
})

test('F1: the manual and dialog chains keep the bare path', async ($, on) => {
  const w = world($, on, { store: known })
  await typed($, 'handoff-compact', '')
  await settle(w)
  expect(w.runs).toEqual([{ command: 'handoff-doc', args: DOC }])
})

test('auto: known path, no handoff-doc command: the prompt is the known-path wording without questions', async ($, on) => {
  const w = world($, on, { store: { ...known, config: AUTO }, refuse: ['handoff-doc', 'context-alert:handoff-doc'] })
  await cross($, w)
  expect(prompts(w)).toEqual([autoHandoffPrompt(DOC)])
  expect(prompts(w)[0]).toContain('write the handoff doc for this session')
  expect(prompts(w)[0]).toContain('Do not ask me anything')
})

test('S5: no path: the prompt never asks, names the folder rule, the default folder and the skills', async ($, on) => {
  const w = world($, on, { store: { config: AUTO } })
  await cross($, w)
  const text = prompts(w)[0]!
  expect(text).toBe(autoHandoffPrompt(undefined, ''))
  expect(text).toContain('Do not ask me anything: pick the path yourself.')
  expect(text).toContain('create ./handoff/YYYYMMDD_01_<short-slug>.md')
  expect(text).toContain('write a sequel')
  expect(text).toContain('context-alert:handoff-doc')
  expect(text).not.toContain('AskUserQuestion')
})

test('S5: handoffDir is the fallback folder, with or without a trailing slash', async ($, on) => {
  const w = world($, on, { store: { config: { ...AUTO, handoffDir: '/p/notes' } } })
  await cross($, w)
  expect(prompts(w)[0]).toContain('create /p/notes/YYYYMMDD_01_<short-slug>.md')
  expect(autoHandoffPrompt(undefined, '/p/notes/')).toContain('create /p/notes/YYYYMMDD_01_')
})

test('S5: the manual command keeps asking for a path (D18), even in auto mode', async ($, on) => {
  const w = world($, on, { store: { config: AUTO } })
  await typed($, 'handoff-compact', '')
  await settle(w)
  expect(prompts(w)[0]).toContain('AskUserQuestion')
})

test('S5: the dialog\'s handoff keeps asking for a path (D18)', async ($, on) => {
  const d = world($, on, { answer: 'Handoff, then compact' })
  await measure($, 41, 410_000)
  await settle(d)
  expect(d.submits[0]!.text).toContain('AskUserQuestion')
})

test('auto: a crossing mid-turn waits for the turn end; the tool-call toast says so', async ($, on) => {
  const w = world($, on, { store: { config: AUTO }, usage: HIGH })
  await turnStart($)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await measure($, 45, 450_000)
  await settle(w)
  expect(w.toasts).toEqual([autoMidTurnToast(45, 450_000)])
  expect(w.toasts[0]).toContain('Auto handoff-compact runs when this turn ends.')
  expect(w.submits.length).toBe(0)
  await turnEnd($)
  await settle(w)
  expect(w.toasts).toContain(autoStartToast(45, 450_000))
  expect(w.submits.length).toBe(1)
  expect(w.asks.length).toBe(0)
})

test('ask mode keeps the old mid-turn toast and the dialog', async ($, on) => {
  const w = world($, on, { usage: HIGH })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await settle(w)
  expect(w.toasts[0]).toContain('A handoff prompt follows when this turn ends.')
  await measure($, 45, 450_000)
  await settle(w)
  expect(w.asks.length).toBe(1)
})

test('auto: re-arming and tiers are as before: same tier once, next tier after +15 points', async ($, on) => {
  const w = world($, on, { store: { config: { ...AUTO, maxCycles: 0 } } })
  await cross($, w, 45, 450_000)
  await cross($, w, 48, 480_000) // the flow holds the alert, same tier anyway
  expect(w.submits.length).toBe(1)
  const s = session(w)
  expect(s.asked.length).toBe(1)
})

test('auto: whenBusy suggest is ignored in auto mode (the flow waits for agents itself)', async ($, on) => {
  const w = world($, on, { store: { config: { ...AUTO, whenBusy: 'suggest' } }, agents: [{ id: 'a', status: 'running' }] })
  await cross($, w)
  expect(w.suggests.length).toBe(0)
  expect(w.submits.length).toBe(1)
})

test('auto: never in a non-interactive run: no flow, no auto prompt', async ($, on) => {
  const w = world($, on, { store: { config: AUTO } })
  await $.session.start({ cwd: '/', surface: null, isInteractive: false })
  await settle(w)
  await cross($, w)
  expect(w.submits.length).toBe(0)
  expect(w.toasts.some((t) => t.includes('Auto handoff-compact'))).toBe(false)
  expect(w.logs.some((l) => l.includes('flow started'))).toBe(false)
  expect(session(w).autoStarts ?? []).toEqual([])
})

test('mode off: no alert, no toast, no auto; /handoff-compact still works', async ($, on) => {
  const w = world($, on, { store: { config: { mode: 'off' } }, usage: HIGH })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await cross($, w)
  expect(w.asks.length + w.submits.length + w.toasts.length).toBe(0)
  await typed($, 'handoff-compact', '')
  await settle(w)
  expect(w.submits.length).toBe(1)
})

// ---- S2: wait or go ----

const busy = [{ id: 'x', status: 'running', description: 'build the thing' }]

test('S2 row 1: no agent busy: compact', async ($, on) => {
  const w = world($, on, { store: { config: AUTO }, autoCompactThreshold: 500_000, usage: HIGH })
  await cross($, w)
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(1)
  expect(w.breakdownCalls).toBe(0) // no need to read the room when nobody is busy
})

test('S2 row 2: agent busy, room under reserve: compact now with the agent named in the focus (auto flow)', async ($, on) => {
  const w = world($, on, { store: { config: AUTO }, agents: busy, autoCompactThreshold: 500_000, usage: HIGH })
  await cross($, w)
  await handoffTurn($, w) // room = 500k - 450k = 50k < 80k
  expect(compacts(w)).toEqual([{ command: 'compact', args: focusInstructions(DOC, ['build the thing']) }])
  expect(compacts(w)[0]!.args).toContain('Agents still running: build the thing. Their reports arrive after the compaction.')
  expect(w.logs.some((l) => l.includes('agents left running 1, why room'))).toBe(true)
  w.tokensAfter = 50_000
  await compactLands($, compacts(w)[0]!.args)
  await settle(w)
  expect(w.notifies.map((n) => n.text)).toEqual([autoDoneNotification(DOC, 1)])
  expect(w.notifies[0]!.text).toContain('1 agent still running')
  expect(nudges(w).length).toBe(0) // the agent's report wakes the session
})

test('S2 row 2 applies to the manual command too (reserve is for all flows)', async ($, on) => {
  const w = world($, on, { store: known, agents: busy, autoCompactThreshold: 500_000, usage: HIGH })
  await typed($, 'handoff-compact', '')
  await settle(w)
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(1)
  expect(compacts(w)[0]!.args).toBe(focusInstructions(DOC, ['build the thing']))
})

test('S2 row 2 applies to the dialog flow too', async ($, on) => {
  const w = world($, on, { store: known, answer: 'Update handoff, then compact', agents: busy, autoCompactThreshold: 500_000, usage: HIGH })
  await measure($, 45, 450_000)
  await settle(w)
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(1)
})

test('S2 row 3: agent busy, room above reserve: keep waiting (no compaction, one toast)', async ($, on) => {
  const w = world($, on, { store: { config: AUTO }, agents: busy, autoCompactThreshold: 900_000, usage: HIGH })
  await cross($, w)
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(0)
  expect(w.toasts.filter((t) => t.startsWith('Waiting for 1 agent')).length).toBe(1)
  expect(w.breakdownCalls).toBeGreaterThan(0)
})

test('S2: reserve 0 is no check, even with almost no room', async ($, on) => {
  const w = world($, on, { store: { config: { ...AUTO, reserve: 0 } }, agents: busy, autoCompactThreshold: 460_000, usage: HIGH })
  await cross($, w)
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(0)
})

test('S2: auto-compact off (no threshold): the room check is skipped, never assumed none', async ($, on) => {
  const a = world($, on, { store: { config: AUTO }, agents: busy, usage: HIGH })
  await cross($, a)
  await handoffTurn($, a)
  expect(compacts(a).length).toBe(0)
  expect(a.breakdownCalls).toBeGreaterThan(0)
})

test('S2: an unreadable usage breakdown: the room check is skipped too', async ($, on) => {
  const b = world($, on, { store: { config: AUTO }, agents: busy, autoCompactThreshold: 500_000, usage: HIGH })
  b.breakdownFails = true
  await cross($, b)
  await handoffTurn($, b)
  expect(compacts(b).length).toBe(0)
})

test('S2 row 4: an auto flow that waited maxWait compacts with agents running (the timer fires)', async ($, on) => {
  const w = world($, on, { store: { config: { ...AUTO, maxWait: 1 } }, agents: busy })
  await cross($, w)
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(0)
  await w.clock.advance(MIN - 1)
  await settle(w)
  expect(compacts(w).length).toBe(0)
  await w.clock.advance(1)
  await settle(w)
  expect(compacts(w)).toEqual([{ command: 'compact', args: focusInstructions(DOC, ['build the thing']) }])
  expect(w.logs.some((l) => l.includes('agents left running 1, why maxWait'))).toBe(true)
  expect(w.logs.some((l) => l.includes('waited yes'))).toBe(true)
})

test('S2: the default maxWait is 20 minutes', async ($, on) => {
  const w = world($, on, { store: { config: AUTO }, agents: busy })
  await cross($, w)
  await handoffTurn($, w)
  await w.clock.advance(19 * MIN)
  await settle(w)
  expect(compacts(w).length).toBe(0)
  await w.clock.advance(MIN)
  await settle(w)
  expect(compacts(w).length).toBe(1)
})

test('S2: maxWait 0 is no limit: no timer, the flow keeps waiting', async ($, on) => {
  const w = world($, on, { store: { config: { ...AUTO, maxWait: 0 } }, agents: busy })
  await cross($, w)
  await handoffTurn($, w)
  await w.clock.advance(600 * MIN)
  await settle(w)
  expect(compacts(w).length).toBe(0)
})

test('S2: manual and dialog flows have no maxWait timer (D22)', async ($, on) => {
  const w = world($, on, { store: { ...known, config: { maxWait: 1 } }, agents: busy })
  await typed($, 'handoff-compact', '')
  await settle(w)
  await handoffTurn($, w)
  await w.clock.advance(120 * MIN)
  await settle(w)
  expect(compacts(w).length).toBe(0)
})

test('S2: the timer is cancelled when the flow ends: agents finish, fold-in, compact; the timer then does nothing', async ($, on) => {
  const w = world($, on, { store: { config: { ...AUTO, maxWait: 5 } }, agents: busy })
  await cross($, w)
  await handoffTurn($, w)
  w.agents[0]!.status = 'completed'
  await plainTurn($, w) // an agent report's turn: folded in
  await plainTurn($, w) // the fold-in turn ends: compact
  expect(compacts(w).length).toBe(1)
  await w.clock.advance(30 * MIN)
  await settle(w)
  expect(compacts(w).length).toBe(1)
  expect(w.logs.some((l) => l.includes('timer fired after the flow ended'))).toBe(false)
})

test('S2: the timer is cancelled when the person cancels the flow', async ($, on) => {
  const w = world($, on, { store: { config: { ...AUTO, maxWait: 5 } }, agents: busy })
  await cross($, w)
  await handoffTurn($, w)
  await prompt($, 'wait, one more thing', { kind: 'composer' })
  await settle(w)
  await w.clock.advance(30 * MIN)
  await settle(w)
  expect(compacts(w).length).toBe(0)
  expect(w.logs.some((l) => l.includes('timer fired after the flow ended'))).toBe(false)
})

for (const how of ['compaction', 'clear', 'pause'] as const) {
  test(`S2: the timer is cancelled when the flow ends by ${how}`, async ($, on) => {
    const w = world($, on, { store: { config: { ...AUTO, maxWait: 5 } }, agents: busy })
    await cross($, w)
    await handoffTurn($, w)
    if (how === 'compaction') await landsAs($, 'auto')
    else if (how === 'clear') await clear($)
    else await typed($, 'context-alert', 'pause')
    await settle(w)
    await w.clock.advance(30 * MIN)
    await settle(w)
    expect(compacts(w).length).toBe(0)
    expect(w.logs.some((l) => l.includes('timer fired after the flow ended'))).toBe(false)
  })
}

test('S2: maxWait reached while a turn runs waits for that turn to end', async ($, on) => {
  const w = world($, on, { store: { config: { ...AUTO, maxWait: 1 } }, agents: busy })
  await cross($, w)
  await handoffTurn($, w)
  await turnStart($) // an agent report's turn is running when the timer fires
  await w.clock.advance(MIN)
  await settle(w)
  expect(compacts(w).length).toBe(0)
  expect(w.logs.some((l) => l.includes('maxWait reached; checking when the running turn ends'))).toBe(true)
  await turnEnd($)
  await settle(w)
  expect(compacts(w).length).toBe(1)
})

test('S2: agents finishing before maxWait: all done, no agent left, timer irrelevant', async ($, on) => {
  const w = world($, on, { store: { config: { ...AUTO, maxWait: 5 } }, agents: busy })
  await cross($, w)
  await handoffTurn($, w)
  w.agents[0]!.status = 'completed'
  await plainTurn($, w)
  await plainTurn($, w)
  expect(compacts(w)[0]!.args).toBe(focusInstructions(DOC))
  expect(w.logs.some((l) => l.includes('agents left running 0, why all done'))).toBe(true)
})

// ---- S1: auto cancel ----

test('auto cancel: a typed message while writing cancels; the doc turn ends with no compaction; the tier stays used', async ($, on) => {
  const w = world($, on, { store: { config: AUTO } })
  await cross($, w)
  await prompt($, 'hold on', { kind: 'composer' })
  await settle(w)
  expect(w.toasts).toContain(autoCancelledToast('60%', true))
  expect(autoCancelledToast('60%', true)).toContain('The handoff doc may still be written.')
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(0)
  expect(session(w).asked.length).toBe(1)
  await cross($, w, 46, 460_000)
  expect(flowsStarted(w)).toBe(1) // same tier: no second cycle
})

test('auto cancel: a Remote Control message while waiting cancels; a later finish does not compact', async ($, on) => {
  const w = world($, on, { store: { config: AUTO }, agents: busy })
  await cross($, w)
  await handoffTurn($, w)
  await prompt($, 'hi from the phone', { kind: 'bridge' })
  await settle(w)
  expect(w.toasts).toContain(autoCancelledToast('60%')) // waiting phase: nothing is left to write
  w.agents[0]!.status = 'completed'
  await plainTurn($, w)
  expect(compacts(w).length).toBe(0)
})

test('auto cancel: slash commands, agent reports and plugin prompts do not cancel, in either phase', async ($, on) => {
  const w = world($, on, { store: { config: AUTO }, agents: busy })
  await cross($, w)
  await prompt($, '/context-alert status', { kind: 'composer' }, { name: 'context-alert', args: 'status' })
  await prompt($, 'task done', { kind: 'task-notification' })
  await prompt($, 'from another plugin', { kind: 'plugin', name: 'other' })
  await settle(w)
  expect(w.toasts.some((t) => t.includes('cancelled'))).toBe(false)
  await handoffTurn($, w)
  await prompt($, '/context-alert status', { kind: 'composer' }, { name: 'context-alert', args: 'status' })
  await settle(w)
  expect(w.toasts.some((t) => t.includes('cancelled'))).toBe(false)
})

test('a manual flow still cancels only while waiting: a typed message while writing does not (D22)', async ($, on) => {
  const w = world($, on, { store: known })
  await typed($, 'handoff-compact', '')
  await settle(w)
  await prompt($, 'answering Claude', { kind: 'composer' })
  await settle(w)
  expect(w.toasts.some((t) => t.includes('cancelled'))).toBe(false)
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(1)
})

test('auto: Esc during the handoff turn ends the flow with the usual toast', async ($, on) => {
  const w = world($, on, { store: { config: AUTO } })
  await cross($, w)
  await turnStart($)
  await turnEndAs($, 'aborted')
  await settle(w)
  expect(w.toasts.some((t) => t.startsWith('Handoff turn did not finish'))).toBe(true)
  expect(compacts(w).length).toBe(0)
})

test('auto: switching mode away from auto stops the running auto flow', async ($, on) => {
  const w = world($, on, { store: { config: AUTO } })
  await cross($, w)
  await typed($, 'context-alert', 'set mode ask')
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(0)
})

// ---- S6: guardrails ----

test('cycle cap: maxCycles reached in the window: the crossing opens the dialog with the toast', async ($, on) => {
  const w = world($, on, { store: { config: { ...AUTO, maxCycles: 1 } } })
  await cross($, w)
  await handoffTurn($, w)
  w.tokensAfter = 50_000
  await compactLands($, focusInstructions(DOC))
  await settle(w)
  await cross($, w) // second crossing, same window
  expect(w.toasts).toContain(CYCLE_NOTE(1, 60))
  expect(CYCLE_NOTE(1, 60)).toBe('Auto paused: 1 cycle in the last 60 min.')
  expect(w.asks.length).toBe(1)
  expect(w.toasts.filter((t) => t.includes('Auto handoff-compact: writing')).length).toBe(1)
})

test('cycle cap: the window slides: after cycleWindow minutes auto runs again', async ($, on) => {
  const w = world($, on, { store: { config: { ...AUTO, maxCycles: 1, cycleWindow: 30 } } })
  await cross($, w)
  await handoffTurn($, w)
  w.tokensAfter = 50_000
  await compactLands($, focusInstructions(DOC))
  await settle(w)
  await w.clock.advance(31 * MIN)
  const before = w.toasts.filter((t) => t.includes('writing the handoff doc')).length
  await cross($, w)
  expect(w.toasts.filter((t) => t.includes('writing the handoff doc')).length).toBe(before + 1)
  expect(w.asks.length).toBe(0)
})

test('cycle cap: maxCycles 0 is no cap', async ($, on) => {
  const free = world($, on, { store: { config: { ...AUTO, maxCycles: 0 } } })
  for (let i = 0; i < 5; i++) {
    await cross($, free)
    await handoffTurn($, free)
    free.tokensAfter = 50_000
    await compactLands($, focusInstructions(DOC))
    await settle(free)
  }
  expect(free.asks.length).toBe(0)
  expect(session(free).autoStarts!.length).toBe(5)
})

test('cycle cap: the default is 3 cycles per 60 minutes', async ($, on) => {
  const capped = world($, on, { store: { config: AUTO } })
  for (let i = 0; i < 3; i++) {
    await cross($, capped)
    await handoffTurn($, capped)
    capped.tokensAfter = 50_000
    await compactLands($, focusInstructions(DOC))
    await settle(capped)
  }
  expect(capped.asks.length).toBe(0)
  await cross($, capped)
  expect(capped.asks.length).toBe(1)
  expect(capped.toasts).toContain(CYCLE_NOTE(3, 60))
})

test('loop breaker: a compaction that leaves the fill past the first threshold holds auto until it drops', async ($, on) => {
  const w = world($, on, { store: { config: AUTO } })
  await cross($, w)
  await handoffTurn($, w)
  w.tokensAfter = 450_000 // the summary did not help
  await compactLands($, focusInstructions(DOC))
  await settle(w)
  expect(w.toasts).toContain('Compaction left context at 45%; auto handoff paused.')
  expect(w.notifies.some((n) => n.text === 'Compaction left context at 45%; auto handoff paused.')).toBe(true)
  expect(session(w).autoHeld).toBe(true)
  await cross($, w) // crossings meanwhile use the dialog
  expect(w.asks.length).toBe(1)
  expect(flowsStarted(w)).toBe(1) // only the first cycle's
  await measure($, 5, 50_000) // the fill drops below the first threshold: the hold lifts
  await settle(w)
  expect(session(w).autoHeld).toBeUndefined()
  await cross($, w)
  expect(w.asks.length).toBe(1)
  expect(flowsStarted(w)).toBe(2)
})

test('loop breaker: a fill that is unknown right after the compaction is read at the next measure', async ($, on) => {
  const w = world($, on, { store: { config: AUTO } })
  await cross($, w)
  await handoffTurn($, w)
  w.tokensAfter = undefined
  await compactLands($, focusInstructions(DOC))
  await settle(w)
  expect(session(w).autoHeld).toBeUndefined()
  expect(w.logs.some((l) => l.includes('loop check: size after the compaction unknown'))).toBe(true)
  await cross($, w, 46, 460_000) // the first figures after the compaction are still past the first threshold
  expect(session(w).autoHeld).toBe(true)
  expect(w.toasts).toContain('Compaction left context at 46%; auto handoff paused.')
  expect(w.asks.length).toBe(1)
})

test('loop breaker: a good compaction (fill below the first threshold) holds nothing', async ($, on) => {
  const w = world($, on, { store: { config: AUTO } })
  await cross($, w)
  await handoffTurn($, w)
  w.tokensAfter = 50_000
  await compactLands($, focusInstructions(DOC))
  await settle(w)
  expect(session(w).autoHeld).toBeUndefined()
  await measure($, 6, 60_000)
  await settle(w)
  expect(w.toasts.some((t) => t.includes('auto handoff paused'))).toBe(false)
})

test('pause: no alerts and no auto cycles; resume brings them back and an alert due fires', async ($, on) => {
  const w = world($, on, { store: { config: AUTO }, usage: HIGH })
  const r = await typed($, 'context-alert', 'pause')
  expect(r.text).toContain('Paused')
  expect(session(w).paused).toBe(true)
  await cross($, w)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await settle(w)
  expect(w.asks.length + w.submits.length + w.toasts.length).toBe(0)
  const status = await typed($, 'context-alert', 'status')
  expect(status.text).toContain('Auto: paused')
  const back = await typed($, 'context-alert', 'resume')
  expect(back.text).toContain('Resumed')
  await settle(w)
  expect(session(w).paused).toBeUndefined()
  expect(w.toasts).toContain(autoStartToast(45, 450_000))
  expect(w.submits.length).toBe(1)
})

test('pause also stops alerts in ask mode, and the pause persists in the session store', async ($, on) => {
  const w = world($, on)
  await typed($, 'context-alert', 'pause')
  await measure($, 90, 900_000)
  await settle(w)
  expect(w.asks.length).toBe(0)
  await typed($, 'context-alert', 'resume')
  await measure($, 90, 900_000)
  await settle(w)
  expect(w.asks.length).toBe(1)
})

test('pause stops a running auto flow; a manual /handoff-compact still works while paused', async ($, on) => {
  const w = world($, on, { store: { config: AUTO } })
  await cross($, w)
  await typed($, 'context-alert', 'pause')
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(0)
  await typed($, 'handoff-compact', '')
  await settle(w)
  await handoffTurn($, w, '/p/handoff/b.md')
  expect(compacts(w).length).toBe(1)
})

test('resume also lets go of the loop breaker hold; pause and resume take no arguments', async ($, on) => {
  const w = world($, on, { store: { config: AUTO, 'session:S1': { asked: [], autoHeld: true, updatedAt: NOW } } })
  const r = await typed($, 'context-alert', 'resume now')
  expect(r.text).toContain('Usage:')
  await typed($, 'context-alert', 'resume')
  expect(session(w).autoHeld).toBeUndefined()
})

// ---- S4: Claude Code's own auto-compaction ----

const compactFor = (w: World) => w.compactInstructions[w.compactInstructions.length - 1]

test('S4 rewrite: an auto-compaction with a known path gets the doc focus', async ($, on) => {
  const w = world($, on, { store: known })
  await landsAs($, 'auto')
  expect(compactFor(w)).toBe(focusInstructions(DOC))
  expect(w.logs.some((l) => l.includes('auto-compaction focus added (path known)'))).toBe(true)
})

test('S4 rewrite: no known path: keep the work in progress', async ($, on) => {
  const w = world($, on)
  await landsAs($, 'auto')
  expect(compactFor(w)).toBe(NO_PATH_AUTO_FOCUS)
  expect(NO_PATH_AUTO_FOCUS).toBe('Keep the work in progress, the decisions made and the open follow-ups in the summary.')
})

test('S4 rewrite: appended to instructions already there', async ($, on) => {
  const w = world($, on, { store: known })
  await landsAs($, 'auto', 'focus on the tests')
  expect(compactFor(w)).toBe(`focus on the tests\n\n${focusInstructions(DOC)}`)
})

for (const mode of ['ask', 'off']) {
  test(`S4 rewrite: any mode (${mode} too)`, async ($, on) => {
    const w = world($, on, { store: { ...known, config: { mode } } })
    await landsAs($, 'auto')
    expect(compactFor(w)).toBe(focusInstructions(DOC))
  })
}

test('S4 rewrite: focusAutoCompact off leaves the instructions alone', async ($, on) => {
  const w = world($, on, { store: { ...known, config: { focusAutoCompact: false } } })
  await landsAs($, 'auto')
  expect(compactFor(w)).toBeUndefined()
  await landsAs($, 'auto', 'mine')
  expect(compactFor(w)).toBe('mine')
})

test('S4 rewrite: not for manual, plugin or precompute triggers, and not for sub-agents', async ($, on) => {
  const w = world($, on, { store: known })
  await landsAs($, 'manual')
  expect(compactFor(w)).toBeUndefined()
  await landsAs($, 'manual', 'typed')
  expect(compactFor(w)).toBe('typed')
  await landsAs($, 'plugin', 'other plugin')
  expect(compactFor(w)).toBe('other plugin')
  await landsAs($, 'precompute')
  expect(compactFor(w)).toBeUndefined()
  await landsAs($, 'auto', undefined, 'sub1')
  expect(compactFor(w)).toBeUndefined()
})

test('S4 rewrite: never vetoes (the compaction goes ahead)', async ($, on) => {
  const w = world($, on, { store: known })
  const r = await landsAs($, 'auto')
  expect((r as { skip?: string }).skip).toBeUndefined()
})

test('S4 rewrite: the focus text of the rewrite does not make a stale continue intent match', async ($, on) => {
  const w = world($, on, { store: { ...known } }) // ask mode: no S4 after-prompt either
  await typed($, 'handoff-compact', '')
  await settle(w)
  await handoffTurn($, w) // the flow's /compact is queued, then silently lost
  await landsAs($, 'auto')
  await settle(w)
  expect(nudges(w).length).toBe(0)
})

test('S4 after: auto mode, idle, no handoff since the last compaction: the handoff prompt, counted as a cycle', async ($, on) => {
  const w = world($, on, { store: { ...known, config: AUTO } })
  await landsAs($, 'auto')
  await settle(w)
  expect(prompts(w)).toEqual([afterAutoHandoffPrompt(DOC, '')])
  expect(prompts(w)[0]).toContain('Then continue the work in progress.')
  expect(prompts(w)[0]).toContain('Do not ask me anything')
  expect(session(w).autoStarts!.length).toBe(1)
  expect(w.logs.some((l) => l.includes("auto cycle (after Claude Code's auto-compaction): handoff prompt sent"))).toBe(true)
  expect(w.notifies.length).toBe(1)
})

test('S4 after: no known path uses the no-question path rules and handoffDir', async ($, on) => {
  const w = world($, on, { store: { config: { ...AUTO, handoffDir: '/p/notes' } } })
  await landsAs($, 'auto')
  await settle(w)
  expect(prompts(w)).toEqual([afterAutoHandoffPrompt(undefined, '/p/notes')])
  expect(prompts(w)[0]).toContain('pick the path yourself')
  expect(prompts(w)[0]).toContain('/p/notes/YYYYMMDD_01_')
})

test('S4 after: mid-turn (the usual case) it is queued and sent at the turn end, not before', async ($, on) => {
  const w = world($, on, { store: { ...known, config: AUTO } })
  await turnStart($)
  await landsAs($, 'auto')
  await settle(w)
  expect(prompts(w).length).toBe(0)
  expect(w.logs.some((l) => l.includes('queued for the end of this turn'))).toBe(true)
  await turnEnd($)
  await settle(w)
  expect(prompts(w)).toEqual([afterAutoHandoffPrompt(DOC, '')])
})

test('S4 after: an alert waits behind the queued prompt (no dialog or auto flow in between)', async ($, on) => {
  const w = world($, on, { store: { ...known, config: AUTO }, usage: HIGH })
  await turnStart($)
  await landsAs($, 'auto')
  await settle(w)
  await measure($, 45, 450_000) // mid-turn: pending
  await turnEnd($)
  await settle(w)
  expect(prompts(w).length).toBe(1)
  expect(prompts(w)[0]).toBe(afterAutoHandoffPrompt(DOC, ''))
  expect(w.asks.length).toBe(0)
})

test('S4 after: a handoff written since the last compaction: the continue prompt instead', async ($, on) => {
  const w = world($, on, { store: { config: AUTO } })
  await turnStart($)
  await writeMd($, '/p/handoff/20261124_02_y.md')
  await settle(w)
  await landsAs($, 'auto')
  await turnEnd($)
  await settle(w)
  expect(prompts(w)).toEqual([continuePrompt('/p/handoff/20261124_02_y.md')])
  expect(session(w).autoStarts!.length).toBe(1)
})

test('S4 after: every landed compaction clears "handoff since": the next auto-compaction asks for a doc again', async ($, on) => {
  const w = world($, on, { store: { ...known, config: AUTO } })
  await turnStart($)
  await writeMd($, DOC)
  await settle(w)
  await landsAs($, 'auto')
  await turnEnd($)
  await settle(w)
  expect(prompts(w)).toEqual([continuePrompt(DOC)])
  await landsAs($, 'auto')
  await settle(w)
  expect(prompts(w)[1]).toBe(afterAutoHandoffPrompt(DOC, ''))
})

test('S4 after: a flow\'s own .md write counts as a handoff since the last compaction', async ($, on) => {
  const w = world($, on, { store: { config: AUTO }, agents: busy })
  await cross($, w)
  await handoffTurn($, w, '/p/docs/notes.md') // a doc outside handoff/, written in the flow
  await landsAs($, 'auto') // Claude Code compacts first
  await settle(w)
  expect(prompts(w).filter((t) => t.startsWith('Continue the work')).length).toBe(1)
})

for (const [name, config] of [['ask mode', { mode: 'ask' }], ['off mode', { mode: 'off' }], ['afterAutoCompact off', { ...AUTO, afterAutoCompact: false }]] as const) {
  test(`S4 after: none in ${name}`, async ($, on) => {
    const w = world($, on, { store: { ...known, config } })
    await landsAs($, 'auto')
    await settle(w)
    expect(prompts(w).length).toBe(0)
  })
}

test('S4 after: only for Claude Code\'s auto trigger (not manual, plugin, precompute, sub-agent)', async ($, on) => {
  const w = world($, on, { store: { ...known, config: AUTO } })
  await landsAs($, 'manual')
  await landsAs($, 'plugin')
  await landsAs($, 'precompute')
  await landsAs($, 'auto', undefined, 'sub1')
  await settle(w)
  expect(prompts(w).length).toBe(0)
})

const base = { ...known['session:S1'] }
const guards: [string, Record<string, unknown>, Record<string, unknown>][] = [
  ['paused', { config: AUTO }, { paused: true }],
  ['held by the loop breaker', { config: AUTO }, { autoHeld: true }],
  ['the cycle cap reached', { config: { ...AUTO, maxCycles: 1 } }, { autoStarts: [NOW - MIN] }],
]
for (const [name, cfgStore, state] of guards) {
  test(`S4 after: none when ${name}`, async ($, on) => {
    const w = world($, on, { store: { ...cfgStore, 'session:S1': { ...base, ...state } } })
    await landsAs($, 'auto')
    await settle(w)
    expect(prompts(w).length).toBe(0)
  })
}

test('S4 after: none in a headless run', async ($, on) => {
  const h = world($, on, { store: { ...known, config: AUTO } })
  await $.session.start({ cwd: '/', surface: null, isInteractive: false })
  await settle(h)
  await landsAs($, 'auto')
  await settle(h)
  expect(prompts(h).length).toBe(0)
})

test('S4 after: the cap toast shows when the cap blocks it', async ($, on) => {
  const w = world($, on, { store: { config: { ...AUTO, maxCycles: 1 }, 'session:S1': { asked: [], autoStarts: [NOW - MIN], updatedAt: NOW } } })
  await landsAs($, 'auto')
  await settle(w)
  expect(w.toasts).toContain(CYCLE_NOTE(1, 60))
})

test('S4 after: dropped when the queued turn is interrupted', async ($, on) => {
  const a = world($, on, { store: { ...known, config: AUTO } })
  await turnStart($)
  await landsAs($, 'auto')
  await settle(a)
  await turnEndAs($, 'aborted')
  await settle(a)
  expect(prompts(a).length).toBe(0)
})

test('S4 after: dropped on /clear', async ($, on) => {
  const b = world($, on, { store: { ...known, config: AUTO } })
  await turnStart($)
  await landsAs($, 'auto')
  await settle(b)
  await clear($)
  await turnEnd($)
  await settle(b)
  expect(prompts(b).length).toBe(0)
})

test('S4 after: dropped when another compaction lands first (it belonged to the one before)', async ($, on) => {
  const c = world($, on, { store: { ...known, config: { ...AUTO, maxCycles: 0 } } })
  await turnStart($)
  await landsAs($, 'auto')
  await settle(c)
  await landsAs($, 'manual')
  await turnEnd($)
  await settle(c)
  expect(prompts(c).length).toBe(0)
})

test('S4 after: pause while it is queued drops it', async ($, on) => {
  const w = world($, on, { store: { ...known, config: AUTO } })
  await turnStart($)
  await landsAs($, 'auto')
  await settle(w)
  await typed($, 'context-alert', 'pause')
  await turnEnd($)
  await settle(w)
  expect(prompts(w).length).toBe(0)
})

test('S4 after: a handoff-compact flow running at turn end drops it (the flow owns the session)', async ($, on) => {
  const w = world($, on, { store: { ...known, config: AUTO } })
  await turnStart($)
  await landsAs($, 'auto')
  await settle(w)
  await typed($, 'handoff-compact', '')
  await settle(w)
  await turnEnd($)
  await settle(w)
  expect(prompts(w).filter((t) => t.includes('Then continue the work in progress')).length).toBe(0)
})

// ---- config, set, migration ----

test('set mode auto|ask|off is stored and shown; a bad value is refused', async ($, on) => {
  const w = world($, on)
  const r = await typed($, 'context-alert', 'set mode auto')
  expect(r.text).toContain('mode = auto')
  expect((w.store.get('config') as { mode: string }).mode).toBe('auto')
  expect((await typed($, 'context-alert', 'set mode loud')).text).toContain('mode takes auto, ask or off')
  expect((w.store.get('config') as { mode: string }).mode).toBe('auto')
})

test('set enabled is an alias: off is mode off, on is mode ask (even from auto)', async ($, on) => {
  const w = world($, on, { store: { config: AUTO } })
  await typed($, 'context-alert', 'set enabled off')
  expect((w.store.get('config') as { mode: string }).mode).toBe('off')
  await typed($, 'context-alert', 'set mode auto')
  await typed($, 'context-alert', 'set enabled on')
  const stored = w.store.get('config') as { mode: string; enabled?: boolean }
  expect(stored.mode).toBe('ask')
  expect(stored.enabled).toBe(true) // kept for a downgrade to 0.2.x (F18)
})

test('set: every new key through the command, zeros where allowed', async ($, on) => {
  const w = world($, on)
  const set = async (k: string, v: string) => (await typed($, 'context-alert', `set ${k} ${v}`)).text
  const cfg = () => w.store.get('config') as Record<string, unknown>
  await set('maxWait', '0')
  expect(cfg().maxWait).toBe(0)
  await set('maxWait', '1.5')
  expect(cfg().maxWait).toBe(1.5)
  await set('reserve', '0')
  expect(cfg().reserve).toBe(0)
  await set('reserve', '120000')
  expect(cfg().reserve).toBe(120000)
  await set('maxCycles', '0')
  expect(cfg().maxCycles).toBe(0)
  await set('maxCycles', '5')
  expect(cfg().maxCycles).toBe(5)
  await set('cycleWindow', '15')
  expect(cfg().cycleWindow).toBe(15)
  await set('focusAutoCompact', 'off')
  expect(cfg().focusAutoCompact).toBe(false)
  await set('afterAutoCompact', 'false')
  expect(cfg().afterAutoCompact).toBe(false)
  await set('handoffDir', '/p/notes')
  expect(cfg().handoffDir).toBe('/p/notes')
  await set('handoffDir', 'none')
  expect(cfg().handoffDir).toBe('')
  expect(await set('cycleWindow', '0')).toContain('must be above 0')
  expect(await set('maxCycles', '1.5')).toContain('whole number')
  expect(await set('reserve', 'lots')).toContain('whole number of tokens')
  expect(await set('maxWait', '-1')).toContain('number (0 = no limit)')
  expect(await set('focusAutoCompact', 'maybe')).toContain('on or off')
  expect(cfg().cycleWindow).toBe(15)
  expect(cfg().maxCycles).toBe(5)
})

test('an old stored config with enabled: false reads as mode off', async ($, on) => {
  const off = world($, on, { store: { config: { enabled: false, percent: 30 } }, usage: HIGH })
  await measure($, 90, 900_000)
  await settle(off)
  expect(off.asks.length).toBe(0)
  expect((await typed($, 'context-alert', 'status')).text).toContain('mode off')
})

test('an old stored config with enabled: true, or none, reads as mode ask and never auto', async ($, on) => {
  const onW = world($, on, { store: { config: { enabled: true } } })
  await measure($, 90, 900_000)
  await settle(onW)
  expect(onW.asks.length).toBe(1)
  expect(onW.submits.length).toBe(0)
})

test('reset puts the new settings back to their defaults', async ($, on) => {
  const w = world($, on, { store: { config: { ...AUTO, maxWait: 3, handoffDir: '/x' } } })
  await typed($, 'context-alert', 'reset')
  const c = w.store.get('config') as Record<string, unknown>
  expect(c).toMatchObject({
    mode: 'ask', maxWait: 20, reserve: 'auto', maxCycles: 3, cycleWindow: 60, focusAutoCompact: true, afterAutoCompact: true, handoffDir: '',
  })
})

// ---- status and usage ----

test('USAGE names mode, the new keys, pause and resume', async ($, on) => {
  world($, on)
  const u = (await typed($, 'context-alert', 'bogus')).text!
  for (const k of ['mode', 'maxWait', 'reserve', 'maxCycles', 'cycleWindow', 'focusAutoCompact', 'afterAutoCompact', 'handoffDir', 'pause', 'resume']) {
    expect(u).toContain(k)
  }
})

test('status: mode, limits, auto state, cycles in the window, flow and queued items', async ($, on) => {
  world($, on, { store: { config: AUTO } })
  const idle = (await typed($, 'context-alert', 'status')).text!
  expect(idle).toContain('mode auto')
  expect(idle).toContain('maxWait 20 min')
  expect(idle).toContain('reserve auto (min 80k, 15% of the auto-compact threshold)')
  expect(idle).toContain('maxCycles 3 per 60 min')
  expect(idle).toContain('focusAutoCompact on')
  expect(idle).toContain('afterAutoCompact on')
  expect(idle).toContain('handoffDir none')
  expect(idle).toContain('Auto: on')
  expect(idle).toContain('Auto cycles in the last 60 min: 0 of 3')
  expect(idle).toContain('Flow: none')
  expect(idle).toContain('compaction queued no · continue prompt armed no · after-compaction prompt none')
})

test('status: writing, waiting (agents, maxWait left, room left), compaction queued, continue armed', async ($, on) => {
  const w = world($, on, { store: { config: AUTO }, agents: busy, autoCompactThreshold: 900_000, usage: HIGH })
  await cross($, w)
  expect((await typed($, 'context-alert', 'status')).text).toContain('Flow: auto flow writing the handoff doc')
  expect((await typed($, 'context-alert', 'status')).text).toContain('Auto cycles in the last 60 min: 1 of 3')
  await handoffTurn($, w)
  await w.clock.advance(5 * MIN)
  const waiting = (await typed($, 'context-alert', 'status')).text!
  expect(waiting).toContain('Flow: auto flow waiting for 1 agent (maxWait left 15 min, room left 450k)')
  w.agents[0]!.status = 'completed'
  await plainTurn($, w)
  await plainTurn($, w)
  const queued = (await typed($, 'context-alert', 'status')).text!
  expect(queued).toContain('Flow: none')
  expect(queued).toContain('compaction queued yes · continue prompt armed yes')
})

test('status: held by the loop breaker', async ($, on) => {
  world($, on, { store: { config: AUTO, 'session:S1': { asked: [], autoHeld: true, updatedAt: NOW } } })
  expect((await typed($, 'context-alert', 'status')).text).toContain('Auto: held by the loop breaker')
})

test('status: cycle cap reached', async ($, on) => {
  world($, on, { store: { config: { ...AUTO, maxCycles: 1 }, 'session:S1': { asked: [], autoStarts: [NOW - MIN], updatedAt: NOW } } })
  expect((await typed($, 'context-alert', 'status')).text).toContain('Auto: cycle cap reached')
})

test('status: not auto in ask mode', async ($, on) => {
  world($, on)
  expect((await typed($, 'context-alert', 'status')).text).toContain('Auto: not on (mode ask)')
})

test('status: headless', async ($, on) => {
  const w = world($, on, { store: { config: AUTO } })
  await $.session.start({ cwd: '/', surface: null, isInteractive: false })
  await settle(w)
  expect((await typed($, 'context-alert', 'status')).text).toContain('Auto: never in a non-interactive run')
})

// ---- after review 03 ----

// F3 / D39: the default reserve scales with the window

test('D39: a 200k window (threshold ~167k): the default reserve is 15%, so a manual flow with room 40k keeps waiting', async ($, on) => {
  const w = world($, on, { store: known, agents: busy, autoCompactThreshold: 167_000, usage: { percent: 50, tokens: 127_000 } })
  await typed($, 'handoff-compact', '') // room = 40k: under 80k, over 15% of 167k (25k)
  await settle(w)
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(0)
  expect(w.toasts.some((t) => t.startsWith('Waiting for 1 agent'))).toBe(true)
})

test('D39: a 200k window: room under 15% of the threshold (25k) goes ahead, for the manual flow too', async ($, on) => {
  const w = world($, on, { store: known, agents: busy, autoCompactThreshold: 167_000, usage: { percent: 71, tokens: 142_000 } })
  await typed($, 'handoff-compact', '') // room = 25k - 0: 167k - 142k = 25k is not under 25k; use 24k below
  await settle(w)
  w.usage = { percent: 72, tokens: 143_000 }
  await handoffTurn($, w) // room = 24k < 25k
  expect(compacts(w).length).toBe(1)
  expect(w.logs.some((l) => l.includes('room left 24000, under reserve 25050'))).toBe(true)
})

test('D39: a 1M window (threshold ~967k): the default reserve is capped at 80k', async ($, on) => {
  const keep = world($, on, { store: known, agents: busy, autoCompactThreshold: 967_000, usage: { percent: 90, tokens: 877_000 } })
  await typed($, 'handoff-compact', '') // room 90k: over 80k, so it waits
  await settle(keep)
  await handoffTurn($, keep)
  expect(compacts(keep).length).toBe(0)
})

test('D39: a 1M window: room 70k goes ahead', async ($, on) => {
  const go = world($, on, { store: known, agents: busy, autoCompactThreshold: 967_000, usage: { percent: 90, tokens: 897_000 } })
  await typed($, 'handoff-compact', '') // room 70k < 80k
  await settle(go)
  await handoffTurn($, go)
  expect(compacts(go).length).toBe(1)
  expect(go.logs.some((l) => l.includes('under reserve 80000'))).toBe(true)
})

test('D39: a number the person sets is used as is, even on a 200k window', async ($, on) => {
  const w = world($, on, { store: { ...known, config: { reserve: 80_000 } }, agents: busy, autoCompactThreshold: 167_000, usage: { percent: 50, tokens: 127_000 } })
  await typed($, 'handoff-compact', '') // room 40k < 80k set by hand
  await settle(w)
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(1)
})

test('D39: set reserve auto puts the scaled default back; status shows it', async ($, on) => {
  const w = world($, on)
  await typed($, 'context-alert', 'set reserve 50000')
  expect((w.store.get('config') as { reserve: unknown }).reserve).toBe(50_000)
  expect((await typed($, 'context-alert', 'status')).text).toContain('reserve 50k')
  await typed($, 'context-alert', 'set reserve auto')
  expect((w.store.get('config') as { reserve: unknown }).reserve).toBe('auto')
  await typed($, 'context-alert', 'set reserve 0')
  expect((await typed($, 'context-alert', 'status')).text).toContain('reserve no check')
})

// F17: the room uses the breakdown's own estimate

test('F17: room reads breakdown.totalTokens (the threshold\'s own estimate) before context.tokens', async ($, on) => {
  const w = world($, on, { store: { config: AUTO }, agents: busy, autoCompactThreshold: 500_000, usage: { percent: 45, tokens: 450_000 } })
  w.breakdownTotal = 480_000 // room 20k by the estimate; context.tokens alone would say 50k
  await cross($, w)
  await handoffTurn($, w)
  expect(w.logs.some((l) => l.includes('room left 20000'))).toBe(true)
  expect(compacts(w).length).toBe(1)
})

// F2: the loop breaker reads the compaction's own size

test('F2: a low tokensAfter and a high next measure: no hold, and the next crossing is a new auto cycle', async ($, on) => {
  const w = world($, on, { store: { config: AUTO } })
  await cross($, w)
  await handoffTurn($, w)
  w.tokensAfter = 50_000 // the compaction worked
  await compactLands($, focusInstructions(DOC))
  await settle(w)
  expect(w.logs.some((l) => l.includes('loop check: 50k (5%) after the compaction'))).toBe(true)
  await cross($, w, 46, 460_000) // the continue turn read some files and grew the fill past the threshold again
  expect(session(w).autoHeld).toBeUndefined()
  expect(w.toasts.some((t) => t.includes('auto handoff paused'))).toBe(false)
  expect(flowsStarted(w)).toBe(2)
  expect(w.asks.length).toBe(0)
})

test('F2/P4: stale figures from usage() after the compaction do not hold auto when tokensAfter is low', async ($, on) => {
  const w = world($, on, { store: { config: AUTO }, usage: HIGH }) // usage() still reports the old, high fill
  await cross($, w)
  await handoffTurn($, w)
  w.tokensAfter = 40_000
  await compactLands($, focusInstructions(DOC))
  await settle(w)
  expect(session(w).autoHeld).toBeUndefined()
})

test('F2: no tokensAfter: the breakdown total decides', async ($, on) => {
  const w = world($, on, { store: { config: AUTO } })
  await cross($, w)
  await handoffTurn($, w)
  w.breakdownTotal = 450_000
  await compactLands($, focusInstructions(DOC))
  await settle(w)
  expect(session(w).autoHeld).toBe(true)
})

test('F2: the session.compact fallback uses the result\'s tokensAfter too', async ($, on) => {
  const w = world($, on, { store: { config: AUTO }, refuse: ['compact'] })
  await cross($, w)
  w.tokensAfter = 450_000
  await handoffTurn($, w) // /compact is refused: the mod calls session.compact itself and reads its tokensAfter
  await settle(w)
  expect(w.logs.some((l) => l.includes('compact via session.compact'))).toBe(true)
  expect(session(w).autoHeld).toBe(true)
})

// F5: Claude Code's compaction lands inside the auto flow's own handoff turn

test('F5: an auto-compaction inside the flow\'s handoff turn: one cycle counted, the doc is not asked for twice', async ($, on) => {
  const w = world($, on, { store: { config: AUTO } })
  await cross($, w)
  await turnStart($)
  await landsAs($, 'auto') // before the doc is written: the flow ends, a handoff prompt is queued
  await settle(w)
  await writeMd($, DOC)
  await turnEnd($)
  await settle(w)
  expect(prompts(w).filter((t) => t.includes('Then continue the work in progress')).length).toBe(0)
  expect(prompts(w)).toContain(continuePrompt(DOC))
  expect(session(w).autoStarts!.length).toBe(1)
})

// F6: the timer and a turn end racing, beside a fold-in

test('F6: a maxWait timer and a turn-end check at once never compact while the fold-in is queued', async ($, on) => {
  const w = world($, on, { store: { config: { ...AUTO, maxWait: 1 } }, agents: busy })
  await cross($, w)
  await handoffTurn($, w)
  await w.clock.advance(MIN - 50)
  w.agents[0]!.status = 'completed'
  w.listDelayMs = 100 // both checks read the agent list slowly
  await turnStart($)
  await turnEnd($) // check #1 starts at MIN - 50
  await w.clock.advance(100) // the timer (due at MIN) starts check #2 while #1 is still reading
  w.listDelayMs = 0
  await settle(w)
  await w.clock.advance(200)
  await settle(w)
  expect(w.submits.filter((x) => x.text.startsWith('Fold the result')).length).toBe(1)
  expect(compacts(w).length).toBe(0)
})

// F7: lowering maxWait mid-wait

test('F7: lowering maxWait while an auto flow waits brings the deadline forward', async ($, on) => {
  const w = world($, on, { store: { config: AUTO }, agents: busy }) // 20 min
  await cross($, w)
  await handoffTurn($, w)
  await w.clock.advance(5 * MIN)
  await typed($, 'context-alert', 'set maxWait 1')
  await settle(w)
  expect(compacts(w).length).toBe(1) // 5 min already waited: past the new limit at once
  expect(w.logs.some((l) => l.includes('maxWait 1 min'))).toBe(true)
})

test('F7: lowering maxWait to a later-than-waited limit re-arms the timer for the remainder', async ($, on) => {
  const w = world($, on, { store: { config: AUTO }, agents: busy })
  await cross($, w)
  await handoffTurn($, w)
  await w.clock.advance(2 * MIN)
  await typed($, 'context-alert', 'set maxWait 5')
  await settle(w)
  expect(compacts(w).length).toBe(0)
  await w.clock.advance(3 * MIN - 1)
  await settle(w)
  expect(compacts(w).length).toBe(0)
  await w.clock.advance(1)
  await settle(w)
  expect(compacts(w).length).toBe(1)
})

// F8: an unreadable agent list cannot hold an auto flow forever

test('F8: agent.list failing during an auto wait: maxWait still ends it', async ($, on) => {
  const w = world($, on, { store: { config: { ...AUTO, maxWait: 1 } }, agents: busy })
  await cross($, w)
  w.agentListFails = true
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(0)
  await w.clock.advance(MIN)
  await settle(w)
  expect(compacts(w).length).toBe(1)
  expect(w.logs.some((l) => l.includes('agent list unreadable'))).toBe(true)
})

test('F8: agent.list failing: a manual flow still waits (no maxWait there)', async ($, on) => {
  const w = world($, on, { store: known, agents: busy })
  w.agentListFails = true
  await typed($, 'handoff-compact', '')
  await settle(w)
  await handoffTurn($, w)
  await w.clock.advance(120 * MIN)
  await settle(w)
  expect(compacts(w).length).toBe(0)
})

// F9 / D40: paused is visible in every mode

test('F9/D40: status says paused in ask mode, and that the focus rewrite still runs', async ($, on) => {
  world($, on)
  await typed($, 'context-alert', 'pause')
  const t = (await typed($, 'context-alert', 'status')).text!
  expect(t).toContain('Paused: yes, in every mode')
  expect(t).toContain('focus rewrite')
  expect(t).toContain('still runs while paused')
})

test('D40: paused, the S4 focus rewrite still runs; with focusAutoCompact off status says it is off', async ($, on) => {
  const w = world($, on, { store: { ...known, config: { focusAutoCompact: false } } })
  await typed($, 'context-alert', 'pause')
  expect((await typed($, 'context-alert', 'status')).text).toContain('is off (focusAutoCompact)')
  void w
})

test('D40: paused, an auto-compaction still gets the focus text', async ($, on) => {
  const w = world($, on, { store: known })
  await typed($, 'context-alert', 'pause')
  await landsAs($, 'auto')
  expect(compactFor(w)).toBe(focusInstructions(DOC))
})

// F10: reset session

test('F10: reset session clears the cycle count and the auto hold, not the pause', async ($, on) => {
  const w = world($, on, { store: { config: AUTO, 'session:S1': { asked: [], autoStarts: [NOW - MIN], autoHeld: true, paused: true, updatedAt: NOW } } })
  const r = await typed($, 'context-alert', 'reset session')
  expect(r.text).toContain('auto cycle count')
  const s = session(w)
  expect(s.autoStarts).toBeUndefined()
  expect(s.autoHeld).toBeUndefined()
  expect(s.paused).toBe(true)
})

// F14: a failed compaction

test('F14: a compaction that cannot start logs it after the cycle line', async ($, on) => {
  const w = world($, on, { store: { config: AUTO }, refuse: ['compact'], compactRejects: true })
  await cross($, w)
  await handoffTurn($, w)
  expect(w.logs.some((l) => l.includes('auto cycle: compaction failed'))).toBe(true)
  expect(w.toasts).toContain("Compaction couldn't start; run /compact")
})

// F15: the set reply says when it stopped an auto flow

test('F15: set mode ask while an auto flow runs: the reply says it was stopped', async ($, on) => {
  const w = world($, on, { store: { config: AUTO } })
  await cross($, w)
  const r = await typed($, 'context-alert', 'set mode ask')
  expect(r.text).toContain('The running auto handoff-compact was stopped.')
  const again = await typed($, 'context-alert', 'set mode off')
  expect(again.text).not.toContain('was stopped')
  void w
})

// F16: an S4 handoff outside handoff/

test('F16: the S4 handoff turn\'s own .md write is remembered and counts as the handoff, wherever it lives', async ($, on) => {
  const w = world($, on, { store: { config: { ...AUTO, handoffDir: '/p/notes' } } })
  await landsAs($, 'auto')
  await settle(w)
  expect(prompts(w).length).toBe(1) // the S4 handoff prompt
  await turnStart($)
  await writeMd($, '/p/notes/20261124_01_s4.md')
  await $.tool.call({ tool: 'Edit', file_path: '/p/CLAUDE.md', old_string: 'a', new_string: 'b' } as never)
  await turnEnd($)
  await settle(w)
  expect((w.store.get('session:S1') as { handoff: string }).handoff).toBe('/p/notes/20261124_01_s4.md')
  await turnStart($)
  await landsAs($, 'auto') // the next one: a doc exists since the last compaction? no, the compaction cleared it
  await settle(w)
})

test('F16: a .md written during an S4 handoff turn makes the next auto-compaction in that turn a continue', async ($, on) => {
  const w = world($, on, { store: { config: { ...AUTO, handoffDir: '/p/notes', maxCycles: 0 } } })
  await landsAs($, 'auto')
  await settle(w)
  await turnStart($) // the S4 handoff turn
  await writeMd($, '/p/notes/20261124_01_s4.md')
  await settle(w)
  await landsAs($, 'auto') // Claude Code compacts again inside that turn
  await turnEnd($)
  await settle(w)
  expect(prompts(w)[1]).toBe(continuePrompt('/p/notes/20261124_01_s4.md'))
})

// F13: no notification for a prompt the host dropped

test('F13: the S4 notification goes out only when the prompt was accepted', async ($, on) => {
  const dropped = world($, on, { store: { ...known, config: AUTO }, dropPrompt: (t) => t.includes('Then continue the work') })
  await landsAs($, 'auto')
  await settle(dropped)
  expect(dropped.notifies.length).toBe(0)
  expect(dropped.logs.some((l) => l.includes('dropped by the host'))).toBe(true)
})

// F18: downgrade shim

test('F18: the stored config keeps the 0.2 enabled flag in step with mode', async ($, on) => {
  const w = world($, on)
  await typed($, 'context-alert', 'set mode off')
  expect((w.store.get('config') as { enabled: boolean; mode: string })).toMatchObject({ mode: 'off', enabled: false })
  await typed($, 'context-alert', 'set mode auto')
  expect((w.store.get('config') as { enabled: boolean })).toMatchObject({ enabled: true })
  await typed($, 'context-alert', 'reset')
  expect((w.store.get('config') as { enabled: boolean })).toMatchObject({ enabled: true })
})

test('F18: mode wins over a stale enabled flag when read back', async ($, on) => {
  const w = world($, on, { store: { config: { mode: 'auto', enabled: false } } })
  await cross($, w)
  expect(flowsStarted(w)).toBe(1)
})
