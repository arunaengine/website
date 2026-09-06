import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import {
  openSessionStream,
  parseSseFrame,
  sessionAbsent,
  sessionEventFrom,
  sessionNotHere,
  type SessionEvent,
} from './session'

const client = { baseUrl: 'https://node-a.example/api/v1', token: 'bearer-token' }

beforeEach(() => {
  vi.stubGlobal('window', { location: { origin: 'https://portal.example' } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A response whose body hands out the given chunks, then ends. */
function streamResponse(chunks: string[], hold = false): Response {
  const encoder = new TextEncoder()
  let index = 0
  const body = {
    getReader: () => ({
      read: async () => {
        if (index < chunks.length) return { done: false, value: encoder.encode(chunks[index++]) }
        // A held stream never ends, the way a live connection behaves.
        if (hold) return new Promise<never>(() => {})
        return { done: true, value: undefined }
      },
    }),
  }
  return { ok: true, status: 200, statusText: 'OK', body } as unknown as Response
}

function frame(id: number, event: string, data: unknown): string {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

async function collect(chunks: string[][], options: Record<string, unknown> = {}) {
  const events: SessionEvent[] = []
  const urls: URL[] = []
  const headers: Headers[] = []
  let call = 0
  const fetchImpl = vi.fn(async (url: URL, init: RequestInit) => {
    urls.push(url)
    headers.push(init.headers as Headers)
    const chunk = chunks[Math.min(call, chunks.length - 1)]
    call += 1
    return streamResponse(chunk, call >= chunks.length)
  }) as unknown as typeof fetch
  const stream = openSessionStream({
    jobId: '01JOB',
    client,
    onEvent: (event) => events.push(event),
    fetchImpl,
    retryDelayMs: () => 0,
    ...options,
  })
  // Let the reader drain what the mocked body holds.
  for (let step = 0; step < 20; step += 1) await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 5))
  stream.close()
  return { events, urls, headers, stream }
}

describe('parseSseFrame', () => {
  it('reads id, event and joined data lines', () => {
    expect(parseSseFrame('id: 7\nevent: cell\ndata: {"a":1}\ndata: ')).toEqual({
      id: '7',
      event: 'cell',
      data: '{"a":1}\n',
    })
  })

  it('ignores a keep-alive comment', () => {
    expect(parseSseFrame(': keep-alive')).toBeNull()
  })
})

describe('sessionEventFrom', () => {
  it('refuses an unknown event name and broken data', () => {
    expect(sessionEventFrom({ id: '1', event: 'other', data: '{}' })).toBeNull()
    expect(sessionEventFrom({ id: '1', event: 'cell', data: 'not json' })).toBeNull()
  })
})

describe('openSessionStream', () => {
  it('sends the bearer and reads the contract events', async () => {
    const { events, headers } = await collect([
      [
        frame(1, 'session', { job_id: '01JOB', state: 'ready', last_event_id: 1 }),
        frame(2, 'kernel', { state: 'busy' }),
        frame(3, 'cell', { cell_id: 'c1', state: 'running' }),
        frame(4, 'output', {
          cell_id: 'c1',
          seq: 1,
          output: { output_type: 'stream', name: 'stdout', text: 'hi\n' },
        }),
        frame(5, 'ended', { reason: 'idle' }),
      ],
    ])
    expect(headers[0].get('Authorization')).toBe('Bearer bearer-token')
    expect(headers[0].get('Accept')).toBe('text/event-stream')
    expect(events.map((event) => event.type)).toEqual(['session', 'kernel', 'cell', 'output', 'ended'])
    expect(events[3]).toMatchObject({ id: 4, type: 'output', data: { cell_id: 'c1', seq: 1 } })
  })

  it('reassembles an event split across chunks', async () => {
    const { events } = await collect([['id: 1\nevent: kernel\nda', 'ta: {"state":"idle"}\n\n']])
    expect(events).toEqual([{ id: 1, type: 'kernel', data: { state: 'idle' } }])
  })

  it('resumes after the last event id it saw', async () => {
    const { urls, headers } = await collect([
      [frame(9, 'kernel', { state: 'idle' })],
      [frame(10, 'kernel', { state: 'busy' })],
    ])
    expect(headers[0].has('Last-Event-ID')).toBe(false)
    expect(headers[1].get('Last-Event-ID')).toBe('9')
    expect(urls[1].searchParams.get('after')).toBe('9')
  })

  it('starts from a resume point the caller kept', async () => {
    const { headers, urls } = await collect([[frame(42, 'kernel', { state: 'idle' })]], {
      lastEventId: 41,
    })
    expect(headers[0].get('Last-Event-ID')).toBe('41')
    expect(urls[0].searchParams.get('after')).toBe('41')
  })

  it('reports a gap so the caller re-fetches the state', async () => {
    const { events } = await collect([[frame(1, 'gap', { from: 2, to: 40 })]])
    expect(events).toEqual([{ id: 1, type: 'gap', data: { from: 2, to: 40 } }])
  })

  it('ignores keep-alive comments between events', async () => {
    const { events } = await collect([[': keep-alive\n\n', frame(1, 'kernel', { state: 'idle' })]])
    expect(events).toHaveLength(1)
  })

  it('reconnects after a failed connection', async () => {
    const errors: unknown[] = []
    let call = 0
    const fetchImpl = vi.fn(async () => {
      call += 1
      if (call === 1) throw new Error('connection lost')
      return streamResponse([frame(1, 'kernel', { state: 'idle' })], true)
    }) as unknown as typeof fetch
    const events: SessionEvent[] = []
    const stream = openSessionStream({
      jobId: '01JOB',
      client,
      onEvent: (event) => events.push(event),
      onError: (error) => errors.push(error),
      fetchImpl,
      retryDelayMs: () => 0,
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    stream.close()
    expect(errors).toHaveLength(1)
    expect(events).toHaveLength(1)
    expect(stream.lastEventId()).toBe(1)
  })

  it('stops for good once it is closed', async () => {
    const fetchImpl = vi.fn(async () => streamResponse([], false)) as unknown as typeof fetch
    const stream = openSessionStream({
      jobId: '01JOB',
      client,
      onEvent: () => {},
      fetchImpl,
      retryDelayMs: () => 0,
    })
    await new Promise((resolve) => setTimeout(resolve, 5))
    stream.close()
    const calls = (fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(calls)
  })
})

describe('session errors', () => {
  it('names the node that runs the session', () => {
    const error = new ApiError(409, 'session_not_here', 'session_not_here', {
      executor_node_id: 'node-b',
    })
    expect(sessionNotHere(error)).toBe('node-b')
    expect(sessionNotHere(new ApiError(409, 'cell_busy', 'cell_busy'))).toBeNull()
  })

  it('reads a missing session off a 404', () => {
    expect(sessionAbsent(new ApiError(404, 'not found'))).toBe(true)
    expect(sessionAbsent(new ApiError(409, 'busy'))).toBe(false)
  })
})
