import { ref } from 'vue'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const userInfo = ref<Record<string, unknown> | null>(null)
const updateUserProfile = vi.fn(async () => undefined)

let useOnboarding: typeof import('./useOnboarding').useOnboarding

beforeAll(async () => {
  vi.doMock('@/composables/useAruna', () => ({ useAruna: () => ({ userInfo, updateUserProfile }) }))
  ;({ useOnboarding } = await import('./useOnboarding'))
})

function profile(attributes: Record<string, string>) {
  return { user: { user_id: 'user-1', name: 'Ada', attributes }, preferences: {} }
}

beforeEach(() => {
  userInfo.value = profile({})
  updateUserProfile.mockReset()
  updateUserProfile.mockImplementation(async () => undefined)
})

describe('onboarding preference', () => {
  it('treats an account that was never offered anything as new', () => {
    expect(useOnboarding().isNewUser.value).toBe(true)
  })

  it('offers nothing to a signed-out visitor', () => {
    userInfo.value = null

    expect(useOnboarding().isNewUser.value).toBe(false)
  })

  it('stops offering once the card was dismissed', () => {
    userInfo.value = profile({ 'ui.onboarding': 'dismissed' })

    expect(useOnboarding().isNewUser.value).toBe(false)
  })

  it('reads a finished tutorial out of the list', () => {
    userInfo.value = profile({ 'ui.onboarding': 'dismissed,compute' })
    const { isNewUser, hasDone } = useOnboarding()

    expect(isNewUser.value).toBe(false)
    expect(hasDone('compute')).toBe(true)
    expect(hasDone('profile')).toBe(false)
  })

  it('ignores tokens it does not know', () => {
    userInfo.value = profile({ 'ui.onboarding': ' , nonsense ' })

    expect(useOnboarding().isNewUser.value).toBe(true)
  })

  it('appends a finished tutorial in one write', async () => {
    userInfo.value = profile({ 'ui.onboarding': 'dismissed' })
    const { markTutorialDone } = useOnboarding()
    updateUserProfile.mockImplementation(async () => {
      userInfo.value = profile({ 'ui.onboarding': 'dismissed,compute' })
    })

    await markTutorialDone('compute')

    expect(updateUserProfile).toHaveBeenCalledTimes(1)
    expect(updateUserProfile).toHaveBeenCalledWith({
      set_attributes: { 'ui.onboarding': 'dismissed,compute' },
    })
    expect(useOnboarding().hasDone('compute')).toBe(true)
  })

  it('writes nothing when the token is already recorded', async () => {
    userInfo.value = profile({ 'ui.onboarding': 'compute' })

    await useOnboarding().markTutorialDone('compute')

    expect(updateUserProfile).not.toHaveBeenCalled()
  })

  it('brings the card back when the write fails', async () => {
    const { isNewUser, dismissOnboarding } = useOnboarding()
    updateUserProfile.mockRejectedValue(new Error('offline'))

    await dismissOnboarding()

    expect(isNewUser.value).toBe(true)
  })
})
