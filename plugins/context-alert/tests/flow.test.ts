// Headless tests for the /handoff-compact flow (proposal 05/06), driven through the real hooks module.
import { test, expect } from 'claude-code/testing'
import {
  alreadyRunningToast, CANCELLED_TOAST, continuePrompt, focusInstructions, HANDOFF_COMPACTING_TOAST, NO_DOC_WRITTEN_TOAST, NOW_UPGRADE_TOAST,
  ALREADY_COMPACTING_TOAST, pathIgnored, TURN_NOT_FINISHED_TOAST, WAITED_NOTIFICATION, waitToast,
} from '../hooks/flow-logic'
import { measure, NOW, settle, turnEnd, turnEndAs, turnStart, typed, world, writeMd, type Dollar, type World } from './world'

const DOC = '/p/handoff/20261122_01_x.md'
const SUB = 'a1'

const hc = ($: Dollar, args = '') => typed($, 'handoff-compact', args)
const compacts = (w: World) => w.runs.filter((r) => r.command === 'compact')
const folds = (w: World) => w.submits.filter((s) => s.text.startsWith('Fold the result'))
const prompt = ($: Dollar, text: string, origin: Record<string, unknown>, command?: { name: string; args: string }) =>
  $.prompt.submit({ text, origin, wait: false, ...(command ? { command } : {}) } as never)
/** The main-thread handoff turn: it writes the doc and ends normally. */
async function handoffTurn($: Dollar, w: World, path = DOC): Promise<void> {
  await turnStart($)
  await writeMd($, path)
  await turnEnd($)
  await settle(w)
}
/** One main-thread turn with no write (an agent report's turn, or the fold-in turn). */
async function plainTurn($: Dollar, w: World): Promise<void> {
  await turnStart($)
  await turnEnd($)
  await settle(w)
}
/** The engine runs the queued /compact: session.compact lands. */
const compactLands = ($: Dollar, instructions?: string) =>
  $.session.compact({ trigger: 'manual', instructions, messages: [{ role: 'user', text: 'hi', toolUses: [] }] } as never)
const known = { 'session:S1': { asked: [], handoff: DOC, updatedAt: NOW } }

// ---- the command: args, path order, enabled ----

test('handoff-compact: a path argument with spaces goes to the handoff chain; no output text', async ($, on) => {
  const w = world($, on)
  const r = await hc($, 'now "/p/docs/my notes.md"')
  await settle(w)
  expect(r.text).toBeUndefined()
  expect(w.runs).toEqual([{ command: 'handoff-doc', args: '/p/docs/my notes.md' }])
})

test('handoff-compact: no argument uses the known session path, then compacts with focus on that path', async ($, on) => {
  const w = world($, on, { store: known })
  await hc($)
  await settle(w)
  expect(w.runs).toEqual([{ command: 'handoff-doc', args: DOC }])
  await handoffTurn($, w)
  expect(compacts(w)).toEqual([{ command: 'compact', args: focusInstructions(DOC) }])
  expect(w.toasts).toContain(HANDOFF_COMPACTING_TOAST)
})

test('handoff-compact: no argument and no known path asks Claude for the destination', async ($, on) => {
  const w = world($, on)
  await hc($)
  await settle(w)
  expect(w.runs.length).toBe(0)
  expect(w.submits.length).toBe(1)
  expect(w.submits[0]!.text).toContain('AskUserQuestion')
  // The path comes from the write.
  await handoffTurn($, w, '/p/handoff/new.md')
  expect(compacts(w)[0]!.args).toBe(focusInstructions('/p/handoff/new.md'))
})

test('handoff-compact: "docs/now" is a path, not the keyword, so the wait still applies', async ($, on) => {
  const w = world($, on, { agents: [{ id: 'x', status: 'running' }] })
  await hc($, 'docs/now')
  await settle(w)
  expect(w.runs[0]).toEqual({ command: 'handoff-doc', args: 'docs/now' })
  await handoffTurn($, w, 'docs/now/h.md')
  expect(compacts(w).length).toBe(0)
})

test('handoff-compact works with enabled=false (D16)', async ($, on) => {
  const w = world($, on, { store: { ...known, config: { enabled: false } } })
  await hc($)
  await settle(w)
  expect(w.runs.map((r) => r.command)).toEqual(['handoff-doc'])
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(1)
})

// ---- re-trigger and `now` (D24) ----

test('re-trigger while writing: "already in progress" toast, nothing restarts', async ($, on) => {
  const w = world($, on, { store: known })
  await hc($)
  await settle(w)
  await hc($, '/p/other.md')
  await settle(w)
  expect(w.toasts).toEqual([pathIgnored(alreadyRunningToast(), '/p/other.md')])
  expect(w.runs.length).toBe(1)
})

test('re-trigger while waiting names the live agent count', async ($, on) => {
  const w = world($, on, { store: known, agents: [{ id: 'x', status: 'running' }, { id: 'y', status: 'pending' }] })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  await hc($)
  await settle(w)
  expect(w.toasts).toContain(alreadyRunningToast(2))
  expect(compacts(w).length).toBe(0)
})

test('"now" while writing sets force: the doc lands and it compacts with agents running', async ($, on) => {
  const w = world($, on, { store: known, agents: [{ id: 'x', status: 'running' }] })
  await hc($)
  await settle(w)
  await hc($, 'now')
  await settle(w)
  expect(w.toasts).toContain(NOW_UPGRADE_TOAST)
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(1)
})

test('"now" while waiting and idle compacts at once', async ($, on) => {
  const w = world($, on, { store: known, agents: [{ id: 'x', status: 'running' }] })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(0)
  await hc($, 'now')
  await settle(w)
  expect(compacts(w)).toEqual([{ command: 'compact', args: focusInstructions(DOC) }])
  expect(w.toasts).toContain(HANDOFF_COMPACTING_TOAST)
})

// ---- writing phase ----

test('writing: a turn with no write does not compact; a later .md write moves on and compacts', async ($, on) => {
  const w = world($, on, { store: known })
  await hc($)
  await settle(w)
  await plainTurn($, w)
  expect(compacts(w).length).toBe(0)
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(1)
})

test('writing: three turns without a write give up', async ($, on) => {
  const w = world($, on, { store: known })
  await hc($)
  await settle(w)
  for (let i = 0; i < 3; i++) await plainTurn($, w)
  expect(w.toasts).toContain(NO_DOC_WRITTEN_TOAST)
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(0)
})

test('writing: an interrupted handoff turn cancels', async ($, on) => {
  const w = world($, on, { store: known })
  await hc($)
  await settle(w)
  await turnStart($)
  await writeMd($, DOC)
  await turnEndAs($, 'aborted')
  await settle(w)
  expect(w.toasts).toContain(TURN_NOT_FINISHED_TOAST)
  expect(compacts(w).length).toBe(0)
})

test('writing: a CLAUDE.md pointer update after the doc keeps the handoff path in the focus', async ($, on) => {
  const w = world($, on)
  await hc($)
  await settle(w)
  await turnStart($)
  await writeMd($, '/p/handoff/h.md')
  await $.tool.call({ tool: 'Edit', file_path: '/p/CLAUDE.md', old_string: 'a', new_string: 'b' } as never)
  await turnEnd($)
  await settle(w)
  expect(compacts(w)[0]!.args).toBe(focusInstructions('/p/handoff/h.md'))
})

// ---- waiting phase ----

test('waiting with agents: one toast, no compaction, no turn cap', async ($, on) => {
  const w = world($, on, { store: known, agents: [{ id: 'x', status: 'running' }, { id: 'y', status: 'waiting' }] })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  expect(w.toasts).toEqual([waitToast(2)])
  for (let i = 0; i < 5; i++) await plainTurn($, w)
  expect(compacts(w).length).toBe(0)
  expect(w.toasts).toEqual([waitToast(2)]) // the count did not change, so no repeat, and no give-up
})

test('waiting: the toast mentions background tasks from the last Stop that are not waited on', async ($, on) => {
  const w = world($, on, { store: known, agents: [{ id: 'x', status: 'running' }] })
  await $.classic.Stop({
    stop_hook_active: false, background_tasks: [{ id: 'b1', type: 'shell', status: 'running', description: 'dev server' }],
  } as never)
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  expect(w.toasts).toEqual([waitToast(1, 1)])
})

test('an agent finishing during the wait: exactly one fold-in, then compact after the fold turn', async ($, on) => {
  const w = world($, on, { store: known, agents: [{ id: 'x', status: 'running', description: 'audit the parser' }] })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(0)
  w.agents[0]!.status = 'completed'
  await plainTurn($, w) // the agent's report turn
  expect(folds(w).length).toBe(1)
  expect(folds(w)[0]!.text).toContain('audit the parser (x)')
  expect(folds(w)[0]!.text).toContain(DOC)
  expect(folds(w)[0]!.asUser).toBe(true)
  expect(compacts(w).length).toBe(0)
  await turnStart($)
  await $.tool.call({ tool: 'Edit', file_path: DOC, old_string: 'a', new_string: 'b' } as never)
  await turnEnd($) // the fold-in turn
  await settle(w)
  expect(folds(w).length).toBe(1)
  expect(compacts(w)).toEqual([{ command: 'compact', args: focusInstructions(DOC) }])
})

test('two agents: the first finish folds in and keeps waiting for the second', async ($, on) => {
  const w = world($, on, { store: known, agents: [{ id: 'x', status: 'running' }, { id: 'y', status: 'running' }] })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  w.agents[0]!.status = 'completed'
  await plainTurn($, w)
  await plainTurn($, w) // fold turn
  expect(folds(w).length).toBe(1)
  expect(compacts(w).length).toBe(0)
  expect(w.toasts).toEqual([waitToast(2), waitToast(1)])
  w.agents[1]!.status = 'failed'
  await plainTurn($, w)
  await plainTurn($, w)
  expect(folds(w).length).toBe(2)
  expect(compacts(w).length).toBe(1)
})

test('an agent spawned during the wait is waited on too', async ($, on) => {
  const w = world($, on, { store: known, agents: [{ id: 'x', status: 'running' }] })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  w.agents.push({ id: 'z', status: 'pending' })
  await plainTurn($, w)
  expect(compacts(w).length).toBe(0)
  expect(w.toasts).toEqual([waitToast(1), waitToast(2)])
})

test('force (now) compacts with agents running, without a fold-in', async ($, on) => {
  const w = world($, on, { store: known, agents: [{ id: 'x', status: 'running' }] })
  await hc($, 'now')
  await settle(w)
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(1)
  expect(folds(w).length).toBe(0)
  expect(w.toasts.some((t) => t.startsWith('Waiting'))).toBe(false)
})

// ---- ways out (D22) ----

test('a typed composer message while waiting cancels; a later finish does not compact', async ($, on) => {
  const w = world($, on, { store: known, agents: [{ id: 'x', status: 'running' }] })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  await prompt($, 'actually, keep going', { kind: 'composer' })
  await settle(w)
  expect(w.toasts).toContain(CANCELLED_TOAST)
  w.agents[0]!.status = 'completed'
  await plainTurn($, w)
  expect(compacts(w).length).toBe(0)
  expect(folds(w).length).toBe(0)
})

test('a Remote Control (bridge) message while waiting cancels', async ($, on) => {
  const w = world($, on, { store: known, agents: [{ id: 'x', status: 'running' }] })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  await prompt($, 'stop', { kind: 'bridge' })
  await settle(w)
  expect(w.toasts).toContain(CANCELLED_TOAST)
})

test('agent reports, plugin prompts, scheduled triggers and slash commands do not cancel', async ($, on) => {
  const w = world($, on, { store: known, agents: [{ id: 'x', status: 'running' }] })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  await prompt($, 'agent x finished', { kind: 'task-notification' })
  await prompt($, 'from a plugin', { kind: 'plugin', name: 'other' })
  await prompt($, 'loop', { kind: 'scheduled-trigger' })
  await prompt($, '/context-alert', { kind: 'composer' }, { name: 'context-alert', args: '' })
  await prompt($, '/handoff-compact now', { kind: 'composer' }, { name: 'handoff-compact', args: 'now' })
  await settle(w)
  expect(w.toasts.includes(CANCELLED_TOAST)).toBe(false)
  w.agents[0]!.status = 'completed'
  await plainTurn($, w)
  await plainTurn($, w)
  expect(compacts(w).length).toBe(1)
})

test('a typed message during the writing phase (answering Claude) does not cancel', async ($, on) => {
  const w = world($, on)
  await hc($)
  await settle(w)
  await plainTurn($, w) // Claude asked for the path
  await prompt($, 'use /p/handoff/a.md', { kind: 'composer' })
  await handoffTurn($, w, '/p/handoff/a.md')
  expect(w.toasts.includes(CANCELLED_TOAST)).toBe(false)
  expect(compacts(w).length).toBe(1)
})

// ---- alerts, compaction paths, notification ----

test('alerts are held while a flow is in progress; the mid-turn toast still shows', async ($, on) => {
  const w = world($, on, { store: known, usage: { percent: 45, tokens: 450_000 }, agents: [{ id: 'x', status: 'running' }] })
  await hc($)
  await settle(w)
  await turnStart($)
  await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  await settle(w)
  expect(w.toasts.some((t) => t.includes('45%'))).toBe(true)
  await measure($, 45, 450_000)
  await writeMd($, DOC)
  await turnEnd($)
  await settle(w)
  await measure($, 46, 460_000)
  await settle(w)
  expect(w.asks.length).toBe(0)
})

test('focus text reaches the session.compact fallback when /compact is refused', async ($, on) => {
  const w = world($, on, { store: known, refuse: ['compact'] })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(1)
  expect(w.compactInstructions).toEqual([focusInstructions(DOC)])
  expect(w.logs.some((l) => l.includes('compact via session.compact'))).toBe(true)
})

test('the session.compact fallback does the hook\'s work itself: tiers reset, waited flow notifies', async ($, on) => {
  // The engine skips this mod's own hooks for its own $.session.compact, so nothing else would.
  const w = world($, on, {
    refuse: ['compact'], agents: [{ id: 'x', status: 'running' }],
    store: { 'session:S1': { asked: [{ pct: 41, tokens: 410_000, at: 1 }], handoff: DOC, updatedAt: NOW } },
  })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  w.agents[0]!.status = 'completed'
  await plainTurn($, w)
  await plainTurn($, w)
  expect(w.compacts).toBe(1)
  expect((w.store.get('session:S1') as { asked: unknown[] }).asked).toEqual([])
  expect(w.notifies.map((n) => n.text)).toEqual([WAITED_NOTIFICATION])
})

test('the dialog\'s plain "Compact now" passes no instructions', async ($, on) => {
  const w = world($, on, { answer: 'Compact now', refuse: ['compact'] })
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.compactInstructions).toEqual([undefined])
})

test('notify: sent when the flow waited for agents and notify is on', async ($, on) => {
  const w = world($, on, { store: known, agents: [{ id: 'x', status: 'running' }] })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  w.agents[0]!.status = 'completed'
  await plainTurn($, w)
  await plainTurn($, w)
  expect(compacts(w).length).toBe(1)
  await compactLands($, focusInstructions(DOC))
  await settle(w)
  expect(w.notifies.map((n) => n.text)).toEqual([WAITED_NOTIFICATION])
})

test('notify: none when the flow compacted right away, or when notify is off', async ($, on) => {
  const a = world($, on, { store: known })
  await hc($)
  await settle(a)
  await handoffTurn($, a)
  await compactLands($)
  await settle(a)
  expect(a.notifies.length).toBe(0)
})

test('notify: none when notify is off even though the flow waited', async ($, on) => {
  const w = world($, on, { store: { ...known, config: { notify: false } }, agents: [{ id: 'x', status: 'running' }] })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  w.agents[0]!.status = 'completed'
  await plainTurn($, w)
  await plainTurn($, w)
  await compactLands($)
  await settle(w)
  expect(w.notifies.length).toBe(0)
})

test('any compaction ends a waiting flow: a later finish does nothing, a new run starts fresh', async ($, on) => {
  const w = world($, on, { store: known, agents: [{ id: 'x', status: 'running' }] })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  await compactLands($) // the person ran /compact themselves
  await settle(w)
  expect(w.notifies.map((n) => n.text)).toEqual([WAITED_NOTIFICATION]) // the doc was written and agents were waited on
  w.agents[0]!.status = 'completed'
  await plainTurn($, w)
  expect(folds(w).length).toBe(0)
  expect(compacts(w).length).toBe(0)
  await hc($)
  await settle(w)
  expect(w.runs.filter((r) => r.command === 'handoff-doc').length).toBe(2)
})

// ---- main session only ----

test('main only: sub-agent writes, turns and compactions never move the flow', async ($, on) => {
  const w = world($, on, { store: known, agents: [{ id: SUB, status: 'running' }] })
  await hc($)
  await settle(w)
  await turnStart($, SUB)
  await $.tool.call({ tool: 'Write', file_path: '/p/handoff/sub.md', content: 'x', agentId: SUB } as never)
  for (let i = 0; i < 4; i++) { await turnEnd($, SUB); await settle(w) } // would give up if counted
  expect(w.toasts.length).toBe(0)
  await handoffTurn($, w) // main writes: now waiting on the agent
  expect(w.toasts).toEqual([waitToast(1)])
  w.agents[0]!.status = 'completed'
  await turnStart($, SUB)
  await turnEnd($, SUB) // a sub-agent turn ending must not run the check
  await settle(w)
  expect(folds(w).length).toBe(0)
  await $.session.compact({ trigger: 'auto', agentId: SUB, messages: [{ role: 'user', text: 'hi', toolUses: [] }] } as never)
  await settle(w)
  await plainTurn($, w) // main: the fold-in still comes, so the flow survived the sub-agent compaction
  expect(folds(w).length).toBe(1)
  await plainTurn($, w)
  expect(compacts(w)[0]!.args).toBe(focusInstructions(DOC))
})

// ---- the dialog uses the same flow (D25) ----

test('dialog "Handoff, then compact": waits for agents, folds in, then compacts with focus', async ($, on) => {
  const w = world($, on, { answer: 'Update handoff, then compact', store: known, agents: [{ id: 'x', status: 'running' }] })
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.asks.length).toBe(1)
  expect(w.runs).toEqual([{ command: 'handoff-doc', args: DOC }])
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(0)
  expect(w.toasts).toEqual([waitToast(1)])
  await hc($)
  await settle(w)
  expect(w.toasts).toContain(alreadyRunningToast(1)) // one flow, whichever started it
  w.agents[0]!.status = 'completed'
  await plainTurn($, w)
  expect(folds(w).length).toBe(1)
  await plainTurn($, w)
  expect(compacts(w)).toEqual([{ command: 'compact', args: focusInstructions(DOC) }])
})

// ---- review round 1 ----

const clear = ($: Dollar) => $.session.end({ reason: 'clear', sessionId: 'S1', resume: {} } as never)

test('Esc during the fold-in turn cancels: no compaction with the doc not updated', async ($, on) => {
  const w = world($, on, { store: known, agents: [{ id: 'x', status: 'running' }] })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  w.agents[0]!.status = 'completed'
  await plainTurn($, w)
  expect(folds(w).length).toBe(1)
  await turnStart($)
  await turnEndAs($, 'aborted')
  await settle(w)
  expect(w.toasts).toContain(TURN_NOT_FINISHED_TOAST)
  await plainTurn($, w)
  expect(compacts(w).length).toBe(0)
})

test('agent.list failing: keeps waiting (no fold, no compact) until it reads again', async ($, on) => {
  const w = world($, on, { store: known, agents: [{ id: 'x', status: 'running' }] })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  w.agentListFails = true
  w.agents[0]!.status = 'completed'
  await plainTurn($, w)
  expect(folds(w).length).toBe(0)
  expect(compacts(w).length).toBe(0)
  expect(w.logs.some((l) => l.includes('agent list unreadable'))).toBe(true)
  w.agentListFails = false
  await plainTurn($, w)
  expect(folds(w).length).toBe(1)
  await plainTurn($, w)
  expect(compacts(w).length).toBe(1)
})

test('agent.list failing from the start: "no agents" is never assumed', async ($, on) => {
  const w = world($, on, { store: known })
  w.agentListFails = true
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(0)
})

test('a denied Write or a failed Edit of the doc does not count as written', async ($, on) => {
  const w = world($, on, { store: known, toolResult: { Write: 'deny', Edit: 'error' } })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  await turnStart($)
  await $.tool.call({ tool: 'Edit', file_path: DOC, old_string: 'a', new_string: 'b' } as never)
  await turnEnd($)
  await settle(w)
  expect(compacts(w).length).toBe(0)
  await plainTurn($, w)
  expect(w.toasts).toContain(NO_DOC_WRITTEN_TOAST) // all three turns counted as "no write"
})

test('/clear during a flow ends it: no fold, no compaction, alerts open again, a new run starts', async ($, on) => {
  const w = world($, on, { store: known, agents: [{ id: 'x', status: 'running' }] })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  await clear($)
  w.agents[0]!.status = 'completed'
  await plainTurn($, w)
  expect(folds(w).length).toBe(0)
  expect(compacts(w).length).toBe(0)
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.asks.length).toBe(1)
  await hc($)
  await settle(w)
  expect(w.runs.filter((r) => r.command === 'handoff-doc').length).toBe(2)
})

test('a vetoed compaction clears the pending notification; a later auto-compaction sends none', async ($, on) => {
  const w = world($, on, { store: known, agents: [{ id: 'x', status: 'running' }] })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  w.agents[0]!.status = 'completed'
  await plainTurn($, w)
  await plainTurn($, w)
  expect(compacts(w).length).toBe(1) // queued
  w.compactVeto = true
  await compactLands($) // another plugin vetoes it
  await settle(w)
  w.compactVeto = false
  await $.session.compact({ trigger: 'auto', messages: [{ role: 'user', text: 'hi', toolUses: [] }] } as never)
  await settle(w)
  expect(w.notifies.length).toBe(0)
})

test('a compaction that never lands: the next main turn clears the pending notification', async ($, on) => {
  const w = world($, on, { store: known, agents: [{ id: 'x', status: 'running' }] })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  w.agents[0]!.status = 'completed'
  await plainTurn($, w)
  await plainTurn($, w)
  await plainTurn($, w) // the queued /compact was dropped; the session moved on
  await $.session.compact({ trigger: 'auto', messages: [{ role: 'user', text: 'hi', toolUses: [] }] } as never)
  await settle(w)
  expect(w.notifies.length).toBe(0)
})

test('re-trigger while a compaction is queued: toast, no new flow', async ($, on) => {
  const w = world($, on, { store: known })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(1)
  await hc($)
  await settle(w)
  expect(w.toasts).toContain(ALREADY_COMPACTING_TOAST)
  expect(w.runs.filter((r) => r.command === 'handoff-doc').length).toBe(1)
})

test('"now" while waiting with a turn running: toast, then compacts when that turn ends', async ($, on) => {
  const w = world($, on, { store: known, agents: [{ id: 'x', status: 'running' }] })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  await turnStart($)
  await hc($, 'now')
  await settle(w)
  expect(w.toasts).toContain(NOW_UPGRADE_TOAST)
  expect(compacts(w).length).toBe(0)
  await turnEnd($)
  await settle(w)
  expect(compacts(w).length).toBe(1)
})

test('an agent that reports inside the handoff turn, after the doc Write, is folded in', async ($, on) => {
  const w = world($, on, { store: known, agents: [{ id: 'x', status: 'running', description: 'scan logs' }] })
  await hc($)
  await settle(w)
  await turnStart($)
  await writeMd($, DOC)
  w.agents[0]!.status = 'completed' // its report is delivered into the running turn
  await turnEnd($)
  await settle(w)
  expect(folds(w).length).toBe(1)
  expect(folds(w)[0]!.text).toContain('scan logs (x)')
  expect(compacts(w).length).toBe(0)
  await plainTurn($, w)
  expect(compacts(w).length).toBe(1)
})

test('writing: task-notification and other plugins\' turns do not count toward the 3-turn cap', async ($, on) => {
  const w = world($, on, { store: known })
  await hc($)
  await settle(w)
  for (let i = 0; i < 3; i++) {
    await prompt($, `agent ${i} finished`, { kind: 'task-notification' })
    await plainTurn($, w)
  }
  await prompt($, 'other plugin', { kind: 'plugin', name: 'other' })
  await plainTurn($, w)
  expect(w.toasts.includes(NO_DOC_WRITTEN_TOAST)).toBe(false)
  for (let i = 0; i < 3; i++) await plainTurn($, w) // turns this mod did not see the prompt of (its own) count
  expect(w.toasts).toContain(NO_DOC_WRITTEN_TOAST)
})

test('a typed message starting with "/" that is not a command cancels a waiting flow', async ($, on) => {
  const w = world($, on, { store: known, agents: [{ id: 'x', status: 'running' }] })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  await prompt($, '/etc/hosts looks wrong', { kind: 'composer' })
  await settle(w)
  expect(w.toasts).toContain(CANCELLED_TOAST)
})

test('"now <path>" while writing with no path takes the path; otherwise the toast says it was ignored', async ($, on) => {
  const w = world($, on, { agents: [{ id: 'x', status: 'running' }] })
  await hc($)
  await settle(w)
  await hc($, 'now /p/docs/given.md')
  await settle(w)
  expect(w.toasts).toEqual([NOW_UPGRADE_TOAST])
  await hc($, 'now /p/docs/second.md')
  await settle(w)
  expect(w.toasts).toContain(pathIgnored(NOW_UPGRADE_TOAST, '/p/docs/second.md'))
  await turnStart($)
  await writeMd($, '/p/docs/given.md')
  await turnEnd($)
  await settle(w)
  expect(compacts(w)[0]!.args).toBe(focusInstructions('/p/docs/given.md'))
})

test('a dropped fold-in prompt does not wedge the flow: it carries on and compacts', async ($, on) => {
  const w = world($, on, { store: known, agents: [{ id: 'x', status: 'running' }], dropPrompt: (t) => t.startsWith('Fold the result') })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  w.agents[0]!.status = 'completed'
  await plainTurn($, w)
  expect(w.logs.some((l) => l.includes('fold-in prompt dropped'))).toBe(true)
  expect(compacts(w).length).toBe(1)
})

test('sub-agents of agents and teammates are not waited on', async ($, on) => {
  const w = world($, on, {
    store: known,
    agents: [
      { id: 'n', status: 'running', parentId: 'top' },
      { id: 't', status: 'running', kind: 'in_process_teammate' },
      { id: 'u', status: 'waiting', teammateId: 'u@team' },
    ],
  })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(1)
})

test('sequel: the first handoff/ Write stays the focus over a later back-link Edit of the previous doc', async ($, on) => {
  const w = world($, on, { store: known })
  await hc($)
  await settle(w)
  await turnStart($)
  await writeMd($, '/p/handoff/20261122_02_next.md')
  await $.tool.call({ tool: 'Edit', file_path: DOC, old_string: 'a', new_string: 'b' } as never)
  await turnEnd($)
  await settle(w)
  expect(compacts(w)[0]!.args).toBe(focusInstructions('/p/handoff/20261122_02_next.md'))
})

test('a path argument outside handoff/ is remembered, so a later no-argument run reuses it (D18)', async ($, on) => {
  const w = world($, on)
  await hc($, '/p/docs/notes.md')
  await settle(w)
  await handoffTurn($, w, '/p/docs/notes.md')
  await compactLands()
  await settle(w)
  expect((w.store.get('session:S1') as { handoff?: string }).handoff).toBe('/p/docs/notes.md')
  await hc($)
  await settle(w)
  expect(w.runs.filter((r) => r.command === 'handoff-doc').map((r) => r.args)).toEqual(['/p/docs/notes.md', '/p/docs/notes.md'])

  async function compactLands(): Promise<void> {
    await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'hi', toolUses: [] }] } as never)
  }
})

test('prompt wording: the command\'s handoff prompt is neutral (the dialog\'s is checked in hooks.test.ts)', async ($, on) => {
  const a = world($, on)
  await hc($)
  await settle(a)
  expect(a.submits[0]!.text.startsWith('I want a handoff doc now.')).toBe(true)
  expect(a.submits[0]!.text).toContain('`context-alert:handoff-doc`')
})

// ---- the continue nudge: after a handoff flow's compaction, with no agent running ----

const nudges = (w: World) => w.submits.filter((s) => s.text.startsWith('Continue the work in progress'))
const autoCompaction = ($: Dollar) =>
  $.session.compact({ trigger: 'auto', messages: [{ role: 'user', text: 'hi', toolUses: [] }] } as never)
const nudgeLogged = (w: World, what: string) => w.logs.some((l) => l.includes('no continue nudge') && l.includes(what))

test('nudge: a command flow with no agents sends one continue prompt once the compaction lands, not before', async ($, on) => {
  const w = world($, on, { store: known })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(1)
  expect(nudges(w).length).toBe(0) // queued, not landed
  await compactLands($, focusInstructions(DOC))
  await settle(w)
  expect(nudges(w)).toEqual([{ text: continuePrompt(DOC), asUser: true }])
  expect(w.logs.some((l) => l.includes('continue nudge sent'))).toBe(true)
})

test('nudge: the dialog\'s "Handoff, then compact" nudges too', async ($, on) => {
  const w = world($, on, { answer: 'Update handoff, then compact', store: known })
  await measure($, 41, 410_000)
  await settle(w)
  await handoffTurn($, w)
  await compactLands($, focusInstructions(DOC))
  await settle(w)
  expect(nudges(w).map((n) => n.text)).toEqual([continuePrompt(DOC)])
})

test('nudge: the path is the one the flow wrote, not the stored one', async ($, on) => {
  const w = world($, on)
  await hc($)
  await settle(w)
  await handoffTurn($, w, '/p/handoff/new.md')
  await compactLands($, focusInstructions('/p/handoff/new.md'))
  await settle(w)
  expect(nudges(w).map((n) => n.text)).toEqual([continuePrompt('/p/handoff/new.md')])
})

test('nudge: after waiting for agents that finished, it comes after the notification', async ($, on) => {
  const w = world($, on, { store: known, agents: [{ id: 'x', status: 'running' }] })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  w.agents[0]!.status = 'completed'
  await plainTurn($, w)
  await plainTurn($, w)
  await compactLands($)
  await settle(w)
  expect(w.notifies.length).toBe(1)
  expect(w.order.filter((o) => o === 'notify' || o.startsWith('submit: Continue'))).toEqual(['notify', `submit: ${continuePrompt(DOC)}`])
})

test('nudge: none with an agent still running (now): its report wakes the session', async ($, on) => {
  const w = world($, on, { store: known, agents: [{ id: 'x', status: 'running' }] })
  await hc($, 'now')
  await settle(w)
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(1)
  await compactLands($)
  await settle(w)
  expect(nudges(w).length).toBe(0)
  expect(nudgeLogged(w, 'still running')).toBe(true)
})

test('nudge: a nested agent, a teammate and background shells do not block it', async ($, on) => {
  const w = world($, on, {
    store: known,
    agents: [{ id: 'n', status: 'running', parentId: 'x' }, { id: 't', status: 'running', kind: 'in_process_teammate' }],
  })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  await compactLands($)
  await settle(w)
  expect(nudges(w).length).toBe(1)
})

test('nudge: none when agent.list fails at landing', async ($, on) => {
  const w = world($, on, { store: known })
  w.agentListFails = true
  await hc($, 'now') // now: the unreadable list does not hold the compaction back
  await settle(w)
  await handoffTurn($, w)
  expect(compacts(w).length).toBe(1)
  await compactLands($)
  await settle(w)
  expect(nudges(w).length).toBe(0)
  expect(nudgeLogged(w, 'agent.list failed')).toBe(true)
})

test('nudge: none for the dialog\'s plain "Compact now", a typed /compact or an auto-compaction', async ($, on) => {
  const a = world($, on, { answer: 'Compact now', refuse: ['compact'] }) // the fallback path
  await measure($, 41, 410_000)
  await settle(a)
  expect(a.compacts).toBe(1)
  await compactLands($) // a typed /compact
  await autoCompaction($)
  await settle(a)
  expect(nudges(a).length).toBe(0)
})

test('nudge: none for "Compact now" via the command, a typed /compact and an auto-compaction', async ($, on) => {
  const w = world($, on, { answer: 'Compact now' })
  await measure($, 41, 410_000)
  await settle(w)
  expect(compacts(w).length).toBe(1)
  await compactLands($)
  await compactLands($)
  await autoCompaction($)
  await settle(w)
  expect(nudges(w).length).toBe(0)
})

test('nudge: continue off (set through the command) sends none', async ($, on) => {
  const w = world($, on, { store: known })
  const r = await typed($, 'context-alert', 'set continue off')
  expect(r.text).toContain('continue = false')
  expect((w.store.get('config') as { continue: boolean }).continue).toBe(false)
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  await compactLands($)
  await settle(w)
  expect(nudges(w).length).toBe(0)
  expect(nudgeLogged(w, 'continue is off')).toBe(true)
  const back = await typed($, 'context-alert', 'set continue on')
  expect(back.text).toContain('continue = true')
})

test('nudge: an old config without the key reads as on; status shows the setting', async ($, on) => {
  const w = world($, on, { store: { ...known, config: { enabled: true, notify: true, percent: 40 } } })
  const r = await typed($, 'context-alert', 'status')
  expect(r.text).toContain('continue true')
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  await compactLands($)
  await settle(w)
  expect(nudges(w).length).toBe(1)
})

test('nudge: the session.compact fallback (the mod\'s own call) nudges exactly once', async ($, on) => {
  const w = world($, on, { store: known, refuse: ['compact'] })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  expect(w.compacts).toBe(1)
  expect(nudges(w).map((n) => n.text)).toEqual([continuePrompt(DOC)])
})

test('nudge: exactly one per compaction, however many times the landing is reported', async ($, on) => {
  const w = world($, on, { store: known })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  await compactLands($)
  await compactLands($)
  await autoCompaction($)
  await settle(w)
  expect(nudges(w).length).toBe(1)
})

test('nudge: a vetoed compaction leaves no intent for a later compaction', async ($, on) => {
  const w = world($, on, { store: known })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  w.compactVeto = true
  await compactLands($) // another plugin vetoes it
  await settle(w)
  w.compactVeto = false
  await autoCompaction($)
  await settle(w)
  expect(nudges(w).length).toBe(0)
})

test('nudge: a compaction that could not start (fallback vetoed) leaves no intent', async ($, on) => {
  const w = world($, on, { store: known, refuse: ['compact'], compactRejects: true })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  expect(w.toasts).toContain("Compaction couldn't start; run /compact")
  w.compactVeto = false
  await autoCompaction($)
  await settle(w)
  expect(nudges(w).length).toBe(0)
})

test('nudge: a compaction that never lands (a main turn starts first) leaves no intent', async ($, on) => {
  const w = world($, on, { store: known })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  await plainTurn($, w) // the queued /compact was dropped; the session moved on
  await autoCompaction($)
  await settle(w)
  expect(nudges(w).length).toBe(0)
})

test('nudge: /clear drops the intent', async ($, on) => {
  const w = world($, on, { store: known })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  await clear($)
  await autoCompaction($)
  await settle(w)
  expect(nudges(w).length).toBe(0)
})

test('nudge: a headless run sends none', async ($, on) => {
  const w = world($, on, { store: known })
  await $.session.start({ cwd: '/', surface: null, isInteractive: false })
  await settle(w)
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  await compactLands($)
  await settle(w)
  expect(nudges(w).length).toBe(0)
})

test('nudge: it starts no flow and opens no alert dialog afterwards', async ($, on) => {
  const w = world($, on, { answer: 'Update handoff, then compact', store: known })
  await measure($, 41, 410_000)
  await settle(w)
  await handoffTurn($, w)
  await compactLands($, focusInstructions(DOC))
  await settle(w)
  expect(nudges(w).length).toBe(1)
  await plainTurn($, w) // the nudge's own turn
  await measure($, 5, 50_000) // the fill after compaction
  await settle(w)
  expect(w.asks.length).toBe(1) // only the first dialog
  expect(w.runs).toEqual([{ command: 'handoff-doc', args: DOC }, { command: 'compact', args: focusInstructions(DOC) }])
  expect(nudges(w).length).toBe(1)
})

test('nudge: a dropped nudge prompt is logged, not retried', async ($, on) => {
  const w = world($, on, { store: known, dropPrompt: (t) => t.startsWith('Continue the work') })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  await compactLands($)
  await settle(w)
  expect(w.logs.some((l) => l.includes('continue nudge dropped'))).toBe(true)
})

// ---- review round: stale nudges (S1) and a stale intent (S2) ----

test('nudge S1: a main turn that started while the landing was being handled cancels it', async ($, on) => {
  const w = world($, on, { store: known })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  w.listDelayMs = 50 // the landing's agent check stays open while the next event arrives
  await compactLands($, focusInstructions(DOC))
  await turnStart($) // the person's queued message begins before the nudge is submitted
  await turnEnd($)
  await w.clock.advance(50)
  await settle(w)
  expect(nudges(w).length).toBe(0)
  expect(w.logs.some((l) => l.includes('a new turn started'))).toBe(true)
})

test('nudge S1: a turn still running at submit time cancels it', async ($, on) => {
  const w = world($, on, { store: known })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  w.listDelayMs = 50 // the landing's agent check stays open while the next event arrives
  await compactLands($, focusInstructions(DOC))
  await turnStart($)
  await w.clock.advance(50)
  await settle(w)
  expect(nudges(w).length).toBe(0)
  expect(w.logs.some((l) => l.includes('a new turn started'))).toBe(true)
})

test('nudge S1: /clear while the landing is being handled cancels it', async ($, on) => {
  const w = world($, on, { store: known })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  w.listDelayMs = 50 // the landing's agent check stays open while the next event arrives
  await compactLands($, focusInstructions(DOC))
  await clear($)
  await w.clock.advance(50)
  await settle(w)
  expect(nudges(w).length).toBe(0)
  expect(w.logs.some((l) => l.includes('a new turn started or the conversation was cleared'))).toBe(true)
})

test('nudge S2: a stale intent does not ride an auto-compaction, with or without instructions', async ($, on) => {
  const w = world($, on, { store: known })
  await hc($)
  await settle(w)
  await handoffTurn($, w) // the flow's /compact is queued, then silently lost
  await autoCompaction($)
  await settle(w)
  expect(nudges(w).length).toBe(0)
  expect(w.logs.some((l) => l.includes('no continue nudge: instructions missing, trigger auto'))).toBe(true)
})

test('nudge S2: a stale intent does not ride a typed /compact with the person\'s own instructions', async ($, on) => {
  const w = world($, on, { store: known })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  await compactLands($, 'focus on the tests')
  await settle(w)
  expect(nudges(w).length).toBe(0)
  expect(w.logs.some((l) => l.includes('instructions differ'))).toBe(true)
})

test('nudge S2: instructions absent with a manual trigger still nudges, and the log says so', async ($, on) => {
  const w = world($, on, { store: known })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  await compactLands($) // trigger manual, no instructions
  await settle(w)
  expect(nudges(w).length).toBe(1)
  expect(w.logs.some((l) => l.includes('continue nudge: instructions missing, trigger manual'))).toBe(true)
})

test('reset session clears a pending nudge, the notification flag and the queued-compaction guard', async ($, on) => {
  const w = world($, on, { store: known })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  await typed($, 'context-alert', 'reset session')
  await compactLands($, focusInstructions(DOC))
  await settle(w)
  expect(nudges(w).length).toBe(0)
})

test('on/off/true/false are case-insensitive for boolean keys', async ($, on) => {
  const w = world($, on)
  await typed($, 'context-alert', 'set continue OFF')
  expect((w.store.get('config') as { continue: boolean }).continue).toBe(false)
  await typed($, 'context-alert', 'set notify False')
  expect((w.store.get('config') as { notify: boolean }).notify).toBe(false)
  await typed($, 'context-alert', 'set continue On')
  expect((w.store.get('config') as { continue: boolean }).continue).toBe(true)
})

test('nudge S1 control: a slow agent check with nothing in between still sends the nudge', async ($, on) => {
  const w = world($, on, { store: known })
  await hc($)
  await settle(w)
  await handoffTurn($, w)
  w.listDelayMs = 50
  await compactLands($, focusInstructions(DOC))
  await settle(w)
  expect(nudges(w).length).toBe(0) // still waiting on the agent list
  await w.clock.advance(50)
  await settle(w)
  expect(nudges(w).length).toBe(1)
})
