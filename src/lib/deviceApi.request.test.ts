import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyEntryAction, applyFolderAction, listEntries, type DeviceClient } from './deviceApi'

// The device's own listener, never the realm's.
const client: DeviceClient = { baseUrl: 'http://127.0.0.1:9000/api/v1', token: 'owner-token' }

interface Call {
  url: string
  method: string
  body: unknown
  authorization: string | null
}

let calls: Call[] = []

function stubFetch(answer: unknown = {}): void {
  vi.stubGlobal('fetch', async (input: URL | string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    calls.push({
      url: String(input),
      method: (init.method ?? 'GET').toUpperCase(),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : null,
      authorization: headers.get('Authorization'),
    })
    return new Response(JSON.stringify(answer), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
}

beforeEach(() => {
  calls = []
  // apiUrl resolves relative bases against the window's origin.
  vi.stubGlobal('window', { location: { origin: 'http://127.0.0.1:9000' } })
  stubFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('entry actions', () => {
  it('carries the entry path as one encoded segment', async () => {
    await applyEntryAction(
      'f1',
      'notes/2026/day one.md',
      { action: 'replace_local', expected: { fingerprint: 'fp', blake3: 'aa', remote_version: 'v7' } },
      client,
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('POST')
    expect(calls[0].url).toBe(
      'http://127.0.0.1:9000/api/v1/device/folders/f1/entries/notes%2F2026%2Fday%20one.md/actions',
    )
    expect(calls[0].authorization).toBe('Bearer owner-token')
    expect(calls[0].body).toEqual({
      action: 'replace_local',
      expected: { fingerprint: 'fp', blake3: 'aa', remote_version: 'v7' },
    })
  })

  it('escapes a folder id too', async () => {
    await applyEntryAction('f/1', 'a.txt', { action: 'keep_local', expected: { fingerprint: 'fp', blake3: 'aa' } }, client)

    expect(calls[0].url).toContain('/device/folders/f%2F1/entries/a.txt/actions')
  })
})

describe('folder actions', () => {
  it('sends the scope and the typed folder name', async () => {
    await applyFolderAction('f1', { action: 'replace_local', scope: 'all_pending', confirm: 'data-2026' }, client)

    expect(calls[0].url).toBe('http://127.0.0.1:9000/api/v1/device/folders/f1/actions')
    expect(calls[0].body).toEqual({ action: 'replace_local', scope: 'all_pending', confirm: 'data-2026' })
  })
})

describe('entry listing', () => {
  it('asks for one state and follows the cursor', async () => {
    await listEntries('f1', { state: 'conflict', cursor: 'c2', limit: 50 }, client)

    const url = new URL(calls[0].url)
    expect(url.pathname).toBe('/api/v1/device/folders/f1/entries')
    expect(url.searchParams.get('state')).toBe('conflict')
    expect(url.searchParams.get('cursor')).toBe('c2')
    expect(url.searchParams.get('limit')).toBe('50')
  })

  it('leaves the state out when every file is wanted', async () => {
    await listEntries('f1', { state: '' }, client)

    expect(new URL(calls[0].url).searchParams.has('state')).toBe(false)
  })
})
