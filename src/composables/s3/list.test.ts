import { describe, expect, it, vi } from 'vitest'

const send = vi.fn()
vi.mock('./client', () => ({ client: () => ({ send }) }))

const { listObjects } = await import('./objects')

describe('object listing', () => {
  it('narrows the folder by name start and keeps names relative to the folder', async () => {
    send.mockResolvedValueOnce({
      CommonPrefixes: [{ Prefix: 'raw/sample_1/' }],
      Contents: [{ Key: 'raw/sample_2.fastq', Size: 3 }],
      IsTruncated: false,
    })

    const page = await listObjects('reef', 'raw/', undefined, null, { nameStart: 'sample_' })

    expect(send.mock.calls[0][0].input).toMatchObject({ Bucket: 'reef', Prefix: 'raw/sample_', Delimiter: '/' })
    expect(page.folders).toEqual([{ prefix: 'raw/sample_1/', name: 'sample_1' }])
    expect(page.objects.map((object) => object.name)).toEqual(['sample_2.fastq'])
  })
})
