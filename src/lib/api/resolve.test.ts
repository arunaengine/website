import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { readCapped, resolveVersion, type VersionStream } from './resolve'

afterEach(() => {
  vi.unstubAllGlobals()
})

const client = { baseUrl: 'https://api.test/api/v1', token: 'secret' }

describe('resolve a version request', () => {
  it('sends the token in a header and never in the URL', async () => {
    const calls: Array<{ url: string; auth: string | null }> = []
    vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
    vi.stubGlobal('fetch', vi.fn(async (input: URL, init: RequestInit) => {
      calls.push({ url: String(input), auth: new Headers(init.headers).get('Authorization') })
      return new Response('bytes', { status: 200 })
    }))

    const version = await resolveVersion('k3V9xQ2m', '01K8Y2B6D8F0H2K4M6P8R0T2V4', client)

    expect(await new Response(version.body).text()).toBe('bytes')
    expect(calls[0].url).toBe('https://api.test/api/v1/resolve/k3V9xQ2m/01K8Y2B6D8F0H2K4M6P8R0T2V4')
    expect(calls[0].url).not.toContain('secret')
    expect(calls[0].auth).toBe('Bearer secret')
  })

  it('reports a refusal with its status and message', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'No holder answered' }), { status: 503 })))

    const failure = await resolveVersion('k3V9xQ2m', '01K8Y2B6D8F0H2K4M6P8R0T2V4', client).catch((cause) => cause)

    expect(failure).toBeInstanceOf(ApiError)
    expect([failure.status, failure.message]).toEqual([503, 'No holder answered'])
  })

  it('hands the body back unread with its announced size', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
    const response = new Response('bytes', { status: 200, headers: { 'Content-Length': '5', 'Content-Type': 'text/plain' } })
    vi.stubGlobal('fetch', vi.fn(async () => response))

    const version = await resolveVersion('k3V9xQ2m', '01K8Y2B6D8F0H2K4M6P8R0T2V4', client)

    expect([version.size, version.type, response.bodyUsed]).toEqual([5, 'text/plain', false])
  })
})

function counted(chunks: number, chunkSize: number, size: number | null) {
  const state = { pulled: 0, cancelled: false }
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (state.pulled === chunks) return controller.close()
      state.pulled++
      controller.enqueue(new Uint8Array(chunkSize))
    },
    cancel() {
      state.cancelled = true
    },
  })
  return { state, version: { body, size, type: 'text/plain' } satisfies VersionStream }
}

describe('read a stream up to a cap', () => {
  it('collects a stream within the cap', async () => {
    const { version } = counted(3, 4, null)

    const blob = await readCapped(version, 12)

    expect([blob?.size, blob?.type]).toEqual([12, 'text/plain'])
  })

  it('stops reading and cancels once the cap is passed', async () => {
    const { state, version } = counted(1000, 10, null)

    expect(await readCapped(version, 25)).toBeNull()
    expect(state.cancelled).toBe(true)
    expect(state.pulled).toBeLessThan(10)
  })

  it('reads nothing when the announced size is above the cap', async () => {
    const { state, version } = counted(1000, 10, 5000)

    expect(await readCapped(version, 25)).toBeNull()
    expect(state.cancelled).toBe(true)
    expect(state.pulled).toBeLessThan(3)
  })
})
