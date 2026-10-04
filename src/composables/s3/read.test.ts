import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./client', () => ({ client: () => ({}) }))
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: async () => 'https://s3.example/object' }))

const { getObjectText, probeObjectAccess } = await import('./objects')

afterEach(() => vi.unstubAllGlobals())

describe('object reads', () => {
  it('keeps missing-object and authorization statuses distinguishable', async () => {
    for (const status of [404, 403, 503]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })))
      await expect(getObjectText('bucket', 'notebook.ipynb')).rejects.toMatchObject({
        $metadata: { httpStatusCode: status },
      })
    }
  })

  it('marks a locked bucket only when the node sends the lock header', async () => {
    const locked = () => new Response('', { status: 403, headers: { 'x-aruna-bucket-locked': 'true' } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(locked()))
    await expect(getObjectText('bucket', 'notes.txt')).rejects.toMatchObject({ bucketLocked: true })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })))
    await expect(getObjectText('bucket', 'notes.txt')).rejects.toMatchObject({ bucketLocked: false })
  })

  it('probes access with a one-byte range and never blocks on an unclear answer', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('', { status: 403, headers: { 'x-aruna-bucket-locked': 'true' } }))
    vi.stubGlobal('fetch', fetch)
    expect(await probeObjectAccess('https://s3.example/object')).toBe('locked')
    expect(fetch.mock.calls[0][1]).toEqual({ headers: { Range: 'bytes=0-0' } })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x', { status: 206 })))
    expect(await probeObjectAccess('https://s3.example/object')).toBe('open')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('cors')))
    expect(await probeObjectAccess('https://s3.example/object')).toBe('unknown')
    expect(await probeObjectAccess('blob:local')).toBe('unknown')
  })
})
