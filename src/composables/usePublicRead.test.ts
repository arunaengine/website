import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const getGroup = vi.fn()
const createGroupRole = vi.fn()

let grantPublicRead: typeof import('./usePublicRead').grantPublicRead

beforeAll(async () => {
  vi.doMock('./aruna/groups', () => ({ createGroupRole, getGroup }))
  grantPublicRead = (await import('./usePublicRead')).grantPublicRead
})

afterAll(() => {
  vi.doUnmock('./aruna/groups')
})

beforeEach(() => {
  getGroup.mockReset().mockResolvedValue({ group_id: 'group-1', roles: [] })
  createGroupRole.mockReset().mockResolvedValue({ role_id: 'r' })
})

const reads = '/realm/g/group-1/data/node-1/bucket-a/raw/reads.fastq'

describe('grantPublicRead', () => {
  it('grants everyone read on exactly the listed permission paths and reports the rest', async () => {
    const result = await grantPublicRead('group-1', 'Public read: datasets/x', [
      { entity_id: 'a', permission_path: reads, bucket: 'bucket-a', key: 'raw/reads.fastq' },
      { entity_id: 'b', permission_path: '/realm/g/group-1/data/node-2/bucket-b/notes.txt' },
      { entity_id: 'c', bucket: 'bucket-a', key: 'unreadable.txt' },
      { entity_id: 'd', permission_path: '/realm/g/group-1/data/node-1/bucket-a/run[1]/*.csv' },
      { entity_id: 'e', permission_path: '/realm/g/group-1/data/node-1/bucket-a/{a,b}?.txt' },
    ])

    expect(createGroupRole).toHaveBeenCalledWith('group-1', {
      name: 'Public read: datasets/x',
      permissions: {
        [reads]: 'read',
        '/realm/g/group-1/data/node-2/bucket-b/notes.txt': 'read',
      },
      public: true,
    })
    expect(result.granted.map((file) => file.entity_id)).toEqual(['a', 'b'])
    expect(result.unresolved.map((file) => file.entity_id)).toEqual(['c', 'd', 'e'])
  })

  it('numbers the role when the name is already taken', async () => {
    getGroup.mockResolvedValue({
      group_id: 'group-1',
      roles: [{ name: 'Public read: datasets/x' }, { name: 'Public read: datasets/x (2)' }],
    })

    await grantPublicRead('group-1', 'Public read: datasets/x', [{ entity_id: 'a', permission_path: reads }])

    expect(createGroupRole.mock.calls[0][1].name).toBe('Public read: datasets/x (3)')
  })

  it('creates no role when no file can be granted', async () => {
    const result = await grantPublicRead('group-1', 'Public read', [{ entity_id: 'a', bucket: 'b', key: 'k' }])

    expect(getGroup).not.toHaveBeenCalled()
    expect(createGroupRole).not.toHaveBeenCalled()
    expect(result).toEqual({ granted: [], unresolved: [{ entity_id: 'a', bucket: 'b', key: 'k' }] })
  })
})
