import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiRole, GroupDetailResponse } from '@/lib/api'

const getGroup = vi.fn()
const createGroupRole = vi.fn()
const deleteGroupRole = vi.fn()
const currentUser = ref<{ id: string } | null>({ id: 'user-1' })

vi.mock('@/composables/useAruna', () => ({
  useAruna: () => ({
    currentUser,
    getGroup,
    createGroupRole,
    deleteGroupRole,
    realmInfo: ref(null),
    nodeInfo: ref(null),
  }),
}))
vi.mock('@/composables/s3/endpoints', () => ({ localNodeId: () => 'node-1' }))

const { usePublicAccess } = await import('@/composables/usePublicAccess')

const ROOT = '/realm-1/g/g-1/data/node-1'
const ADMIN: ApiRole = {
  role_id: 'r-admin',
  name: 'admin',
  permissions: { '/realm-1/g/g-1/admin/**': 'write' },
  assigned_users: ['user-1'],
}

function detail(roles: ApiRole[]): GroupDetailResponse {
  return { display_name: 'Reef lab', group_id: 'g-1', realm_id: 'realm-1', roles }
}

async function settle() {
  for (let i = 0; i < 4; i += 1) await Promise.resolve()
}

beforeEach(() => {
  getGroup.mockReset()
  createGroupRole.mockReset().mockResolvedValue({})
  deleteGroupRole.mockReset().mockResolvedValue(undefined)
  currentUser.value = { id: 'user-1' }
})

describe('usePublicAccess', () => {
  it('creates the public role on the first grant', async () => {
    getGroup.mockResolvedValue(detail([ADMIN]))
    const access = usePublicAccess(ref('g-1'))
    await settle()

    expect(access.canManage.value).toBe(true)
    expect(access.isPublic(null, { kind: 'file', bucket: 'reef', key: 'a.txt' })).toBe(false)

    await access.grant(null, [{ kind: 'folder', bucket: 'reef', key: 'raw/' }])

    expect(createGroupRole).toHaveBeenCalledWith('g-1', {
      name: 'public',
      permissions: { [`${ROOT}/reef/raw/**`]: 'read' },
      assigned_users: [],
      public: true,
    })
    expect(deleteGroupRole).not.toHaveBeenCalled()
    expect(getGroup).toHaveBeenCalledTimes(2)
  })

  it('replaces the existing role and removes the old copy', async () => {
    const existing: ApiRole = {
      role_id: 'r-public',
      name: 'public',
      permissions: { [`${ROOT}/reef/raw/**`]: 'READ' },
      public: true,
    }
    getGroup.mockResolvedValue(detail([ADMIN, existing]))
    const access = usePublicAccess(ref('g-1'))
    await settle()

    expect(access.isPublic('node-1', { kind: 'file', bucket: 'reef', key: 'raw/reads.fastq' })).toBe(true)

    await access.grant(null, [{ kind: 'file', bucket: 'reef', key: 'notes.md' }])

    expect(createGroupRole.mock.calls[0][1].permissions).toEqual({
      [`${ROOT}/reef/raw/**`]: 'read',
      [`${ROOT}/reef/notes.md`]: 'read',
    })
    expect(deleteGroupRole).toHaveBeenCalledWith('g-1', 'r-public')
    expect(createGroupRole.mock.invocationCallOrder[0]).toBeLessThan(
      deleteGroupRole.mock.invocationCallOrder[0],
    )
  })

  it('only deletes when the last rule is revoked', async () => {
    getGroup.mockResolvedValue(
      detail([
        ADMIN,
        { role_id: 'r-public', name: 'public', permissions: { [`${ROOT}/reef/raw/**`]: 'read' }, public: true },
      ]),
    )
    const access = usePublicAccess(ref('g-1'))
    await settle()

    await access.revoke(null, [{ kind: 'folder', bucket: 'reef', key: 'raw/' }])

    expect(createGroupRole).not.toHaveBeenCalled()
    expect(deleteGroupRole).toHaveBeenCalledWith('g-1', 'r-public')
  })

  it('names a leftover copy when the old role cannot be removed', async () => {
    getGroup.mockResolvedValue(
      detail([ADMIN, { role_id: 'r-public', name: 'public', permissions: { [`${ROOT}/reef/a`]: 'read' }, public: true }]),
    )
    deleteGroupRole.mockRejectedValue(new Error('forbidden'))
    const access = usePublicAccess(ref('g-1'))
    await settle()

    await expect(access.grant(null, [{ kind: 'file', bucket: 'reef', key: 'b' }])).rejects.toThrow(
      'previous copy could not be removed',
    )
  })

  it('denies management to a plain member and reloads on a group change', async () => {
    currentUser.value = { id: 'user-2' }
    getGroup.mockResolvedValue(detail([ADMIN]))
    const groupId = ref<string | null>('g-1')
    const access = usePublicAccess(groupId)
    await settle()
    expect(access.canManage.value).toBe(false)

    groupId.value = null
    await settle()
    expect(access.detail.value).toBeNull()
    expect(getGroup).toHaveBeenCalledTimes(1)
  })
})
