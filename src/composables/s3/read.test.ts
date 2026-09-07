import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./client', () => ({ client: () => ({}) }))
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: async () => 'https://s3.example/object' }))

const { getObjectText } = await import('./objects')

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
})
