import { computed, ref, watch } from 'vue'
import {
  ApiError,
  apiRequest,
  type ApiNotification,
  type ApiRequestOptions,
  type MarkReadRequest,
  type MarkReadResponse,
  type NotificationListResponse,
  type NotificationStateResponse,
  type UnreadCountResponse,
} from '@/lib/api'
import { useAruna } from '@/composables/useAruna'
import { reportGlobalError } from '@/composables/useGlobalErrors'

const STREAM_RETRY_MS = 3_000
const PAGE_SIZE = 20

const { apiBaseUrl, authToken, currentUser } = useAruna()

// false once the backend answered 404/405 — endpoints not deployed; bell hidden.
const supported = ref(true)
// true once the backend answered 403 — e.g. a path-restricted token; bell hidden.
const forbidden = ref(false)
const unreadCount = ref(0)
const unreadCapped = ref(false)
const items = ref<ApiNotification[]>([])
const nextCursor = ref<string | null>(null)
const listLoaded = ref(false)
const listLoading = ref(false)
const loadingMore = ref(false)
const listError = ref<string | null>(null)
const dashboardRevision = ref(0)
// In-flight mark-read requests. Concurrent markRead calls are allowed (rows can
// be marked back-to-back within a network RTT); `marking` stays truthy while any
// request is pending so the "Mark all read" header button remains disabled.
const markingCount = ref(0)
const marking = computed(() => markingCount.value > 0)

const available = computed(() => supported.value && !forbidden.value && Boolean(currentUser.value))
// Badge text; the server count is capped at 100 by design, so cap display at 99+.
const unreadDisplay = computed(() => {
  if (!unreadCount.value) return ''
  return unreadCapped.value || unreadCount.value > 99 ? '99+' : String(unreadCount.value)
})

function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  return apiRequest<T>(path, options, { baseUrl: apiBaseUrl.value, token: authToken.value })
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

// 404/405 = endpoints absent (older backend); 403 = this token may not read
// notifications. Both permanently hide the bell for the current session/token.
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

async function fetchUnread(): Promise<void> {
  if (!currentUser.value || !supported.value || forbidden.value) return
  try {
    const res = await request<UnreadCountResponse>('/notifications/unread')
    unreadCount.value = res.count
    unreadCapped.value = res.capped
  } catch (err) {
    // Transient failures (502/503/network) keep the last known count silently;
    // a background poll must never surface an error banner.
    noteUnavailable(err)
  }
}

async function loadNotifications(): Promise<void> {
  if (!available.value || listLoading.value) return
  listLoading.value = true
  listError.value = null
  try {
    const page = await request<NotificationListResponse>('/notifications', {
      query: { limit: PAGE_SIZE },
    })
    items.value = page.notifications
    nextCursor.value = page.next_cursor ?? null
    listLoaded.value = true
  } catch (err) {
    if (!noteUnavailable(err)) listError.value = errorMessage(err)
  } finally {
    listLoading.value = false
  }
}

async function loadMore(): Promise<void> {
  if (!available.value || !nextCursor.value || loadingMore.value) return
  loadingMore.value = true
  try {
    const page = await request<NotificationListResponse>('/notifications', {
      query: { limit: PAGE_SIZE, cursor: nextCursor.value },
    })
    const known = new Set(items.value.map((n) => n.id))
    items.value = [...items.value, ...page.notifications.filter((n) => !known.has(n.id))]
    nextCursor.value = page.next_cursor ?? null
  } catch (err) {
    if (!noteUnavailable(err)) listError.value = errorMessage(err)
  } finally {
    loadingMore.value = false
  }
}

interface MarkSnapshot {
  count: number
  capped: boolean
}

function snapshot(): MarkSnapshot {
  return { count: unreadCount.value, capped: unreadCapped.value }
}

function restore(s: MarkSnapshot) {
  unreadCount.value = s.count
  unreadCapped.value = s.capped
}

// Optimistic: flip read flags and decrement the badge immediately, roll back on
// failure, and reconcile with a background fetchUnread on success (the server count
// is a capped lower bound, so local arithmetic drifts once capped was true).
async function markRead(ids: string[]): Promise<void> {
  const targets = items.value.filter((n) => !n.read && ids.includes(n.id)).map((n) => n.id)
  if (!targets.length) return
  const before = snapshot()
  const targetSet = new Set(targets)
  items.value = items.value.map((n) => (targetSet.has(n.id) ? { ...n, read: true } : n))
  unreadCount.value = Math.max(0, unreadCount.value - targets.length)
  markingCount.value++
  try {
    const body: MarkReadRequest = { ids: targets }
    await request<MarkReadResponse>('/notifications/read', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    void fetchUnread()
  } catch (err) {
    // Roll back only the ids this call flipped, so a concurrent mark or a page
    // appended by loadMore/loadNotifications while this request was in flight
    // survives (a whole-array restore would clobber it).
    items.value = items.value.map((n) => (targetSet.has(n.id) && n.read ? { ...n, read: false } : n))
    restore(before)
    if (!noteUnavailable(err)) reportGlobalError(`Could not mark notification read: ${errorMessage(err)}`)
  } finally {
    markingCount.value--
  }
}

// Mark everything read via the inclusive up_to_ms sweep. Uses the newest loaded
// record's timestamp as a floor so client-clock skew cannot miss loaded rows.
async function markAllRead(): Promise<void> {
  if (marking.value) return
  const before = snapshot()
  const wasUnread = new Set(items.value.filter((n) => !n.read).map((n) => n.id))
  const newestLoadedMs = items.value[0]?.created_at_ms ?? 0
  const upTo = Math.max(Date.now(), newestLoadedMs)
  items.value = items.value.map((n) => (n.read ? n : { ...n, read: true }))
  unreadCount.value = 0
  unreadCapped.value = false
  markingCount.value++
  try {
    const body: MarkReadRequest = { ids: [], up_to_ms: upTo }
    await request<MarkReadResponse>('/notifications/read', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    void fetchUnread()
  } catch (err) {
    // Un-flag only the rows this sweep marked read; leaves rows a concurrent
    // markRead flipped (and any page loaded meanwhile) intact.
    items.value = items.value.map((n) => (wasUnread.has(n.id) ? { ...n, read: false } : n))
    restore(before)
    if (!noteUnavailable(err)) reportGlobalError(`Could not mark notifications read: ${errorMessage(err)}`)
  } finally {
    markingCount.value--
  }
}

let streamAbort: AbortController | undefined
let streamRetry: number | undefined
let streamGeneration = 0
let lastStateEpoch: string | undefined
let lastStateRevision: number | undefined

function applyStateEvent(data: string) {
  try {
    const payload = JSON.parse(data) as NotificationStateResponse
    if (
      typeof payload.epoch !== 'string' ||
      !Number.isSafeInteger(payload.revision) ||
      payload.revision < 0 ||
      !Number.isSafeInteger(payload.unread?.count) ||
      payload.unread.count < 0 ||
      typeof payload.unread.capped !== 'boolean'
    ) {
      return
    }
    const unreadChanged = unreadCount.value !== payload.unread.count || unreadCapped.value !== payload.unread.capped
    const revisionChanged =
      lastStateEpoch !== undefined &&
      lastStateRevision !== undefined &&
      (lastStateEpoch !== payload.epoch || lastStateRevision !== payload.revision)
    unreadCount.value = payload.unread.count
    unreadCapped.value = payload.unread.capped
    lastStateEpoch = payload.epoch
    lastStateRevision = payload.revision
    if (revisionChanged) dashboardRevision.value++
    if (listLoaded.value && unreadChanged) void loadNotifications()
  } catch {
    // Ignore malformed frames; the next valid state reconciles the client.
  }
}

function applyStreamFrame(frame: string) {
  let event = 'message'
  const data: string[] = []
  for (const line of frame.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue
    const separator = line.indexOf(':')
    const field = separator === -1 ? line : line.slice(0, separator)
    let value = separator === -1 ? '' : line.slice(separator + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    if (field === 'data') data.push(value)
  }
  if (!data.length) return
  if (event === 'state') applyStateEvent(data.join('\n'))
}

async function readStream(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Notification stream has no response body.')
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const frames = buffer.split(/\r?\n\r?\n/)
    buffer = frames.pop() ?? ''
    for (const frame of frames) applyStreamFrame(frame)
    if (done) {
      if (buffer.trim()) applyStreamFrame(buffer)
      return
    }
  }
}

function stopStream() {
  streamGeneration++
  streamAbort?.abort()
  streamAbort = undefined
  if (streamRetry !== undefined) window.clearTimeout(streamRetry)
  streamRetry = undefined
}

async function connectStream(generation: number) {
  if (!currentUser.value || !authToken.value || document.hidden || generation !== streamGeneration) return
  const controller = new AbortController()
  streamAbort = controller
  try {
    const baseUrl = apiBaseUrl.value.replace(/\/$/, '')
    const response = await fetch(new URL(`${baseUrl}/notifications/stream`, window.location.origin), {
      headers: {
        Accept: 'text/event-stream',
        Authorization: `Bearer ${authToken.value}`,
      },
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) throw new ApiError(response.status, `${response.status} ${response.statusText}`)
    await readStream(response)
  } catch (err) {
    if (controller.signal.aborted || generation !== streamGeneration) return
    if (err instanceof ApiError && err.status === 401) {
      forbidden.value = true
      return
    }
    if (noteUnavailable(err)) return
  } finally {
    if (streamAbort === controller) streamAbort = undefined
  }
  if (generation === streamGeneration && currentUser.value && !document.hidden) {
    streamRetry = window.setTimeout(() => void connectStream(generation), STREAM_RETRY_MS)
  }
}

function restartStream() {
  stopStream()
  if (!currentUser.value || !authToken.value || !supported.value || forbidden.value || document.hidden) return
  void connectStream(streamGeneration)
}

if (typeof window !== 'undefined') {
  // Sign-in/out lifecycle: re-probe availability for a fresh identity, clear
  // state when signed out, and use the backend SSE wake stream while signed in.
  watch(
    () => currentUser.value?.id,
    (userId, previousUserId) => {
      if (userId === previousUserId) return
      supported.value = true
      forbidden.value = false
      lastStateEpoch = undefined
      lastStateRevision = undefined
      unreadCount.value = 0
      unreadCapped.value = false
      items.value = []
      nextCursor.value = null
      listLoaded.value = false
      listError.value = null
      restartStream()
    },
    { immediate: true },
  )
  watch([authToken, apiBaseUrl], () => {
    supported.value = true
    forbidden.value = false
    restartStream()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopStream()
    else restartStream()
  })
  window.addEventListener('online', restartStream)
  window.addEventListener('offline', stopStream)
}

// Forces a dashboard refetch after a change the notification stream does not
// report, such as a background job that created a document.
function bumpDashboard() {
  dashboardRevision.value++
}

export function useNotifications() {
  return {
    available,
    unreadCount,
    unreadCapped,
    unreadDisplay,
    items,
    nextCursor,
    listLoaded,
    listLoading,
    loadingMore,
    listError,
    dashboardRevision,
    bumpDashboard,
    marking,
    fetchUnread,
    loadNotifications,
    loadMore,
    markRead,
    markAllRead,
  }
}
