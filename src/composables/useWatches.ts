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
// list). Only 404/405 on the list hides the feature: a refused create is one
// resource saying no, not the endpoint being absent.

const { apiBaseUrl, authToken, currentUser, sessionEpoch } = useAruna()

const supported = ref(true)
const watches = ref<ApiWatch[]>([])
const listLoaded = ref(false)
const listLoading = ref(false)
const listError = ref<string | null>(null)
const creating = ref(false)
const deletingIds = ref<string[]>([])

const available = computed(() => supported.value && Boolean(currentUser.value))

function session() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

function request<T>(path: string, options: ApiRequestOptions = {}, client = session()): Promise<T> {
  return apiRequest<T>(path, options, client)
}

function noteUnsupported(err: unknown): boolean {
  if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
    supported.value = false
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
    if (!noteUnsupported(err)) listError.value = errorMessage(err)
  } finally {
    listLoading.value = false
  }
}

// Idempotent mount hook for buttons that only need the watched-state lookup.
async function ensureLoaded(): Promise<void> {
  if (listLoaded.value || !available.value) return
  await loadWatches()
}

// Throws upward so the dialog renders the message (a refused create, the 409
// cap error) instead of the feature disappearing for the session.
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
  } finally {
    creating.value = false
  }
}

async function deleteWatch(id: string, client = session()): Promise<void> {
  deletingIds.value = [...deletingIds.value, id]
  try {
    await request<void>(`/system/notifications/watches/${encodeURIComponent(id)}`, { method: 'DELETE' }, client)
    watches.value = watches.value.filter((w) => w.id !== id)
  } finally {
    deletingIds.value = deletingIds.value.filter((d) => d !== id)
  }
}

// Old watches an edit replaced but could not delete yet, per account, API base
// and prefix. They live in sessionStorage, so a remount still finishes them.
function pendingKey(pathPrefix: string): string {
  return `aruna.watch.pending:${apiBaseUrl.value}|${currentUser.value?.id ?? ''}|${pathPrefix}`
}

function pendingRemovals(pathPrefix: string): string[] {
  return readPending(pendingKey(pathPrefix))
}

function readPending(key: string): string[] {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(key) ?? '[]') as unknown
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function writePending(key: string, ids: string[]) {
  try {
    if (ids.length) window.sessionStorage.setItem(key, JSON.stringify(ids))
    else window.sessionStorage.removeItem(key)
  } catch {
    // Without storage the ids stay unknown after a reload; the watches list still shows them.
  }
}

/** Deletes every pending old watch of a prefix; failed ones stay pending, and the first error is thrown. */
async function removePending(pathPrefix: string, add: string[] = []): Promise<void> {
  // The account that started the cleanup owns it to the end, key and credentials alike.
  const key = pendingKey(pathPrefix)
  const client = session()
  const epoch = sessionEpoch.value
  const ids = [...new Set([...readPending(key), ...add])]
  writePending(key, ids)
  const left: string[] = []
  let failure: unknown = null
  for (const [index, id] of ids.entries()) {
    if (epoch !== sessionEpoch.value) {
      left.push(...ids.slice(index))
      failure ??= new DOMException('The API session changed.', 'AbortError')
      break
    }
    try {
      await deleteWatch(id, client)
    } catch (err) {
      // An already deleted watch is done.
      if (err instanceof ApiError && err.status === 404) continue
      left.push(id)
      failure ??= err
    }
  }
  writePending(key, left)
  if (failure) throw failure
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
    pendingRemovals,
    removePending,
  }
}
