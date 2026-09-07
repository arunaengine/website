import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { openSessionStream, sessionAbsent, sessionEventFrom, sessionNotHere, type SessionEvent } from './session'

const client = () => ({ baseUrl: 'https://node-a.example/api/v1', token: 'bearer-token' })

beforeEach(() => {
  vi.stubGlobal('window', { location: { origin: 'https://portal.example' } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A promise the test resolves when the stream reached the point it waits for. */
function deferred<T = void>() {
  let settle: (value: T) => void = () => {}
  const promise = new Promise<T>((resolve) => {
    settle = resolve
  })
  return { promise, settle }
}

/** A response whose body hands out the given chunks, then ends or stays open. */
function streamResponse(chunks: string[], hold: boolean): Response {
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
  return { ok: true, status: 200, statusText: 'OK', headers: new Headers({ 'Content-Type': 'text/event-stream' }), body } as unknown as Response
}

function frame(id: number, event: string, data: unknown): string {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

interface Attempt {
  url: URL
  headers: Headers
}

/**
 * Runs the stream over the given connections and waits until `until` many
 * events arrived, so no test waits on the clock.
 */
async function collect(connections: string[][], until: number, options: Record<string, unknown> = {}) {
  const events: SessionEvent[] = []
  const attempts: Attempt[] = []
  const enough = deferred()
  let call = 0
  const fetchImpl = vi.fn(async (url: URL, init: RequestInit) => {
    attempts.push({ url, headers: init.headers as Headers })
    const chunks = connections[Math.min(call, connections.length - 1)]
    call += 1
    return streamResponse(chunks, call >= connections.length)
  }) as unknown as typeof fetch
  const stream = openSessionStream({
    jobId: '01JOB',
    client,
    onEvent: (event) => {
      events.push(event)
      if (events.length >= until) enough.settle()
    },
    fetchImpl,
    retryDelayMs: () => 0,
    ...options,
  })
  await enough.promise
  stream.close()
  return { events, attempts, stream }
}

describe('sessionEventFrom', () => {
  it('refuses an unknown event name and broken data', () => {
    expect(sessionEventFrom({ id: '1', event: 'other', data: '{}' })).toBeNull()
    expect(sessionEventFrom({ id: '1', event: 'cell', data: 'not json' })).toBeNull()
  })
})

describe('openSessionStream', () => {
  it('retries a starting JSON state without announcing an open stream', async () => {
    const arrived = deferred()
    const onOpen = vi.fn()
    const events: SessionEvent[] = []
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(Response.json({ job_id: '01JOB', state: 'starting', cells: [] }))
      .mockResolvedValueOnce(streamResponse([frame(1, 'kernel', { state: 'idle' })], true))
    const stream = openSessionStream({
      jobId: '01JOB', client, fetchImpl, retryDelayMs: () => 0, onOpen,
      onEvent: (event) => { events.push(event); if (event.type === 'kernel') arrived.settle() },
    })
    await arrived.promise
    stream.close()
    expect(events[0]).toMatchObject({ type: 'session', data: { state: 'starting' } })
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('resets a future resume point when a restarted node sends a gap', async () => {
    const { attempts } = await collect(
      [[frame(0, 'gap', { from: 0, to: 0 })], [frame(1, 'kernel', { state: 'idle' })]], 2,
      { lastEventId: 100 },
    )
    expect(attempts[0].url.searchParams.get('after')).toBe('100')
    expect(attempts[1].url.searchParams.has('after')).toBe(false)
  })

  it('sends the bearer and reads the contract events', async () => {
    const { events, attempts } = await collect(
      [
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
      ],
      5,
    )
    expect(attempts[0].headers.get('Authorization')).toBe('Bearer bearer-token')
    expect(attempts[0].headers.get('Accept')).toBe('text/event-stream')
    expect(events.map((event) => event.type)).toEqual(['session', 'kernel', 'cell', 'output', 'ended'])
    expect(events[3]).toMatchObject({ id: 4, type: 'output', data: { cell_id: 'c1', seq: 1 } })
  })

  it('reassembles an event split across chunks', async () => {
    const { events } = await collect([['id: 1\nevent: kernel\nda', 'ta: {"state":"idle"}\n\n']], 1)
    expect(events).toEqual([{ id: 1, type: 'kernel', data: { state: 'idle' } }])
  })

  it('resumes with the after parameter and never a header', async () => {
    // A cross-origin node would refuse a Last-Event-ID header at the preflight.
    const { attempts } = await collect(
      [[frame(9, 'kernel', { state: 'idle' })], [frame(10, 'kernel', { state: 'busy' })]],
      2,
    )
    expect(attempts[0].url.searchParams.has('after')).toBe(false)
    expect(attempts[1].url.searchParams.get('after')).toBe('9')
    for (const attempt of attempts) expect(attempt.headers.has('Last-Event-ID')).toBe(false)
  })

  it('starts from a resume point the caller kept', async () => {
    const { attempts } = await collect([[frame(42, 'kernel', { state: 'idle' })]], 1, { lastEventId: 41 })
    expect(attempts[0].url.searchParams.get('after')).toBe('41')
  })

  it('reports a gap so the caller re-fetches the state', async () => {
    const { events } = await collect([[frame(1, 'gap', { from: 2, to: 40 })]], 1)
    expect(events).toEqual([{ id: 1, type: 'gap', data: { from: 2, to: 40 } }])
  })

  it('ignores keep-alive comments between events', async () => {
    const { events } = await collect([[': keep-alive\n\n', frame(1, 'kernel', { state: 'idle' })]], 1)
    expect(events).toHaveLength(1)
  })

  it('reconnects after a failed connection', async () => {
    const errors: unknown[] = []
    const events: SessionEvent[] = []
    const arrived = deferred()
    let call = 0
    const fetchImpl = vi.fn(async () => {
      call += 1
      if (call === 1) throw new Error('connection lost')
      return streamResponse([frame(1, 'kernel', { state: 'idle' })], true)
    }) as unknown as typeof fetch
    const stream = openSessionStream({
      jobId: '01JOB',
      client,
      onEvent: (event) => {
        events.push(event)
        arrived.settle()
      },
      onError: (error) => errors.push(error),
      fetchImpl,
      retryDelayMs: () => 0,
    })
    await arrived.promise
    stream.close()
    expect(errors).toHaveLength(1)
    expect(events).toHaveLength(1)
    expect(stream.lastEventId()).toBe(1)
  })

  it('hands a refusal to the caller with its code', async () => {
    const refused = deferred<unknown>()
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: async () => ({ code: 'session_not_here', error: 'elsewhere', executor_node_id: 'node-b' }),
    })) as unknown as typeof fetch
    const stream = openSessionStream({
      jobId: '01JOB',
      client,
      onEvent: () => {},
      onError: (error) => refused.settle(error),
      fetchImpl,
      retryDelayMs: () => 0,
    })
    const error = await refused.promise
    stream.close()
    expect(sessionNotHere(error)).toBe('node-b')
  })

  it('reads a fresh client on every attempt', async () => {
    const arrived = deferred()
    const tokens: (string | null)[] = []
    let token = 'first'
    let call = 0
    const fetchImpl = vi.fn(async (_url: URL, init: RequestInit) => {
      tokens.push((init.headers as Headers).get('Authorization'))
      call += 1
      if (call === 1) throw new Error('connection lost')
      arrived.settle()
      return streamResponse([], true)
    }) as unknown as typeof fetch
    const stream = openSessionStream({
      jobId: '01JOB',
      client: () => ({ baseUrl: 'https://node-a.example/api/v1', token }),
      onEvent: () => {},
      onError: () => {
        token = 'second'
      },
      fetchImpl,
      retryDelayMs: () => 0,
    })
    await arrived.promise
    stream.close()
    expect(tokens).toEqual(['Bearer first', 'Bearer second'])
  })

  it('stops for good once it is closed', async () => {
    vi.useFakeTimers()
    try {
      // A connection that ends at once makes the loop want to reconnect.
      const fetchImpl = vi.fn(async () => streamResponse([], false))
      const stream = openSessionStream({
        jobId: '01JOB',
        client,
        onEvent: () => {},
        fetchImpl: fetchImpl as unknown as typeof fetch,
        retryDelayMs: () => 1_000,
      })
      await vi.advanceTimersByTimeAsync(1)
      const before = fetchImpl.mock.calls.length
      expect(before).toBe(1)

      stream.close()
      await vi.runAllTimersAsync()
      expect(fetchImpl.mock.calls.length).toBe(before)
    } finally {
      vi.useRealTimers()
    }
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
