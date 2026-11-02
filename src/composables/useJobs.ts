import { computed, getCurrentInstance, inject, onUnmounted, ref, watch, type InjectionKey } from 'vue'
import { ApiError, type ApiClientOptions } from '@/lib/api'
import { featureEnabled } from '@/lib/config'
import { onWake, POLL_IDLE_MS } from '@/lib/poll'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import {
  cancelJob as requestCancelJob,
  deleteJob as requestDeleteJob,
  downloadJobArtifact as requestDownloadArtifact,
  getJob as requestGetJob,
  getJobAudit as requestGetJobAudit,
  getJobReport as requestGetJobReport,
  headJobArtifact as requestHeadArtifact,
  isTerminalJobState,
  listJobs,
  type GetJobAuditParams,
  type GetJobReportParams,
  type JobArtifactDownload,
  type JobArtifactStatus,
  type JobAuditResponse,
  type JobReportResponse,
  type JobState,
  type JobStatusResponse,
} from '@/lib/jobs'
import { errorMessage } from '@/lib/utils'

// Durable job monitoring. Every network path remains feature-gated so a runtime
// portal config can explicitly disable the surface.

const DEFAULT_PAGE_SIZE = 50

const jobsEnabled = computed(() => featureEnabled('jobs'))

function assertEnabled() {
  if (!featureEnabled('jobs')) {
    throw new Error('Jobs are not enabled on this portal (portal-config features.jobs)')
  }
}

// "Flag on, backend without the job framework yet": consumers render the
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

export type JobClient = () => ApiClientOptions

/**
 * Points the job surfaces at another API than the realm the portal signed into
 * (in Aruna Desktop, the node running on this machine). Provided by the view
 * that owns the local runs, so its detail panels follow it.
 */
export const JOB_CLIENT: InjectionKey<JobClient> = Symbol('aruna.jobClient')

// A component's own provide is invisible to itself, so the owner also passes
// its client in explicitly.
function useJobClient(explicit?: JobClient): JobClient {
  if (explicit) return explicit
  return (getCurrentInstance() ? inject(JOB_CLIENT, null) : null) ?? client
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
  /** API holding these jobs; defaults to the realm the portal talks to. */
  client?: JobClient
  /** The other nodes of the realm; each lists only its own jobs, so page one reads them too. */
  others?: () => ApiClientOptions[]
}

// Per-instance list state; call from setup. The jobs view and the staging
// panel hold independent pages/filters, so this is deliberately NOT a module
// singleton (useNotifications) but a factory (ComputeView's list, extracted).
export function useJobsList(options: JobsListOptions = {}) {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const resolveClient = useJobClient(options.client)
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
  // Other nodes that missed page one stay missing until a full reload; a continuation that failed
  // keeps its cursor and is asked again by loadMore.
  const firstFailed = ref(0)
  const moreFailed = ref(0)
  const remoteFailed = computed(() => firstFailed.value + moreFailed.value)
  const remoteCursors = ref<{ client: ApiClientOptions; cursor: string }[]>([])
  const hasMore = computed(() => Boolean(nextCursor.value) || remoteCursors.value.length > 0)
  // Stale responses are dropped via a request id (ObjectBrowserPanel pattern).
  let requestId = 0

  const hasActive = computed(() => jobs.value.some((job) => !isTerminalJobState(job.state)))

  // Nothing to serve: drop any in-flight response and land on a terminal state,
  // never on the pre-fetch 'idle'. A session still resolving keeps loading.
  function clearNoUser() {
    requestId++
    jobs.value = []
    nextCursor.value = null
    firstFailed.value = 0
    moreFailed.value = 0
    remoteCursors.value = []
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
      const params = { limit: pageSize, state: stateFilter.value || undefined }
      // A list pointed at another API, such as a device, has no realm nodes to add.
      const others = resolveClient === client ? (options.others?.() ?? []) : []
      const [page, ...remote] = await Promise.all([
        listJobs(params, resolveClient()),
        ...others.map((other) => listJobs(params, other).catch(() => null)),
      ])
      if (id !== requestId) return
      const known = new Set(page.jobs.map((job) => job.job_id))
      const added = remote.flatMap((other) => other?.jobs ?? []).filter((job) => !known.has(job.job_id) && known.add(job.job_id))
      jobs.value = added.length ? [...page.jobs, ...added].sort((a, b) => b.created_at.localeCompare(a.created_at)) : page.jobs
      nextCursor.value = page.next_cursor ?? null
      firstFailed.value = remote.filter((other) => !other).length
      moreFailed.value = 0
      remoteCursors.value = others.flatMap((other, index) => {
        const cursor = remote[index]?.next_cursor
        return cursor ? [{ client: other, cursor }] : []
      })
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
      // Clear unconditionally for non-silent calls: a silent poll that
      // superseded this request id must not leave the spinner stuck on.
      if (!silent) refreshing.value = false
    }
  }

  async function loadMore() {
    if (!jobsEnabled.value || !currentUser.value) {
      clearNoUser()
      return
    }
    if (!hasMore.value || loadingMore.value || refreshing.value) return
    const id = ++requestId
    loadingMore.value = true
    moreError.value = null
    try {
      const state = stateFilter.value || undefined
      const pending = remoteCursors.value
      const [page, ...remote] = await Promise.all([
        nextCursor.value ? listJobs({ limit: pageSize, cursor: nextCursor.value, state }, resolveClient()) : null,
        ...pending.map((other) => listJobs({ limit: pageSize, cursor: other.cursor, state }, other.client).catch(() => null)),
      ])
      if (id !== requestId) return
      const known = new Set(jobs.value.map((job) => job.job_id))
      const added = [page, ...remote].flatMap((answer) => answer?.jobs ?? []).filter((job) => !known.has(job.job_id) && known.add(job.job_id))
      jobs.value = pending.length ? [...jobs.value, ...added].sort((a, b) => b.created_at.localeCompare(a.created_at)) : [...jobs.value, ...added]
      if (page) nextCursor.value = page.next_cursor ?? null
      // A node that did not answer keeps its cursor, so the next load asks it again.
      moreFailed.value = remote.filter((other) => !other).length
      remoteCursors.value = pending.flatMap((other, index) => {
        const answer = remote[index]
        if (!answer) return [other]
        return answer.next_cursor ? [{ client: other.client, cursor: answer.next_cursor }] : []
      })
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
  function pollList(): void {
    if (document.hidden) return
    if (!jobsEnabled.value || !currentUser.value) return
    if (options.pollWhile && !options.pollWhile()) return
    if (refreshing.value || loadingMore.value) return
    if (listState.value !== 'ready') return
    if (pagesLoaded.value !== 1) return
    if (!hasActive.value) return
    void load({ silent: true })
  }

  const pollTimer = window.setInterval(pollList, POLL_IDLE_MS)
  const unwake = onWake(pollList)
  onUnmounted(() => {
    window.clearInterval(pollTimer)
    unwake()
  })

  return {
    jobs,
    listState,
    listError,
    nextCursor,
    hasMore,
    remoteFailed,
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
export function useJobDetail(jobId: () => string | null, options: { client?: JobClient } = {}) {
  const resolveClient = useJobClient(options.client)
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
    }, POLL_IDLE_MS)
  }

  async function poll() {
    const id = jobId()
    if (!id) return
    try {
      job.value = await requestGetJob(id, resolveClient())
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
      job.value = await requestGetJob(id, resolveClient())
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
      job.value = await requestCancelJob(id, resolveClient())
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
  const resolveClient = useJobClient()

  function getJob(jobId: string): Promise<JobStatusResponse> {
    assertEnabled()
    return requestGetJob(jobId, resolveClient())
  }

  function getJobAudit(jobId: string, params: GetJobAuditParams): Promise<JobAuditResponse> {
    assertEnabled()
    return requestGetJobAudit(jobId, params, resolveClient())
  }

  function getJobReport(jobId: string, params: GetJobReportParams): Promise<JobReportResponse> {
    assertEnabled()
    return requestGetJobReport(jobId, params, resolveClient())
  }

  function headJobArtifact(jobId: string): Promise<JobArtifactStatus> {
    assertEnabled()
    return requestHeadArtifact(jobId, resolveClient())
  }

  function downloadJobArtifact(jobId: string): Promise<JobArtifactDownload> {
    assertEnabled()
    return requestDownloadArtifact(jobId, resolveClient())
  }

  /** `baseUrl` names the node that owns the run, when that is not the serving node. */
  function deleteJob(jobId: string, baseUrl?: string): Promise<void> {
    assertEnabled()
    const options = resolveClient()
    return requestDeleteJob(jobId, baseUrl ? { ...options, baseUrl } : options)
  }

  return { jobsEnabled, getJob, getJobAudit, getJobReport, headJobArtifact, downloadJobArtifact, deleteJob }
}
