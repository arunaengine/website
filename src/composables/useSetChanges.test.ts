import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import type { LiveState } from '@/lib/distribution'

const aruna = vi.hoisted(() => ({
  joinDistributedMember: vi.fn(),
  leaveDistributedMember: vi.fn(),
  transferDistributedRange: vi.fn(),
  changeDistributedSettings: vi.fn(),
  deleteDistributedBucket: vi.fn(),
}))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))

const { useSetChanges } = await import('@/composables/useSetChanges')

const live = ref<LiveState | undefined>({
  setId: 's1', groupId: 'g1', pending: false, serving: true, conflicted: false, changesUnavailable: false,
  recommendedGrant: '', transfers: [], deletion: null, publicationsClosed: false,
})

describe('set changes', () => {
  beforeEach(() => {
    for (const fn of Object.values(aruna)) fn.mockReset()
  })

  it('sends each change to the group and the set of the bucket', async () => {
    Object.values(aruna).forEach((fn) => fn.mockResolvedValue({ set_id: 's1', revision: 2, active: true, members: [] }))
    const changes = useSetChanges(live)

    expect(await changes.leave('m1')).toBe(true)
    expect(await changes.transfer({ range_id: 'r1', to: 'm2', role: 'replica' })).toBe(true)
    expect(await changes.settings({ refresh_secs: 60 })).toBe(true)
    expect(await changes.remove()).toBe(true)
    expect(aruna.leaveDistributedMember).toHaveBeenCalledWith('g1', 's1', 'm1')
    expect(aruna.transferDistributedRange).toHaveBeenCalledWith('g1', 's1', { range_id: 'r1', to: 'm2', role: 'replica' })
    expect(aruna.changeDistributedSettings).toHaveBeenCalledWith('g1', 's1', { refresh_secs: 60 })
    expect(aruna.deleteDistributedBucket).toHaveBeenCalledWith('g1', 's1')
  })

  it('shows the hint of a blocked change and takes it as not done', async () => {
    aruna.transferDistributedRange.mockRejectedValue(new ApiError(503, 'the coordinator of the range is unreachable'))
    const changes = useSetChanges(live)

    expect(await changes.transfer({ range_id: 'r1', to: 'm2', role: 'leave' })).toBe(false)
    expect(changes.failure.value).toBe('the coordinator of the range is unreachable')
    expect(changes.busy.value).toBe(false)
  })

  it('keeps a joined member whose admission stopped and says why', async () => {
    aruna.joinDistributedMember.mockResolvedValue({ set_id: 's1', active: false, members: [], error: 'the node is busy' })
    const changes = useSetChanges(live)

    expect(await changes.join({ node_id: 'n3', coverage: 'all', strategy: 'copy' })).toBe(true)
    expect(changes.failure.value).toBe('the node is busy')
  })

  it('says when a member was not admitted although the answer names no error', async () => {
    aruna.joinDistributedMember.mockResolvedValue({
      set_id: 's1',
      active: true,
      members: [{ member_id: 'm3', node_id: 'n3', admitted: false, error: 'the member could not sign' }],
    })
    const changes = useSetChanges(live)

    expect(await changes.join({ node_id: 'n3', coverage: 'all', strategy: 'copy' })).toBe(true)
    expect(changes.failure.value).toBe('the member could not sign')
  })

  it('does nothing for a bucket the node did not report', async () => {
    const changes = useSetChanges(ref(undefined))

    expect(await changes.remove()).toBe(false)
    expect(aruna.deleteDistributedBucket).not.toHaveBeenCalled()
  })
})
