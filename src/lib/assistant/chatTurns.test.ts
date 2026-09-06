import { describe, expect, it } from 'vitest'
import type { ModelMessage } from 'ai'
import { decodeTurn, encodeTurn, joinTurns, mergeTurns, splitTurns, turnKey, type ChatTurn } from './chatTurns'
import type { ChatMessage, ToolCallView } from './types'

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

/** One answered call: the card entry and the history parts that carry it. */
function call(id: string, name: string, output: unknown, view?: ToolCallView['view']) {
  const text = typeof output === 'string' ? output : JSON.stringify(output)
  return {
    call: { id, name, input: { id }, state: 'done' as const, output, ...(view ? { view } : {}) } satisfies ToolCallView,
    request: { type: 'tool-call' as const, toolCallId: id, toolName: name, input: { id } },
    result: {
      type: 'tool-result' as const,
      toolCallId: id,
      toolName: name,
      output: typeof output === 'string' ? { type: 'text' as const, value: text } : { type: 'json' as const, value: output },
    },
  }
}

function answered(prompt: string, ...entries: ReturnType<typeof call>[]): ChatTurn {
  return {
    messages: [user(prompt), { ...reply(`${prompt}-a`, 'done'), calls: entries.map((entry) => entry.call) }],
    history: [
      { role: 'user', content: prompt },
      { role: 'assistant', content: entries.map((entry) => entry.request) },
      { role: 'tool', content: entries.map((entry) => entry.result) },
      { role: 'assistant', content: 'done' },
    ],
  }
}

function bytes(payload: string): number {
  return new TextEncoder().encode(payload).length
}

describe('encodeTurn', () => {
  const big = 'x'.repeat(30_000)
  const calls = (id: string, output: string) => [{ id, name: 'list', input: { path: '/' }, state: 'done' as const, output }]
  const record = {
    bucket: 'work',
    key: 'out/plot.png',
    versionId: 'v1',
    name: 'plot.png',
    contentType: 'image/png',
    previewKind: 'image' as const,
    size: 48_000,
    jobId: 'job-1',
  }
  const plot: ToolCallView['view'] = { kind: 'artifact', title: 'plot.png', artifact: { url: 'blob:aruna/plot', text: 'bytes', ...record } }
  const table: ToolCallView['view'] = { kind: 'table', title: 'Outputs', columns: ['key', 'size'], rows: [['plot.png', 48_000]] }

  it('leaves a small turn as it is', () => {
    const entry = turn('u1', reply('a1'))

    expect(JSON.parse(encodeTurn(entry))).toEqual(entry)
  })

  it('stores each tool result once and reads it back onto the call', () => {
    const entry = answered('u1', call('c1', 'list_buckets', { buckets: ['work'] }), call('c2', 'read_object', 'rows'))

    const payload = encodeTurn(entry)
    const decoded = decodeTurn(payload)

    expect(payload.split('"buckets"')).toHaveLength(2)
    expect(payload.split('rows')).toHaveLength(2)
    expect(decoded?.messages[1].calls.map((entry) => entry.output)).toEqual([{ buckets: ['work'] }, 'rows'])
    expect(decoded?.history).toEqual(entry.history)
  })

  it('stores a turn under the cap as it is, apart from minifying results', () => {
    const pretty = '{\n  "reads": 12,\n  "name": "a  b"  \n}  '
    const entry = answered('u1', call('c1', 'read_object', pretty), call('c2', 'stat', 'plain text  \nline two   '))

    const stored = JSON.parse(encodeTurn(entry)) as ChatTurn
    const outputs = stored.history[2].content as Array<{ output: { value: string } }>

    expect(outputs.map((part) => part.output.value)).toEqual(['{"reads":12,"name":"a  b"}', 'plain text\nline two'])
    expect(stored.messages[1].calls.map((entry) => entry.input)).toEqual([{ id: 'c1' }, { id: 'c2' }])
    expect(stored.messages[0]).toEqual(entry.messages[0])
  })

  it('cuts the largest results first, down to the floor, and leaves the cards alone', () => {
    const entry = answered(
      'u1',
      call('c1', 'read_object', 'y'.repeat(10_000)),
      call('c2', 'web_search', big),
      call('c3', 'show_table', 'shown', table),
    )

    const decoded = decodeTurn(encodeTurn(entry, 16_000))
    const outputs = decoded?.messages[1].calls.map((entry) => entry.output) ?? []

    expect(outputs[0]).toBe('y'.repeat(10_000))
    expect(outputs[1]).toBe(`${'x'.repeat(4_000)} [cut, 30,000 characters]`)
    expect(outputs[2]).toBe('shown')
    expect(decoded?.messages[1].calls[2].view).toEqual(table)
    expect(entry.messages[1].calls[1].output).toBe(big)
  })

  it('stores a card as a reference without its bytes', () => {
    const entry = answered('u1', call('c1', 'show_artifact', 'shown', plot))

    const decoded = decodeTurn(encodeTurn(entry))
    const view = decoded?.messages[1].calls[0].view

    expect(view).toEqual({ kind: 'artifact', title: 'plot.png', artifact: { url: '', ...record } })
    expect(entry.messages[1].calls[0].view).toBe(plot)
  })

  it('keeps a turn shaped like a measured one small, with every card', () => {
    // Eight calls as seen in a live chat: a file dump, a listing, two searches
    // and four cards; stored once each, the results fit under a fourth of the cap.
    const entry = answered(
      'u1',
      call('c1', 'read_object', 'r'.repeat(15_372)),
      call('c2', 'list_job_outputs', 'l'.repeat(3_188)),
      call('c3', 'web_search', 'w'.repeat(3_100)),
      call('c4', 'web_search', 'w'.repeat(3_100)),
      call('c5', 'show_artifact', 'shown', plot),
      call('c6', 'show_table', 'shown', table),
      call('c7', 'show_chart', 'shown', { kind: 'chart', title: 'Reads', chart: 'bar', labels: ['a'], series: [{ name: 'n', values: [1] }] }),
      call('c8', 'show_stats', 'shown', { kind: 'stats', title: 'Run', items: [{ label: 'reads', value: '12' }] }),
    )

    const stored = encodeTurn(entry, 24 * 1024)
    const decoded = decodeTurn(stored)

    expect(bytes(stored)).toBeLessThan(24 * 1024)
    expect(bytes(encodeTurn(entry))).toBeLessThan(bytes(JSON.stringify(entry)))
    expect(decoded?.messages[1].calls.filter((entry) => entry.view)).toHaveLength(4)
    expect(decoded?.messages[1].calls[0].output).toBe(`${'r'.repeat(4_000)} [cut, 15,372 characters]`)
  })

  it('keeps which model answered through every step', () => {
    const model = { providerId: 'p-1', providerLabel: 'OpenAI', model: 'gpt-5.6-sol' }
    const entry = answered('u1', call('c1', 'read_object', big))
    entry.messages[1].model = model

    expect(decodeTurn(encodeTurn(entry))?.messages[1].model).toEqual(model)
    expect(decodeTurn(encodeTurn(entry, 600))?.messages[1].model).toEqual(model)
  })

  it('keeps the cards through every trim step', () => {
    const entry = answered('u1', call('c1', 'show_artifact', 'shown', plot), call('c2', 'read_object', big))

    const decoded = decodeTurn(encodeTurn(entry, 900))
    const kept = decoded?.messages[1].calls ?? []

    expect(decoded?.history).toEqual([])
    expect(kept.map((entry) => [entry.name, entry.state, entry.input])).toEqual([
      ['show_artifact', 'done', undefined],
      ['read_object', 'done', undefined],
    ])
    expect(kept[0].view).toEqual({ kind: 'artifact', title: 'plot.png', artifact: { url: '', ...record } })
  })

  it('cuts the history and then the text before giving up', () => {
    const entry: ChatTurn = {
      messages: [user('u1', 'y'.repeat(8_000)), reply('a1', 'z'.repeat(8_000))],
      history: [{ role: 'user', content: big }, { role: 'assistant', content: big }, { role: 'assistant', content: big }],
    }

    const decoded = decodeTurn(encodeTurn(entry, 64 * 1024))

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
