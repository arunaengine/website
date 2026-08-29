// The sessions behind every bearer this account holds: the portal login, AI
// client sessions and long-lived API sessions. Module singleton so the settings
// table and any future surface share one list.
import { computed, ref } from 'vue'
import {
  listSessions,
  revokeSession,
  type UserSession,
} from '@/lib/api'
import { apiBaseUrl, authToken } from './aruna/state'
import { apiErrorMessage } from '@/lib/api'

const sessions = ref<UserSession[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const busyIds = ref<string[]>([])

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

function markBusy(id: string, busy: boolean) {
  busyIds.value = busy ? [...busyIds.value, id] : busyIds.value.filter((entry) => entry !== id)
}

export function useUserSessions() {
  async function load(): Promise<void> {
    if (!authToken.value) return
    loading.value = true
    error.value = null
    try {
      sessions.value = (await listSessions(client())).sessions
    } catch (cause) {
      error.value = apiErrorMessage(cause)
    } finally {
      loading.value = false
    }
  }

  /** Answers whether the revoked session was the one this browser is using. */
  async function revoke(sessionId: string): Promise<boolean> {
    const wasCurrent = sessions.value.find((entry) => entry.session_id === sessionId)?.current === true
    markBusy(sessionId, true)
    error.value = null
    try {
      await revokeSession(sessionId, client())
      sessions.value = sessions.value.map((entry) =>
        (entry.session_id === sessionId ? { ...entry, revoked: true } : entry))
      return wasCurrent
    } catch (cause) {
      error.value = apiErrorMessage(cause)
      return false
    } finally {
      markBusy(sessionId, false)
    }
  }

  return {
    sessions,
    loading,
    error,
    busyIds: computed(() => busyIds.value),
    load,
    revoke,
  }
}
