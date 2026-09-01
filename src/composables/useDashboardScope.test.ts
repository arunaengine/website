import { ref } from 'vue'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const userInfo = ref<Record<string, any> | null>(null)
const updateUserProfile = vi.fn(async () => undefined)

let useDashboardScope: typeof import('./useDashboardScope').useDashboardScope

beforeAll(async () => {
  vi.doMock('@/composables/useAruna', () => ({ useAruna: () => ({ userInfo, updateUserProfile }) }))
  ;({ useDashboardScope } = await import('./useDashboardScope'))
})

function profile(attributes: Record<string, string>, preferences: Record<string, unknown> = {}) {
  return { user: { user_id: 'user-1', name: 'Ada', attributes }, preferences }
}

beforeEach(() => {
  userInfo.value = profile({})
  updateUserProfile.mockReset()
  updateUserProfile.mockImplementation(async () => undefined)
})

describe('dashboard scope preference', () => {
  it('leads with personal statistics until the account says otherwise', () => {
    const { scope } = useDashboardScope()

    expect(scope.value).toBe('personal')
  })

  it('reads the stored order from the raw user attribute', () => {
    userInfo.value = profile({ 'ui.dashboard_scope': 'realm' })

    expect(useDashboardScope().scope.value).toBe('realm')
  })

  it('reads the stored order from the decoded preference', () => {
    userInfo.value = profile({}, { dashboard_scope: 'realm' })

    expect(useDashboardScope().scope.value).toBe('realm')
  })

  it('falls back to personal for a value it does not know', () => {
    userInfo.value = profile({ 'ui.dashboard_scope': 'everything' })

    expect(useDashboardScope().scope.value).toBe('personal')
  })

  it('persists a change as the ui.dashboard_scope attribute', async () => {
    const { scope, setScope } = useDashboardScope()
    updateUserProfile.mockImplementation(async () => {
      userInfo.value = profile({ 'ui.dashboard_scope': 'realm' })
    })

    await setScope('realm')

    expect(updateUserProfile).toHaveBeenCalledWith({ set_attributes: { 'ui.dashboard_scope': 'realm' } })
    expect(scope.value).toBe('realm')
  })

  it('writes nothing when the order did not change', async () => {
    userInfo.value = profile({ 'ui.dashboard_scope': 'realm' })
    const { setScope } = useDashboardScope()

    await setScope('realm')

    expect(updateUserProfile).not.toHaveBeenCalled()
  })

  it('snaps back to the stored order when the write fails', async () => {
    const { scope, setScope } = useDashboardScope()
    updateUserProfile.mockRejectedValue(new Error('offline'))

    await setScope('realm')

    expect(scope.value).toBe('personal')
  })
})
