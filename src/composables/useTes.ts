import { computed, ref } from 'vue'
import { ApiError, apiRequest } from '@/lib/api'
import { featureEnabled } from '@/lib/config'
import { useAruna } from '@/composables/useAruna'
import {
  TES_GROUP_TAG,
  type TesCreateTaskResponse,
  type TesListTasksResponse,
  type TesServiceInfo,
  type TesState,
  type TesTask,
  type TesView,
} from '@/lib/tes'

// Compute orchestration via GA4GH TES. Calls remain feature-gated because the
// serving node needs a configured compute backend before this surface is usable.

const tesEnabled = computed(() => featureEnabled('tes'))
const busy = ref(false)

function assertEnabled() {
  if (!featureEnabled('tes')) {
    throw new Error('Compute (TES) is not enabled on this portal (portal-config features.tes)')
  }
}

// Consumers render an honest unavailable panel when the serving node has no TES
// route even though a deployment enabled the frontend flag.
export function isTesUnsupported(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 405)
}

// Sibling composable to useAruna: it does not export its raw request() helper,
// but it does export the apiBaseUrl/authToken refs, so we build the same client.
function request<T>(path: string, options = {}) {
  const { apiBaseUrl, authToken } = useAruna()
  return apiRequest<T>(path, options, { baseUrl: apiBaseUrl.value, token: authToken.value })
}

// GET /ga4gh/tes/v1/service-info — assumed endpoint, not yet provided by any
// backend (aruna#290).
async function getTesServiceInfo(): Promise<TesServiceInfo> {
  assertEnabled()
  return request<TesServiceInfo>('/ga4gh/tes/v1/service-info')
}

export interface ListTasksParams {
  name_prefix?: string
  state?: TesState
  tag_key?: string
  tag_value?: string
  page_size?: number
  page_token?: string
  view?: TesView
}

// GET /ga4gh/tes/v1/tasks — assumed endpoint, not yet provided by any backend
// (aruna#290). The spec allows repeated tag_key/tag_value pairs; apiRequest
// supports scalar query values only, and the UI needs at most one pair (the
// group filter), so a single pair is sent.
async function listTasks(params: ListTasksParams): Promise<TesListTasksResponse> {
  assertEnabled()
  return request<TesListTasksResponse>('/ga4gh/tes/v1/tasks', {
    query: {
      name_prefix: params.name_prefix,
      state: params.state,
      tag_key: params.tag_key,
      tag_value: params.tag_value,
      page_size: params.page_size,
      page_token: params.page_token,
      view: params.view,
    },
  })
}

// GET /ga4gh/tes/v1/tasks/{id} — assumed endpoint, not yet provided by any
// backend (aruna#290).
async function getTask(id: string, view: TesView = 'FULL'): Promise<TesTask> {
  assertEnabled()
  return request<TesTask>(`/ga4gh/tes/v1/tasks/${encodeURIComponent(id)}`, { query: { view } })
}

// POST /ga4gh/tes/v1/tasks — assumed endpoint, not yet provided by any backend
// (aruna#290). Client-side invariant checks mirror the issue's "submit with
// validation incl. required group tag" before the request leaves the browser.
async function createTask(task: TesTask): Promise<TesCreateTaskResponse> {
  assertEnabled()
  if (!task.tags?.[TES_GROUP_TAG]) {
    throw new Error('A task must carry the owning group tag (aruna.io/group).')
  }
  if (!task.executors?.some((e) => e.image.trim() && e.command.some((arg) => arg.trim()))) {
    throw new Error('A task needs at least one executor with an image and command.')
  }
  busy.value = true
  try {
    return await request<TesCreateTaskResponse>('/ga4gh/tes/v1/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    })
  } finally {
    busy.value = false
  }
}

// POST /ga4gh/tes/v1/tasks/{id}:cancel — assumed endpoint, not yet provided by
// any backend (aruna#290).
async function cancelTask(id: string): Promise<void> {
  assertEnabled()
  busy.value = true
  try {
    await request<Record<string, never>>(`/ga4gh/tes/v1/tasks/${encodeURIComponent(id)}:cancel`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
  } finally {
    busy.value = false
  }
}

export function useTes() {
  return {
    tesEnabled,
    busy,
    getTesServiceInfo,
    listTasks,
    getTask,
    createTask,
    cancelTask,
  }
}
