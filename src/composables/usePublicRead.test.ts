import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const listGroupDataPaths = vi.fn()
const createGroupRole = vi.fn()

let grantPublicRead: typeof import('./usePublicRead').grantPublicRead

beforeAll(async () => {
  vi.doMock('@/lib/api', () => ({ listGroupDataPaths }))
  vi.doMock('./aruna/groups', () => ({ createGroupRole }))
  vi.doMock('./aruna/state', () => ({ refreshContext: () => ({ epoch: 0, client: { baseUrl: 'b', token: 't' } }) }))
  grantPublicRead = (await import('./usePublicRead')).grantPublicRead
})

afterAll(() => {
  vi.doUnmock('@/lib/api')
  vi.doUnmock('./aruna/groups')
  vi.doUnmock('./aruna/state')
})

describe('grantPublicRead', () => {
  it('grants everyone read on exactly the listed files and reports the rest', async () => {
    listGroupDataPaths
      .mockResolvedValueOnce({
        entries: [{ permission_path: '/realm/g/group-1/data/node-1/bucket-a/', kind: 'folder' }],
        continuation_token: 'more',
      })
      .mockResolvedValueOnce({
        entries: [{ permission_path: '/realm/g/group-1/data/node-1/bucket-b', kind: 'folder' }],
      })
    createGroupRole.mockResolvedValue({ role_id: 'r' })

    const result = await grantPublicRead('group-1', 'Public read: datasets/x', [
      { entity_id: 'a', bucket: 'bucket-a', key: 'raw/reads.fastq' },
      { entity_id: 'b', bucket: 'bucket-b', key: 'notes.txt' },
      { entity_id: 'c', bucket: 'other-bucket', key: 'x' },
      { entity_id: 'd' },
    ])

    expect(listGroupDataPaths.mock.calls[1][1]).toEqual({ continuationToken: 'more' })
    expect(createGroupRole).toHaveBeenCalledWith('group-1', {
      name: 'Public read: datasets/x',
      permissions: {
        '/realm/g/group-1/data/node-1/bucket-a/raw/reads.fastq': 'read',
        '/realm/g/group-1/data/node-1/bucket-b/notes.txt': 'read',
      },
      public: true,
    })
    expect(result.granted.map((file) => file.entity_id)).toEqual(['a', 'b'])
    expect(result.unresolved.map((file) => file.entity_id)).toEqual(['c', 'd'])
  })

  it('creates no role when no file can be granted', async () => {
    listGroupDataPaths.mockReset().mockResolvedValue({ entries: [] })
    createGroupRole.mockReset()

    const result = await grantPublicRead('group-1', 'Public read', [{ entity_id: 'a', bucket: 'gone', key: 'k' }])

    expect(createGroupRole).not.toHaveBeenCalled()
    expect(result).toEqual({ granted: [], unresolved: [{ entity_id: 'a', bucket: 'gone', key: 'k' }] })
  })
})
