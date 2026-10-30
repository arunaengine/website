import { afterEach, describe, expect, it, vi } from 'vitest'
import { probeNode } from './node-probe'

afterEach(() => vi.unstubAllGlobals())

describe('node probe', () => {
  it('asks for usage with the session and hides a refused figure', async () => {
    const calls: Array<{ url: string; auth?: string }> = []
    vi.stubGlobal('window', { setTimeout, clearTimeout })
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
      calls.push({ url, auth: init?.headers?.Authorization })
      if (url.endsWith('/system/usage')) return { ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({}) }
      return { ok: true, status: 200, statusText: 'OK', json: async () => ({ api_version: '3' }) }
    }))

    const probe = await probeNode('https://node-2.test/api/v1', 'session')

    expect(probe.state).toBe('ok')
    expect(probe.usage).toBeNull()
    expect(calls.find((call) => call.url.endsWith('/system/usage'))?.auth).toBe('Bearer session')
    expect(calls.filter((call) => call.url.endsWith('/system/info')).every((call) => !call.auth)).toBe(true)
  })
})
