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

function group(groupId = 'group-1') {
  return { group_id: groupId, realm_id: 'realm', roles: [{
    name: 'admin', assigned_users: ['user'], permissions: { [`/realm/g/${groupId}/admin/**`]: 'write' },
  }] }
}

beforeEach(() => {
  getGroup.mockReset().mockImplementation(async (id: string) => group(id))
  createGroupRole.mockReset().mockResolvedValue({ role_id: 'r' })
})

const reads = '/realm/g/group-1/data/node-1/bucket-a/raw/reads.fastq'

describe('grantPublicRead', () => {
  it('grants everyone read on exactly the listed permission paths and reports the rest', async () => {
    const result = await grantPublicRead('Public read: datasets/x', [
      { group_id: 'group-1', entity_id: 'a', permission_path: reads, bucket: 'bucket-a', key: 'raw/reads.fastq' },
      { group_id: 'group-1', entity_id: 'b', permission_path: '/realm/g/group-1/data/node-2/bucket-b/notes.txt' },
      { group_id: 'group-1', entity_id: 'c', bucket: 'bucket-a', key: 'unreadable.txt' },
      { group_id: 'group-1', entity_id: 'd', permission_path: '/realm/g/group-1/data/node-1/bucket-a/run[1]/*.csv' },
      { group_id: 'group-1', entity_id: 'e', permission_path: '/realm/g/group-1/data/node-1/bucket-a/{a,b}?.txt' },
    ], 'user')

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
      ...group(),
      roles: [...group().roles, { name: 'Public read: datasets/x' }, { name: 'Public read: datasets/x (2)' }],
    })

    await grantPublicRead('Public read: datasets/x', [{ group_id: 'group-1', entity_id: 'a', permission_path: reads }], 'user')

    expect(createGroupRole.mock.calls[0][1].name).toBe('Public read: datasets/x (3)')
  })

  it('creates no role when no file can be granted', async () => {
    const result = await grantPublicRead('Public read', [{ group_id: 'group-1', entity_id: 'a', bucket: 'b', key: 'k' }], 'user')

    expect(getGroup).not.toHaveBeenCalled()
    expect(createGroupRole).not.toHaveBeenCalled()
    expect(result).toEqual({ granted: [], failed: false, unresolved: [{ group_id: 'group-1', entity_id: 'a', bucket: 'b', key: 'k' }] })
  })
  it('creates separate roles for files in different owning groups', async () => {
    const files = [
      { entity_id: 'a', group_id: 'group-1', permission_path: reads },
      { entity_id: 'b', group_id: 'group-2', permission_path: '/realm/g/group-2/data/node/bucket/file' },
    ]
    const result = await grantPublicRead('Public read', files, 'user')
    expect(createGroupRole.mock.calls.map((call) => call[0])).toEqual(['group-1', 'group-2'])
    expect(createGroupRole.mock.calls[0][1].permissions).toEqual({ [reads]: 'read' })
    expect(createGroupRole.mock.calls[1][1].permissions).toEqual({ [files[1].permission_path]: 'read' })
    expect(result.granted).toEqual(files)
  })

  it('does not grant paths for a group the user does not administer', async () => {
    getGroup.mockResolvedValue({ ...group(), roles: [] })
    const file = { entity_id: 'a', group_id: 'group-1', permission_path: reads }
    const result = await grantPublicRead('Public read', [file], 'user')
    expect(createGroupRole).not.toHaveBeenCalled()
    expect(result.unresolved).toEqual([file])
  })

  it('preserves successful grants when another group request fails', async () => {
    createGroupRole.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('offline'))
    const files = [
      { entity_id: 'a', group_id: 'group-1', permission_path: reads },
      { entity_id: 'b', group_id: 'group-2', permission_path: '/realm/g/group-2/data/node/bucket/file' },
    ]
    const result = await grantPublicRead('Public read', files, 'user')
    expect(result).toEqual({ granted: [files[0]], unresolved: [files[1]], failed: true })
    expect(createGroupRole).toHaveBeenCalledTimes(2)
  })

})
