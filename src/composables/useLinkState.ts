// What a linked folder shows beside its last run: old names, a running step and open problems.
// Each answer is optional; a node that lacks a route (404) simply says nothing for it.
import { computed, onScopeDispose, ref } from 'vue'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import {
  controlJob,
  getImportRenames,
  getLinkStatus,
  getOrganizeJob,
  type BackendImportRenames,
  type LinkStatus,
  type OrganizeJob,
} from '@/lib/api'
import { isActive, renameJob } from '@/lib/organize'
import { errorMessage } from '@/lib/utils'

const POLL_MS = 3000

export function useLinkState(groupId: () => string, importId: () => string) {
  const { apiBaseUrl, authToken } = useAruna()
  const renames = ref<BackendImportRenames | null>(null)
  const stored = ref<OrganizeJob | null>(null)
  const status = ref<LinkStatus | null>(null)
  // False once the node answers 404 for the step routes.
  const supported = ref(true)
  const error = ref<string | null>(null)
  const controlling = ref(false)
  let generation = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  const job = computed(() => (isActive(stored.value) ? stored.value : renameJob(renames.value)))

  function client() {
    return { baseUrl: apiBaseUrl.value, token: authToken.value }
  }

  async function optional<T>(run: () => Promise<T>, onMissing: () => void): Promise<T | null> {
    try {
      return await run()
    } catch (err) {
      if (isUnsupportedEndpoint(err)) onMissing()
      else error.value = errorMessage(err)
      return null
    }
  }

  async function refresh() {
    const id = ++generation
    const group = groupId()
    const link = importId()
    const [found, current, counted] = await Promise.all([
      optional(() => getImportRenames(group, link, client()), () => {}),
      optional(() => getOrganizeJob(group, link, client()), () => (supported.value = false)),
      optional(() => getLinkStatus(group, link, client()), () => {}),
    ])
    if (id !== generation) return
    renames.value = found
    stored.value = current
    status.value = counted
    schedule()
  }

  function schedule() {
    if (timer) clearTimeout(timer)
    timer = job.value ? setTimeout(() => void refresh(), POLL_MS) : null
  }

  async function control(action: 'pause' | 'resume' | 'abort') {
    if (controlling.value) return
    controlling.value = true
    error.value = null
    try {
      stored.value = await controlJob(groupId(), importId(), action, client())
    } catch (err) {
      error.value = errorMessage(err)
    } finally {
      controlling.value = false
    }
    await refresh()
  }

  onScopeDispose(() => {
    generation++
    if (timer) clearTimeout(timer)
  })

  return { renames, status, job, supported, error, controlling, refresh, control }
}
