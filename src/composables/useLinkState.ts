// What a linked folder shows beside its last run: old names, a running step and open problems.
// Each answer is optional; a node that lacks a route (404) simply says nothing for it.
import { computed, onScopeDispose, ref } from 'vue'
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
import { activeJob, organizeError } from '@/lib/organize'

const POLL_MS = 3000

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

  const job = computed(() => activeJob(stored.value))
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
    const [found, current, counted] = await Promise.all([
      read(() => getImportRenames(group, link, client())),
      read(() => getOrganizeJob(group, link, client())),
      read(() => getLinkStatus(group, link, client())),
    ])
    if (disposed || id !== generation) return
    if (found.state !== 'failed') renames.value = found.state === 'ok' ? found.value : null
    if (counted.state !== 'failed') status.value = counted.state === 'ok' ? counted.value : null
    const wasActive = job.value !== null
    if (current.state === 'ok') {
      stored.value = current.value
      const ended = current.value && !activeJob(current.value) ? `${current.value.started_at_ms}:${current.value.finished_at_ms}` : ''
      if ((ended && ended !== lastEnd) || (wasActive && !current.value)) finished.value++
      if (ended) lastEnd = ended
    } else if (current.state === 'missing') {
      supported.value = false
      stored.value = null
    }
    const failed = [found, current, counted].find((result) => result.state === 'failed')
    readError.value = failed?.state === 'failed' ? failed.message : null
    schedule()
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

  return { renames, status, job, supported, error, controlling, finished, refresh, control }
}
