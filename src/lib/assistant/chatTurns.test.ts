import { describe, expect, it } from 'vitest'
import type { ModelMessage } from 'ai'
import { decodeTurn, encodeTurn, joinTurns, mergeTurns, splitTurns, turnKey, type ChatTurn } from './chatTurns'
import type { ChatMessage } from './types'

function user(id: string, text = id, background?: true): ChatMessage {
  return { id, role: 'user', text, calls: [], at: 1, ...(background ? { background } : {}) }
}

function reply(id: string, text = id, error?: string): ChatMessage {
  return { id, role: 'assistant', text, calls: [], at: 2, ...(error ? { error } : {}) }
}

function step(prompt: string, answer = `${prompt} answered`): ModelMessage[] {
  return [{ role: 'user', content: prompt }, { role: 'assistant', content: answer }]
}

function toolStep(prompt: string, callId: string, output: string): ModelMessage[] {
  return [
    { role: 'user', content: prompt },
    { role: 'assistant', content: [{ type: 'tool-call', toolCallId: callId, toolName: 'list', input: {} }] },
    { role: 'tool', content: [{ type: 'tool-result', toolCallId: callId, toolName: 'list', output: { type: 'text', value: output } }] },
    { role: 'assistant', content: 'done' },
  ]
}

function turn(userId: string, ...rest: ChatMessage[]): ChatTurn {
  return { messages: [user(userId), ...rest], history: [] }
}

describe('splitTurns', () => {
  it('starts a turn at each user message and keeps the reply with it', () => {
    const messages = [user('u1'), reply('a1'), user('u2'), reply('a2')]
    const history = [...step('u1'), ...step('u2')]

    const turns = splitTurns(messages, history)

    expect(turns.map((entry) => entry.messages.map((message) => message.id))).toEqual([['u1', 'a1'], ['u2', 'a2']])
    expect(turns.map((entry) => entry.history)).toEqual([step('u1'), step('u2')])
  })

  it('gives a background update its own turn', () => {
    const messages = [user('u1'), reply('a1'), user('bg', 'Background update', true)]

    const turns = splitTurns(messages, step('u1'))

    expect(turns).toHaveLength(2)
    expect(turns[1].messages).toEqual([user('bg', 'Background update', true)])
    expect(turns[1].history).toEqual([])
  })

  it('leaves a failed turn without history and matches from the tail', () => {
    // Only the answered turns wrote history, so the chunks belong to u1 and u3.
    const messages = [user('u1'), reply('a1'), user('u2'), reply('a2', '', 'rate limited'), user('u3'), reply('a3')]

    const turns = splitTurns(messages, [...step('u1'), ...step('u3')])

    expect(turns.map((entry) => entry.history)).toEqual([step('u1'), [], step('u3')])
  })

  it('hands history trimmed from the front to the first turn', () => {
    // Messages start before the history does: the turn for u1 lost its step.
    const messages = [user('u1'), reply('a1'), user('u2'), reply('a2')]

    const turns = splitTurns(messages, [{ role: 'assistant', content: 'stray' }, ...step('u2')])

    expect(turns[0].history).toEqual([{ role: 'assistant', content: 'stray' }])
    expect(turns[1].history).toEqual(step('u2'))
  })

  it('round-trips through joinTurns', () => {
    const messages = [reply('a0'), user('u1'), reply('a1'), user('u2'), reply('a2', '', 'failed'), user('u3')]
    const history = [...step('u1'), ...toolStep('u3', 'c1', 'rows')]

    const joined = joinTurns(splitTurns(messages, history))

    expect(joined.messages).toEqual(messages)
    expect(joined.history).toEqual(history)
    expect(splitTurns([], [])).toEqual([])
  })
})

describe('mergeTurns', () => {
  it('takes the node copy of a shared turn and re-appends the unsent tail', () => {
    // Nothing is known yet, as after a reload: the node holds u1 and u2, this
    // browser still holds u1 and a turn u3 it never sent.
    const local = [turn('u1', reply('a1')), turn('u3')]
    const pulled = [turn('u1', reply('a1', 'from the node')), turn('u2', reply('a2'))]

    const merged = mergeTurns(local, pulled, () => false)

    expect(merged.turns.map(turnKey)).toEqual(['u1', 'u2', 'u3'])
    expect(merged.turns[0].messages[1].text).toBe('from the node')
    expect(merged.unsent.map(turnKey)).toEqual(['u3'])
  })

  it('keeps known turns before the pulled ones after a conflict', () => {
    const local = [turn('u1'), turn('u2'), turn('u3')]
    const known = new Set(['u1', 'u2'])

    const merged = mergeTurns(local, [turn('x1')], (key) => known.has(key))

    expect(merged.turns.map(turnKey)).toEqual(['u1', 'u2', 'x1', 'u3'])
    expect(merged.unsent.map(turnKey)).toEqual(['u3'])
  })

  it('treats every local turn as unsent when the node holds none of them', () => {
    const merged = mergeTurns([turn('u1'), turn('u2')], [], () => false)

    expect(merged.turns.map(turnKey)).toEqual(['u1', 'u2'])
    expect(merged.unsent).toHaveLength(2)
  })
})

describe('encodeTurn', () => {
  const big = 'x'.repeat(30_000)
  const calls = (id: string, output: string) => [{ id, name: 'list', input: { path: '/' }, state: 'done' as const, output }]

  it('leaves a small turn as it is', () => {
    const entry = turn('u1', reply('a1'))

    expect(JSON.parse(encodeTurn(entry))).toEqual(entry)
  })

  it('drops the oldest tool output first, in the card and in the history', () => {
    const entry: ChatTurn = {
      messages: [user('u1'), { ...reply('a1'), calls: [...calls('c1', big), ...calls('c2', big)] }],
      history: [...toolStep('u1', 'c1', big), ...toolStep('u1', 'c2', big).slice(1)],
    }

    const decoded = decodeTurn(encodeTurn(entry))
    const kept = decoded?.messages[1].calls ?? []
    const results = decoded?.history.filter((message) => message.role === 'tool') ?? []

    expect(kept.map((call) => call.output)).toEqual([undefined, big])
    expect(JSON.stringify(results[0])).toContain('left out')
    expect(JSON.stringify(results[1])).toContain(big)
    expect(entry.messages[1].calls[0].output).toBe(big)
  })

  it('cuts the history and then the text before giving up', () => {
    const entry: ChatTurn = {
      messages: [user('u1', 'y'.repeat(8_000)), reply('a1', 'z'.repeat(8_000))],
      history: [{ role: 'user', content: big }, { role: 'assistant', content: big }, { role: 'assistant', content: big }],
    }

    const decoded = decodeTurn(encodeTurn(entry))

    expect(decoded?.history).toEqual([])
    expect(decoded?.messages.map((message) => message.text.length)).toEqual([8_000, 8_000])

    const tiny = decodeTurn(encodeTurn(entry, 5_000))
    expect(tiny?.messages.map((message) => message.text.length)).toEqual([2_000, 2_000])
  })

  it('never returns more than the cap', () => {
    const entry: ChatTurn = {
      messages: Array.from({ length: 12 }, (_, index) => ({ ...reply(`a${index}`, 'q'.repeat(8_000)), calls: calls(`c${index}`, big) })),
      history: [],
    }

    expect(new TextEncoder().encode(encodeTurn(entry, 10_000)).length).toBeLessThanOrEqual(10_000)
  })
})

describe('decodeTurn', () => {
  it('reads what encodeTurn wrote and refuses anything else', () => {
    const entry = { messages: [user('u1'), reply('a1')], history: step('u1') }

    expect(decodeTurn(encodeTurn(entry))).toEqual(entry)
    expect(decodeTurn('{not json')).toBeNull()
    expect(decodeTurn('{"messages":{}}')).toBeNull()
    expect(decodeTurn('{"messages":[{"role":"user"}],"history":[{"role":"wat"}]}')).toEqual({ messages: [], history: [] })
  })
})
