import { afterEach, describe, expect, it, vi } from 'vitest'
import { listPersistentIds, pidStateMeta, withdrawPid, type PersistentIdState } from './pid'

const PAGE_ORIGIN = 'https://portal.test'
const DOCUMENT_ID = '01JMETADATA0123456789ABCDE'

function stubFetch(response: () => Response) {
  const calls: { url: string; init: RequestInit }[] = []
  vi.stubGlobal('window', { location: { origin: PAGE_ORIGIN } })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL, init: RequestInit) => {
      calls.push({ url: String(input), init })
      return response()
    }),
  )
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('listPersistentIds', () => {
  it('reads the typed status route with the token', async () => {
    const calls = stubFetch(() => new Response('[]', { status: 200 }))

    await listPersistentIds(DOCUMENT_ID, { baseUrl: '/api/v1', token: 'secret' })

    expect(calls[0].url).toBe(`${PAGE_ORIGIN}/api/v1/metadata/${DOCUMENT_ID}/pids`)
    expect(new Headers(calls[0].init.headers).get('Authorization')).toBe('Bearer secret')
  })
})

describe('withdrawPid', () => {
  it('sends the confirmation body and resolves on 204', async () => {
    const calls = stubFetch(() => new Response(null, { status: 204 }))

    await withdrawPid(DOCUMENT_ID, 'https://w3id.org/aruna/x', 'duplicate record', {
      baseUrl: '/api/v1',
    })

    expect(calls[0].url).toBe(`${PAGE_ORIGIN}/api/v1/pid/${DOCUMENT_ID}`)
    expect(calls[0].init.method).toBe('DELETE')
    expect(calls[0].init.body).toBe(
      JSON.stringify({
        provider: 'w3id',
        confirm_pid: 'https://w3id.org/aruna/x',
        reason: 'duplicate record',
      }),
    )
  })
})

describe('pidStateMeta', () => {
  it('labels every lifecycle state', () => {
    // pid.rs: `unknown` is an unreadable authority, never "unminted".
    const states: PersistentIdState[] = [
      'requested',
      'processing',
      'active',
      'failed',
      'admin-withdrawn',
      'tombstoned',
      'unknown',
    ]
    for (const state of states) expect(pidStateMeta(state).label).toBeTruthy()
    expect(pidStateMeta('active').variant).toBe('success')
    expect(pidStateMeta('admin-withdrawn').label).toContain('permanent')
    expect(pidStateMeta('unknown').variant).toBe('warn')
  })
})
