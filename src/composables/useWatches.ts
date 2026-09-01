import { computed, ref, watch } from 'vue'
import {
  ApiError,
  apiRequest,
  type ApiRequestOptions,
  type ApiWatch,
  type CreateWatchRequest,
  type WatchListResponse,
} from '@/lib/api'
import { useAruna } from '@/composables/useAruna'
import { errorMessage } from '@/lib/utils'

// Module-singleton state shared by every watch surface (buttons, settings
// list), mirroring useNotifications: 404/405 marks the endpoints absent and
// 403 marks the token unauthorized; both hide the feature for the session.

const { apiBaseUrl, authToken, currentUser } = useAruna()

const supported = ref(true)
const forbidden = ref(false)
const watches = ref<ApiWatch[]>([])
const listLoaded = ref(false)
const listLoading = ref(false)
const listError = ref<string | null>(null)
const creating = ref(false)
const deletingIds = ref<string[]>([])

const available = computed(() => supported.value && !forbidden.value && Boolean(currentUser.value))

function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  return apiRequest<T>(path, options, { baseUrl: apiBaseUrl.value, token: authToken.value })
}

function noteUnavailable(err: unknown): boolean {
  if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
    supported.value = false
    return true
  }
  if (err instanceof ApiError && err.status === 403) {
    forbidden.value = true
    return true
  }
  return false
}

async function loadWatches(): Promise<void> {
  if (!available.value || listLoading.value) return
  listLoading.value = true
  listError.value = null
  try {
    const res = await request<WatchListResponse>('/system/notifications/watches')
    watches.value = [...res.watches].sort((a, b) => b.created_at_ms - a.created_at_ms)
    listLoaded.value = true
  } catch (err) {
    if (!noteUnavailable(err)) listError.value = errorMessage(err)
  } finally {
    listLoading.value = false
  }
}

// Idempotent mount hook for buttons that only need the watched-state lookup.
async function ensureLoaded(): Promise<void> {
  if (listLoaded.value || !available.value) return
  await loadWatches()
}

// Throws upward so dialogs can render the message (e.g. the 409 cap error)
// verbatim; unavailability is still recorded to hide the feature.
async function createWatch(pathPrefix: string, events: string[]): Promise<ApiWatch> {
  creating.value = true
  try {
    const body: CreateWatchRequest = { path_prefix: pathPrefix, events }
    const created = await request<ApiWatch>('/system/notifications/watches', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    watches.value = [created, ...watches.value.filter((w) => w.id !== created.id)]
    return created
  } catch (err) {
    noteUnavailable(err)
    throw err
  } finally {
    creating.value = false
  }
}

async function deleteWatch(id: string): Promise<void> {
  deletingIds.value = [...deletingIds.value, id]
  try {
    await request<void>(`/system/notifications/watches/${encodeURIComponent(id)}`, { method: 'DELETE' })
    watches.value = watches.value.filter((w) => w.id !== id)
  } catch (err) {
    noteUnavailable(err)
    throw err
  } finally {
    deletingIds.value = deletingIds.value.filter((d) => d !== id)
  }
}

// A watch is identified by its prefix; the event set is what the dialog edits.
function findWatch(pathPrefix: string): ApiWatch | undefined {
  return watches.value.find((w) => w.path_prefix === pathPrefix)
}

if (typeof window !== 'undefined') {
  // Sign-in/out lifecycle: re-probe availability for a fresh token and clear
  // cached state; no HTTP fires here (loads happen on demand from consumers).
  watch(
    () => currentUser.value?.id,
    (id, prev) => {
      if (id === prev) return
      supported.value = true
      forbidden.value = false
      watches.value = []
      listLoaded.value = false
      listError.value = null
    },
  )
}

export function useWatches() {
  return {
    available,
    watches,
    listLoaded,
    listLoading,
    listError,
    creating,
    deletingIds,
    loadWatches,
    ensureLoaded,
    createWatch,
    deleteWatch,
    findWatch,
  }
}
