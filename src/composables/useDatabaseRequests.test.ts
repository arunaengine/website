import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'

const aruna = vi.hoisted(() => ({
  sessionEpoch: { value: 1 },
  authToken: { value: 'token' },
  listDatabaseRequests: vi.fn(),
  approveDatabaseRequest: vi.fn(),
  dropDatabaseRequest: vi.fn(),
}))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))
vi.mock('@/composables/useDatabases', () => ({ useDatabases: () => ({ reload: vi.fn(async () => {}) }) }))

const { useDatabaseRequests } = await import('@/composables/useDatabaseRequests')

describe('database requests', () => {
  beforeEach(() => {
    aruna.listDatabaseRequests.mockReset().mockResolvedValue([])
    aruna.approveDatabaseRequest.mockReset()
  })

  it('keeps a refused approval visible after the lists are read again', async () => {
    aruna.approveDatabaseRequest.mockRejectedValue(new ApiError(403, 'not an admin of the group'))
    const requests = useDatabaseRequests()

    expect(await requests.approve('r1')).toBe(false)
    expect(aruna.listDatabaseRequests).toHaveBeenCalled()
    expect(requests.failure.value).toBe('not an admin of the group')
  })
})
