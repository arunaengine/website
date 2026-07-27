import { computed, onUnmounted, ref, watch } from 'vue'
import { ApiError } from '@/lib/api'
import { featureEnabled } from '@/lib/config'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import {
  cancelJob as requestCancelJob,
  getJob,
  isTerminalJobState,
  listJobs,
  type JobState,
  type JobStatusResponse,
} from '@/lib/jobs'

// Durable job monitoring. Every network path remains feature-gated so a runtime
// portal config can explicitly disable the surface.

const LIST_POLL_INTERVAL_MS = 10_000
const DETAIL_POLL_INTERVAL_MS = 5_000
const DEFAULT_PAGE_SIZE = 50

const jobsEnabled = computed(() => featureEnabled('jobs'))

function assertEnabled() {
  if (!featureEnabled('jobs')) {
    throw new Error('Jobs are not enabled on this portal (portal-config features.jobs)')
  }
}

// "Flag on, backend without the job framework yet" — consumers render the
// honest not-served-yet panel instead of a raw error (useTes pattern).
export function isJobsUnsupported(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 405)
}

// The jobs surface rejects path-restricted (delegated) tokens with 403.
export function isJobsForbidden(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403
}

function client() {
  const { apiBaseUrl, authToken } = useAruna()
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export async function cancelJob(jobId: string): Promise<JobStatusResponse> {
  assertEnabled()
  return requestCancelJob(jobId, client())
}

export type JobsListState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'error'
  | 'unsupported'
  | 'forbidden'
  | 'signed-out'

export interface JobsListOptions {
  pageSize?: number
  // Extra poll gate (e.g. "panel is open"); the interval itself always guards
  // on flag, sign-in, visibility, single page and an active job being listed.
  pollWhile?: () => boolean
}

// Per-instance list state — call from setup. The jobs view and the staging
// panel hold independent pages/filters, so this is deliberately NOT a module
// singleton (useNotifications) but a factory (ComputeView's list, extracted).
export function useJobsList(options: JobsListOptions = {}) {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const { currentUser } = useAruna()
  const { authPending } = useAuth()

  const jobs = ref<JobStatusResponse[]>([])
  const listState = ref<JobsListState>('idle')
  const listError = ref<string | null>(null)
  const nextCursor = ref<string | null>(null)
  const pagesLoaded = ref(0)
  const refreshing = ref(false)
  const loadingMore = ref(false)
  const moreError = ref<string | null>(null)
  const lastPollError = ref<string | null>(null)
  const stateFilter = ref<'' | JobState>('')
  // Stale responses are dropped via a request id (ObjectBrowserPanel pattern).
  let requestId = 0

  const hasActive = computed(() => jobs.value.some((job) => !isTerminalJobState(job.state)))

  // Nothing to serve: drop any in-flight response and land on a terminal state,
  // never on the pre-fetch 'idle'. A session still resolving keeps loading.
  function clearNoUser() {
    requestId++
    jobs.value = []
    nextCursor.value = null
    pagesLoaded.value = 0
    listError.value = null
    moreError.value = null
    lastPollError.value = null
    if (!jobsEnabled.value) listState.value = 'unsupported'
    else listState.value = authPending.value ? 'loading' : 'signed-out'
  }

  async function load({ silent = false } = {}) {
    if (!jobsEnabled.value || !currentUser.value) {
      clearNoUser()
      return
    }
    const id = ++requestId
    if (!silent) refreshing.value = true
    if (!silent && !jobs.value.length) listState.value = 'loading'
    try {
      const page = await listJobs({ limit: pageSize, state: stateFilter.value || undefined }, client())
      if (id !== requestId) return
      jobs.value = page.jobs
      nextCursor.value = page.next_cursor ?? null
      pagesLoaded.value = 1
      moreError.value = null
      listState.value = 'ready'
      lastPollError.value = null
    } catch (err) {
      if (id !== requestId) return
      if (silent) lastPollError.value = errorMessage(err)
      else if (isJobsUnsupported(err)) listState.value = 'unsupported'
      else if (isJobsForbidden(err)) listState.value = 'forbidden'
      else {
        listState.value = 'error'
        listError.value = errorMessage(err)
      }
    } finally {
      // Clear unconditionally for non-silent calls — a silent poll that
      // superseded this request id must not leave the spinner stuck on.
      if (!silent) refreshing.value = false
    }
  }

  async function loadMore() {
    if (!jobsEnabled.value || !currentUser.value) {
      clearNoUser()
      return
    }
    if (!nextCursor.value || loadingMore.value || refreshing.value) return
    const id = ++requestId
    loadingMore.value = true
    moreError.value = null
    try {
      const page = await listJobs(
        { limit: pageSize, cursor: nextCursor.value, state: stateFilter.value || undefined },
        client(),
      )
      if (id !== requestId) return
      const known = new Set(jobs.value.map((job) => job.job_id))
      jobs.value = [...jobs.value, ...page.jobs.filter((job) => !known.has(job.job_id))]
      nextCursor.value = page.next_cursor ?? null
      pagesLoaded.value += 1
    } catch (err) {
      if (id !== requestId) return
      moreError.value = errorMessage(err)
    } finally {
      loadingMore.value = false
    }
  }

  // Re-filtering starts a fresh page-one query.
  watch(stateFilter, () => void load())

  // The consumer's initial load() runs once, so a session resolving (or
  // dropping) afterwards has to drive the list: a new account reloads, a lost
  // one clears immediately so the previous user's jobs cannot stay on screen.
  watch([currentUser, authPending], ([user], [previous]) => {
    if (!user) clearNoUser()
    else if (user.id !== previous?.id) void load()
  })

  // Auto-refresh re-fetches page one only (a multi-page list must not silently
  // truncate) and only while some listed job is still active.
  const pollTimer = window.setInterval(() => {
    if (document.hidden) return
    if (!jobsEnabled.value || !currentUser.value) return
    if (options.pollWhile && !options.pollWhile()) return
    if (refreshing.value || loadingMore.value) return
    if (listState.value !== 'ready') return
    if (pagesLoaded.value !== 1) return
    if (!hasActive.value) return
    void load({ silent: true })
  }, LIST_POLL_INTERVAL_MS)
  onUnmounted(() => window.clearInterval(pollTimer))

  return {
    jobs,
    listState,
    listError,
    nextCursor,
    refreshing,
    loadingMore,
    moreError,
    lastPollError,
    stateFilter,
    hasActive,
    load,
    loadMore,
  }
}

export type JobDetailState = 'idle' | 'loading' | 'ready' | 'error' | 'unsupported'

// Single-job fetch that keeps polling while the job is non-terminal
// (TaskDetailPanel pattern). `jobId` returning null clears and stops.
export function useJobDetail(jobId: () => string | null) {
  const job = ref<JobStatusResponse | null>(null)
  const loadState = ref<JobDetailState>('idle')
  const loadError = ref<string | null>(null)
  const lastPollError = ref<string | null>(null)
  const cancelling = ref(false)
  const cancelError = ref<string | null>(null)

  let pollTimer: number | undefined
  function stopPolling() {
    if (pollTimer) {
      window.clearInterval(pollTimer)
      pollTimer = undefined
    }
  }
  function startPolling() {
    stopPolling()
    pollTimer = window.setInterval(() => {
      if (document.hidden) return
      if (!job.value || isTerminalJobState(job.value.state)) {
        stopPolling()
        return
      }
      void poll()
    }, DETAIL_POLL_INTERVAL_MS)
  }

  async function poll() {
    const id = jobId()
    if (!id) return
    try {
      job.value = await getJob(id, client())
      lastPollError.value = null
      if (isTerminalJobState(job.value.state)) stopPolling()
    } catch (err) {
      // A poll error never kills the timer or the rendered job.
      lastPollError.value = errorMessage(err)
    }
  }

  async function load() {
    const id = jobId()
    if (!id || !jobsEnabled.value) return
    loadState.value = 'loading'
    loadError.value = null
    lastPollError.value = null
    cancelError.value = null
    try {
      job.value = await getJob(id, client())
      loadState.value = 'ready'
      if (!isTerminalJobState(job.value.state)) startPolling()
    } catch (err) {
      // On GET /jobs/{id} a 404 means THIS job is unknown (foreign or already
      // pruned), so only 405 is safe to read as an absent endpoint.
      if (err instanceof ApiError && err.status === 404) {
        loadState.value = 'error'
        loadError.value = 'Job not found, it may have been pruned.'
      } else if (err instanceof ApiError && err.status === 405) {
        loadState.value = 'unsupported'
      } else {
        loadState.value = 'error'
        loadError.value = errorMessage(err)
      }
    }
  }

  async function cancel(): Promise<boolean> {
    const id = jobId()
    if (!id || cancelling.value) return false
    cancelling.value = true
    cancelError.value = null
    try {
      job.value = await requestCancelJob(id, client())
      // 202 keeps the job live until the executor observes the flag.
      if (!isTerminalJobState(job.value.state)) startPolling()
      return true
    } catch (err) {
      cancelError.value = errorMessage(err)
      return false
    } finally {
      cancelling.value = false
    }
  }

  watch(
    jobId,
    (id) => {
      stopPolling()
      job.value = null
      loadState.value = 'idle'
      loadError.value = null
      lastPollError.value = null
      cancelError.value = null
      if (!id) return
      void load()
    },
    { immediate: true },
  )
  onUnmounted(stopPolling)

  return { job, loadState, loadError, lastPollError, cancelling, cancelError, load, cancel }
}

export function useJobs() {
  return { jobsEnabled }
}
