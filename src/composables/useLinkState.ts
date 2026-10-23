// What a linked folder shows beside its last run: old names, a running step and open problems.
// Each answer is optional; a node that lacks a route (404) simply says nothing for it.
import { computed, onScopeDispose, reactive, ref } from 'vue'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import {
  ApiError,
  controlJob,
  getImportRenames,
  getLinkStatus,
  getOrganizeJob,
  type BackendImportRenames,
  type LinkStatus,
  type OrganizeJob,
} from '@/lib/api'
import { activeJob, organizeError, timeLeft, type ProgressJob } from '@/lib/organize'

const POLL_MS = 3000
// A rename the node accepted but no read shows yet; it has no step to pause or abort.
const STARTING: ProgressJob = { kind: 'rename', state: 'running', done: 0, total: 0, counted: false, skipped: 0, failed: 0, controls: false }

/** Links with a settings save on its way, by "group\nimport"; a new opening waits for it. */
export const savesInFlight = reactive(new Set<string>())

export function useLinkState(groupId: () => string, importId: () => string) {
  const { apiBaseUrl, authToken } = useAruna()
  const renames = ref<BackendImportRenames | null>(null)
  const stored = ref<OrganizeJob | null>(null)
  const status = ref<LinkStatus | null>(null)
  // False once the node answers 404 for the step routes.
  const supported = ref(true)
  // A failed read keeps what was known; the error stays visible until a read works.
  const readError = ref<string | null>(null)
  const controlError = ref<string | null>(null)
  const error = computed(() => readError.value ?? controlError.value)
  const controlling = ref(false)
  // Counts steps seen to end, so lists that depend on the result can read again.
  const finished = ref(0)
  let lastEnd = ''
  let generation = 0
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | null = null

  // A rename reports no total; it is fixed from the plan, once per run (by its start time).
  const sized = ref<{ started: number; total: number } | null>(null)
  // A rename the node just accepted counts as running until a read shows its step or two reads do not.
  const starting = ref<{ before: number | null; total: number | null; misses: number } | null>(null)
  const job = computed(() => {
    const active = activeJob(stored.value)
    if (!active && starting.value) return STARTING
    if (active?.kind !== 'rename' || !sized.value || sized.value.started !== active.started_at_ms) return active
    const total = Math.max(sized.value.total, active.done + active.failed)
    const counted = { ...active, total, counted: true }
    return { ...counted, left: timeLeft(counted, Date.now()) }
  })
  // The last step, once it is over.
  const lastJob = computed(() => (stored.value && !activeJob(stored.value) ? stored.value : null))
  const context = () => `${groupId()}\n${importId()}`

  function client() {
    return { baseUrl: apiBaseUrl.value, token: authToken.value }
  }

  type Read<T> = { state: 'ok'; value: T } | { state: 'missing' } | { state: 'failed'; message: string }

  async function read<T>(run: () => Promise<T>): Promise<Read<T>> {
    try {
      return { state: 'ok', value: await run() }
    } catch (err) {
      if (isUnsupportedEndpoint(err)) return { state: 'missing' }
      return { state: 'failed', message: organizeError(err) }
    }
  }

  async function refresh() {
    const id = ++generation
    const group = groupId()
    const link = importId()
    // A running step needs only its progress; the full reads follow once it ends.
    const running = job.value !== null
    const [found, current, counted] = await Promise.all([
      running ? null : read(() => getImportRenames(group, link, client())),
      read(() => getOrganizeJob(group, link, client())),
      running ? null : read(() => getLinkStatus(group, link, client())),
    ])
    if (disposed || id !== generation) return
    if (found && found.state !== 'failed') renames.value = found.state === 'ok' ? found.value : null
    if (counted && counted.state !== 'failed') status.value = counted.state === 'ok' ? counted.value : null
    const wasActive = activeJob(stored.value) !== null
    if (current.state === 'ok') {
      stored.value = current.value
      size(found?.state === 'ok')
      confirm()
      const ended = current.value && !activeJob(current.value) ? `${current.value.started_at_ms}:${current.value.finished_at_ms}` : ''
      if ((ended && ended !== lastEnd) || (wasActive && !current.value)) finished.value++
      if (ended) lastEnd = ended
    } else if (current.state === 'missing') {
      supported.value = false
      stored.value = null
      starting.value = null
    }
    const failed = [found, current, counted].find((result) => result?.state === 'failed')
    readError.value = failed?.state === 'failed' ? failed.message : null
    if (running && !job.value) return refresh()
    schedule()
  }

  // The plan the click was made on, or the one read now (it left out the files done by then) or before.
  function size(fresh: boolean) {
    const active = activeJob(stored.value)
    const started = active?.started_at_ms
    if (!active || active.kind !== 'rename' || started === undefined || started === sized.value?.started) return
    const total = starting.value?.total ?? (renames.value ? renames.value.count + (fresh ? active.done + active.failed : 0) : null)
    if (total !== null) sized.value = { started, total }
  }

  function confirm() {
    const begun = starting.value
    if (!begun) return
    const step = stored.value
    if (step && (activeJob(step) || step.started_at_ms !== begun.before)) starting.value = null
    else if (++begun.misses >= 2) {
      // The step ended before any read saw it.
      starting.value = null
      finished.value++
    }
  }

  /** A rename was accepted: shows it running at once, with the plan count it was started from. */
  function begin(total: number | null) {
    if (disposed) return Promise.resolve()
    starting.value = { before: stored.value?.started_at_ms ?? null, total, misses: 0 }
    return refresh()
  }

  function schedule() {
    if (timer) clearTimeout(timer)
    timer = !disposed && job.value ? setTimeout(() => void refresh(), POLL_MS) : null
  }

  async function control(action: 'pause' | 'resume' | 'abort') {
    if (controlling.value || disposed) return
    controlling.value = true
    controlError.value = null
    const asked = context()
    try {
      const answer = await controlJob(groupId(), importId(), action, client())
      if (!disposed && asked === context()) stored.value = answer
    } catch (err) {
      // The step ended on its own meanwhile; the refresh below shows how.
      const over = err instanceof ApiError && err.status === 409 && err.code === 'no_job'
      if (!over && !disposed && asked === context()) controlError.value = organizeError(err)
    } finally {
      controlling.value = false
    }
    if (!disposed && asked === context()) await refresh()
  }

  onScopeDispose(() => {
    disposed = true
    generation++
    if (timer) clearTimeout(timer)
  })

  return { renames, status, job, lastJob, supported, error, controlling, finished, refresh, begin, control }
}
