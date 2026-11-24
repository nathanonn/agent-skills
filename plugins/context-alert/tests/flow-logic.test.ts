import { test, describe, expect } from 'claude-code/testing'
import {
  continuePrompt,
  parseHandoffCompactArgs, busyAgentIds, diffBusy, focusInstructions, waitToast, foldPrompt, alreadyRunningToast,
  HANDOFF_COMPACTING_TOAST, CANCELLED_TOAST, TURN_NOT_FINISHED_TOAST, unionIds, countsTowardWritingCap, pathIgnored,
  autoCompactFocus, autoHandoffPrompt, afterAutoHandoffPrompt, autoDoneNotification, whyLabel, autoCancelledToast, autoStartToast, autoMidTurnToast, autoHandoffArgs,
} from '../hooks/flow-logic'

describe('parseHandoffCompactArgs', () => {
  test('empty and whitespace', () => {
    expect(parseHandoffCompactArgs('')).toEqual({ now: false })
    expect(parseHandoffCompactArgs('   ')).toEqual({ now: false })
  })
  test('now alone, any case', () => {
    expect(parseHandoffCompactArgs('now')).toEqual({ now: true })
    expect(parseHandoffCompactArgs('  NOW  ')).toEqual({ now: true })
  })
  test('a path', () => {
    expect(parseHandoffCompactArgs('docs/handoff.md')).toEqual({ now: false, path: 'docs/handoff.md' })
  })
  test('now plus a path, extra whitespace', () => {
    expect(parseHandoffCompactArgs('  now   docs/h.md  ')).toEqual({ now: true, path: 'docs/h.md' })
  })
  test('path with spaces', () => {
    expect(parseHandoffCompactArgs('my notes/hand off.md')).toEqual({ now: false, path: 'my notes/hand off.md' })
    expect(parseHandoffCompactArgs('now my notes/hand off.md')).toEqual({ now: true, path: 'my notes/hand off.md' })
  })
  test('one matching pair of quotes is stripped', () => {
    expect(parseHandoffCompactArgs('"a b/c.md"')).toEqual({ now: false, path: 'a b/c.md' })
    expect(parseHandoffCompactArgs("now 'a b/c.md'")).toEqual({ now: true, path: 'a b/c.md' })
    expect(parseHandoffCompactArgs('"a.md\'')).toEqual({ now: false, path: '"a.md\'' })
  })
  test('now must be first: otherwise the whole text is the path', () => {
    expect(parseHandoffCompactArgs('docs/h.md now')).toEqual({ now: false, path: 'docs/h.md now' })
    expect(parseHandoffCompactArgs('nowhere.md')).toEqual({ now: false, path: 'nowhere.md' })
    expect(parseHandoffCompactArgs('now/h.md')).toEqual({ now: false, path: 'now/h.md' })
  })
})

describe('agents', () => {
  test('busyAgentIds keeps pending, running, waiting', () => {
    const agents = ['pending', 'running', 'waiting', 'idle', 'completed', 'failed', 'killed'].map(s => ({ id: s, status: s }))
    expect(busyAgentIds(agents)).toEqual(['pending', 'running', 'waiting'])
    expect(busyAgentIds([])).toEqual([])
  })
  test('diffBusy', () => {
    expect(diffBusy([], [])).toEqual([])
    expect(diffBusy(['a', 'b'], ['a', 'b'])).toEqual([])
    expect(diffBusy(['a', 'b'], [])).toEqual(['a', 'b'])
    expect(diffBusy(['b', 'a', 'c'], ['a'])).toEqual(['b', 'c'])
    expect(diffBusy(['a'], ['a', 'new'])).toEqual([])
    expect(diffBusy(['a', 'a', 'b'], [])).toEqual(['a', 'b'])
  })
})

describe('text', () => {
  test('focusInstructions names the path, with a fallback', () => {
    expect(focusInstructions('/x/handoff.md')).toContain('/x/handoff.md')
    expect(focusInstructions('/x/handoff.md')).toContain('Open follow-ups')
    expect(focusInstructions(undefined)).toContain('handoff doc')
  })
  test('waitToast singular and plural', () => {
    expect(waitToast(1)).toBe('Waiting for 1 agent before compacting')
    expect(waitToast(2)).toBe('Waiting for 2 agents before compacting')
    expect(waitToast(2, 1)).toBe('Waiting for 2 agents before compacting (1 other background task not waited on)')
    expect(waitToast(1, 3)).toBe('Waiting for 1 agent before compacting (3 other background tasks not waited on)')
  })
  test('foldPrompt names path, agents, in-place rule', () => {
    const p = foldPrompt([{ id: 'ag1', label: 'Explorer' }, 'ag2'], '/x/h.md')
    expect(p).toContain('/x/h.md')
    expect(p).toContain('Explorer (ag1)')
    expect(p).toContain('ag2')
    expect(p).toContain('in place')
    expect(p).toContain('Do not ask overwrite / append / sequel')
    expect(p).toContain('do not compact')
    expect(foldPrompt(['ag1'])).toContain('the handoff doc')
  })
  test('toasts', () => {
    expect(alreadyRunningToast(2)).toBe('Handoff-compact already in progress (waiting for 2 agents)')
    expect(alreadyRunningToast(1)).toBe('Handoff-compact already in progress (waiting for 1 agent)')
    expect(alreadyRunningToast()).toBe('Handoff-compact already in progress')
    expect(HANDOFF_COMPACTING_TOAST).toBe('Handoff written, compacting.')
    expect(CANCELLED_TOAST).toBe('Compaction cancelled; run /handoff-compact again when ready.')
    expect(TURN_NOT_FINISHED_TOAST).toContain('Handoff turn did not finish')
  })
})

describe('review round 1 helpers', () => {
  test('busyAgentIds: top-level, non-teammate agents only', () => {
    expect(busyAgentIds([
      { id: 'a', status: 'running', kind: 'local_agent' },
      { id: 'n', status: 'running', parentId: 'a' },
      { id: 't', status: 'running', kind: 'in_process_teammate' },
      { id: 'u', status: 'pending', teammateId: 'u@team' },
      { id: 'd', status: 'completed' },
    ])).toEqual(['a'])
  })
  test('unionIds keeps order and drops duplicates', () => {
    expect(unionIds(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c'])
  })
  test('countsTowardWritingCap', () => {
    expect(countsTowardWritingCap(undefined, 'me')).toBe(true)
    expect(countsTowardWritingCap({ kind: 'composer' }, 'me')).toBe(true)
    expect(countsTowardWritingCap({ kind: 'plugin', name: 'me' }, 'me')).toBe(true)
    expect(countsTowardWritingCap({ kind: 'plugin', name: 'other' }, 'me')).toBe(false)
    expect(countsTowardWritingCap({ kind: 'task-notification' }, 'me')).toBe(false)
    expect(countsTowardWritingCap({ kind: 'scheduled-trigger' }, 'me')).toBe(false)
  })
  test('pathIgnored', () => {
    expect(pathIgnored('Busy', undefined)).toBe('Busy')
    expect(pathIgnored('Busy', 'a.md')).toBe('Busy (path a.md ignored)')
  })
  test('continuePrompt: with and without a known path', () => {
    expect(continuePrompt('/p/h.md')).toBe(
      'Continue the work in progress from the handoff doc at /p/h.md. If nothing is left, or the next step needs the user, say so and stop.',
    )
    expect(continuePrompt(undefined)).toBe(
      'Continue the work in progress from the handoff doc. If nothing is left, or the next step needs the user, say so and stop.',
    )
  })
})

describe('autopilot (0.3.0) text', () => {
  test('focusInstructions names the agents still running', () => {
    expect(focusInstructions('/p/h.md', ['a', 'b'])).toBe(
      'A handoff doc for this session is at /p/h.md. Keep that path and its Open follow-ups in the summary. Agents still running: a, b. Their reports arrive after the compaction.',
    )
    expect(focusInstructions('/p/h.md', [])).toBe(focusInstructions('/p/h.md'))
  })
  test('autoCompactFocus: the doc, or the work in progress', () => {
    expect(autoCompactFocus('/p/h.md')).toBe(focusInstructions('/p/h.md'))
    expect(autoCompactFocus(undefined)).toBe('Keep the work in progress, the decisions made and the open follow-ups in the summary.')
  })
  test('autoHandoffPrompt: known path, never asks', () => {
    const t = autoHandoffPrompt('/p/h.md')
    expect(t).toContain('write the handoff doc for this session, using /p/h.md')
    expect(t).toContain('Do not ask me anything')
    expect(t).not.toContain('AskUserQuestion')
  })
  test('autoHandoffPrompt: no path, the folder rules and the default or given folder', () => {
    const t = autoHandoffPrompt(undefined)
    expect(t).toContain('Do not ask me anything: pick the path yourself.')
    expect(t).toContain('a "Latest handoff" line in CLAUDE.md')
    expect(t).toContain('create ./handoff/YYYYMMDD_01_<short-slug>.md')
    expect(t).toContain('write a sequel')
    expect(t).toContain('Say which file you wrote.')
    expect(autoHandoffPrompt(undefined, '/x/y')).toContain('create /x/y/YYYYMMDD_01_')
  })
  test('afterAutoHandoffPrompt adds the continue instruction', () => {
    expect(afterAutoHandoffPrompt('/p/h.md')).toContain('Then continue the work in progress.')
  })
  test('toasts and notification', () => {
    expect(autoStartToast(45, 450000)).toBe('Context at 45% (450k). Auto handoff-compact: writing the handoff doc. Type anything to cancel.')
    expect(autoMidTurnToast(45, 450000)).toBe('Context at 45% (450k). Auto handoff-compact runs when this turn ends.')
    expect(autoCancelledToast('60%')).toBe('Auto handoff-compact cancelled; the next alert is at 60%.')
    expect(autoDoneNotification('/a/b/handoff/x.md', 0)).toBe('Handoff written to …/handoff/x.md, context compacted.')
    expect(autoDoneNotification('/a/b/handoff/x.md', 1)).toBe('Handoff written to …/handoff/x.md, context compacted. 1 agent still running.')
    expect(autoDoneNotification(undefined, 2)).toBe('Handoff written, context compacted. 2 agents still running.')
  })
  test('autoHandoffArgs: the path, then the no-question directive', () => {
    const a = autoHandoffArgs('/p/h.md')
    expect(a.startsWith('/p/h.md Do not ask me anything')).toBe(true)
    expect(a).toContain('do not use AskUserQuestion')
    expect(a).toContain('write a sequel')
    expect(autoHandoffArgs('/p/a b.md').startsWith('"/p/a b.md" ')).toBe(true)
  })
  test('autoCancelledToast says when the doc may still be written', () => {
    expect(autoCancelledToast('60%', true)).toBe('Auto handoff-compact cancelled; the next alert is at 60%. The handoff doc may still be written.')
  })
  test('whyLabel', () => {
    expect(whyLabel('no-agents', false)).toBe('no agents')
    expect(whyLabel('no-agents', true)).toBe('all done')
    expect(whyLabel('room', true)).toBe('room')
    expect(whyLabel('maxWait', true)).toBe('maxWait')
  })
})
