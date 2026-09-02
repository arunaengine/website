// What the account has already been offered. Persisted as the user attribute
// ui.onboarding, a comma-joined list of tokens, so the welcome card follows the
// person rather than the browser.
import { computed, ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { reportGlobalError } from '@/composables/useGlobalErrors'
import { errorMessage } from '@/lib/utils'

export type OnboardingToken = 'dismissed' | 'compute' | 'profile'

export const ONBOARDING_ATTRIBUTE = 'ui.onboarding'

const KNOWN: OnboardingToken[] = ['dismissed', 'compute', 'profile']

// Optimistic value while the PATCH is in flight; cleared once the refreshed
// profile carries the stored one, or on failure so the card comes back.
const pending = ref<OnboardingToken[] | null>(null)

function parse(value: string | null | undefined): OnboardingToken[] {
  return (value ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter((token): token is OnboardingToken => (KNOWN as string[]).includes(token))
}

export function useOnboarding() {
  const { userInfo, updateUserProfile } = useAruna()

  const stored = computed(() => parse(userInfo.value?.user.attributes[ONBOARDING_ATTRIBUTE]))
  const tokens = computed(() => pending.value ?? stored.value)

  /** Nothing offered yet: the account has never answered the welcome card. */
  const isNewUser = computed(() => !!userInfo.value && tokens.value.length === 0)

  function hasDone(token: OnboardingToken): boolean {
    return tokens.value.includes(token)
  }

  async function setOnboarding(token: OnboardingToken): Promise<void> {
    if (tokens.value.includes(token)) return
    const next = [...tokens.value, token]
    pending.value = next
    try {
      await updateUserProfile({ set_attributes: { [ONBOARDING_ATTRIBUTE]: next.join(',') } })
    } catch (err) {
      reportGlobalError(errorMessage(err))
    } finally {
      pending.value = null
    }
  }

  return {
    tokens,
    isNewUser,
    hasDone,
    setOnboarding,
    dismissOnboarding: () => setOnboarding('dismissed'),
    markTutorialDone: (token: OnboardingToken) => setOnboarding(token),
  }
}
