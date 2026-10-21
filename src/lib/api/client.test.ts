import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiRequest, setSessionGate } from './client'

function respond() {
  const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  return fetchMock
}
const sent = (fetchMock: ReturnType<typeof respond>) =>
  new Headers((fetchMock.mock.calls[0] as unknown as [unknown, RequestInit])[1].headers).get('Authorization')

afterEach(() => {
  setSessionGate(null)
  vi.unstubAllGlobals()
})

describe('session gate', () => {
  it('holds a request with an empty token until the stored token is restored, then signs it', async () => {
    const fetchMock = respond()
    let restored: () => void = () => {}
    const pending = new Promise<void>((resolve) => (restored = resolve))
    let token = ''
    setSessionGate({ pending: () => pending, token: () => token, baseUrl: () => 'https://api.test' })

    const answer = apiRequest('/data/sync/relationships', {}, { baseUrl: 'https://api.test', token: '' })
    await Promise.resolve()
    expect(fetchMock).not.toHaveBeenCalled()
    token = 'restored'
    restored()
    await answer
    expect(sent(fetchMock)).toBe('Bearer restored')
  })

  it('never holds the request that restores the session', async () => {
    const fetchMock = respond()
    setSessionGate({ pending: () => new Promise<void>(() => {}), token: () => 'x', baseUrl: () => 'https://api.test' })
    await apiRequest('/system/realm', {}, { baseUrl: 'https://api.test' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sent(fetchMock)).toBeNull()
  })

  it('does not hand the restored token to a request for another base', async () => {
    const fetchMock = respond()
    setSessionGate({ pending: () => Promise.resolve(), token: () => 'restored', baseUrl: () => 'https://api.test' })
    await apiRequest('/x', {}, { baseUrl: 'https://other.test', token: '' })
    expect(sent(fetchMock)).toBeNull()
  })

  it('sends at once when nothing is being restored', async () => {
    const fetchMock = respond()
    setSessionGate({ pending: () => null, token: () => '', baseUrl: () => 'https://api.test' })
    await apiRequest('/x', {}, { baseUrl: 'https://api.test', token: '' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
