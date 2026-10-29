// The sessions behind every bearer this account holds: the portal login, AI
// client sessions and long-lived API sessions. Module singleton so the settings
// table and any future surface share one list.
import { computed, ref } from 'vue'
import {
  createSession,
  listSessions,
  revokeSession,
  type CreateSessionRequest,
  type CreateSessionResponse,
  type UserSession,
} from '@/lib/api'
import { apiBaseUrl, authToken, sessionEpoch } from './aruna/state'
import { apiErrorMessage } from '@/lib/api'

const sessions = ref<UserSession[]>([])
// The `current` flags belong to the token that listed them, so the list only shows for its epoch.
const listedEpoch = ref(-1)
const listed = computed(() => listedEpoch.value === sessionEpoch.value)
const loading = ref(false)
const error = ref<string | null>(null)
const busyIds = ref<string[]>([])
let loads = 0

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

function markBusy(id: string, busy: boolean) {
  busyIds.value = busy ? [...busyIds.value, id] : busyIds.value.filter((entry) => entry !== id)
}

export function useUserSessions() {
  async function load(): Promise<void> {
    if (!authToken.value) return
    const run = ++loads
    const epoch = sessionEpoch.value
    loading.value = true
    error.value = null
    try {
      const listing = (await listSessions(client())).sessions
      if (run !== loads || epoch !== sessionEpoch.value) return
      sessions.value = listing
      listedEpoch.value = epoch
    } catch (cause) {
      if (run === loads && epoch === sessionEpoch.value) error.value = apiErrorMessage(cause)
    } finally {
      if (run === loads) loading.value = false
    }
  }

  /** Mints a session; the token it carries is shown once and never stored. */
  async function create(request: CreateSessionRequest): Promise<CreateSessionResponse> {
    const response = await createSession(request, client())
    await load()
    return response
  }

  /** Answers whether the revoked session was the one this browser is using. */
  async function revoke(sessionId: string): Promise<boolean> {
    const wasCurrent = listed.value && sessions.value.find((entry) => entry.session_id === sessionId)?.current === true
    const epoch = sessionEpoch.value
    markBusy(sessionId, true)
    error.value = null
    try {
      await revokeSession(sessionId, client())
      if (epoch === sessionEpoch.value) sessions.value = sessions.value.map((entry) =>
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
    sessions: computed(() => (listed.value ? sessions.value : [])),
    listed,
    loading,
    error,
    busyIds: computed(() => busyIds.value),
    load,
    create,
    revoke,
  }
}
