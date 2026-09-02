// Which dashboard section is shown. Persisted as the user attribute
// ui.dashboard_scope so the choice roams like the preferred profile.
import { computed, ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { reportGlobalError } from '@/composables/useGlobalErrors'
import { errorMessage } from '@/lib/utils'

export type DashboardScope = 'personal' | 'realm'

export const DASHBOARD_SCOPE_ATTRIBUTE = 'ui.dashboard_scope'

// Optimistic value while the PATCH is in flight; cleared once the refreshed
// profile carries the stored one, or on failure so the control snaps back.
const pending = ref<DashboardScope | null>(null)

function parseScope(value: string | null | undefined): DashboardScope | null {
  const trimmed = value?.trim()
  return trimmed === 'personal' || trimmed === 'realm' ? trimmed : null
}

export function useDashboardScope() {
  const { userInfo, updateUserProfile } = useAruna()

  const stored = computed<DashboardScope | null>(() => {
    const info = userInfo.value
    if (!info) return null
    // Newer nodes decode the attribute into preferences; older ones serve the
    // raw attribute only.
    const preferences = info.preferences as { dashboard_scope?: string | null }
    return parseScope(preferences.dashboard_scope) ?? parseScope(info.user.attributes[DASHBOARD_SCOPE_ATTRIBUTE])
  })

  const scope = computed<DashboardScope>(() => pending.value ?? stored.value ?? 'personal')

  async function setScope(next: DashboardScope): Promise<void> {
    if (next === scope.value) return
    pending.value = next
    try {
      await updateUserProfile({ set_attributes: { [DASHBOARD_SCOPE_ATTRIBUTE]: next } })
    } catch (err) {
      reportGlobalError(errorMessage(err))
    } finally {
      pending.value = null
    }
  }

  return { scope, setScope }
}
