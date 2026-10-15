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

describe('object copy', () => {
  it('encodes a key that holds a version query so the copy reads that key', async () => {
    const { copyObject } = await import('./objects')
    send.mockResolvedValueOnce({})

    await copyObject({ bucket: 'reef', key: 'raw/a?versionId=x#b c.txt' }, 'reef', 'raw/copy.txt', null)

    const source = send.mock.calls.at(-1)?.[0].input.CopySource
    expect(source).toBe('reef/raw/a%3FversionId%3Dx%23b%20c.txt')
    expect(source).not.toContain('?')
  })
})

describe('recursive listing', () => {
  it('skips folder markers unless a caller asks for them', async () => {
    const { listObjectsRecursive } = await import('./objects')
    const page = { Contents: [{ Key: 'raw/' }, { Key: 'raw/a.txt' }, { Key: 'raw/empty/' }], IsTruncated: false }
    send.mockResolvedValueOnce(page).mockResolvedValueOnce(page)

    const plain = await listObjectsRecursive('reef', 'raw/', 10, null)
    const withMarkers = await listObjectsRecursive('reef', 'raw/', 10, null, { markers: true })

    expect(plain.objects.map((object) => object.key)).toEqual(['raw/a.txt'])
    expect(withMarkers.objects.map((object) => object.key)).toEqual(['raw/', 'raw/a.txt', 'raw/empty/'])
  })
})
