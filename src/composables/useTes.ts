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

// Compute orchestration via the GA4GH TES facade (api/src/routes/tes.rs). Calls
// stay feature-gated because the node needs a configured compute backend first.

const tesEnabled = computed(() => featureEnabled('tes'))
const busy = ref(false)

function assertEnabled() {
  if (!featureEnabled('tes')) {
    throw new Error('Compute is not enabled on this portal (portal-config features.tes)')
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

// GET /ga4gh/tes/v1/service-info (api/src/routes/tes.rs service_info).
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

// GET /ga4gh/tes/v1/tasks (api/src/routes/tes.rs list_tasks). page_size caps at
// 512 (default 256). The backend supports repeated tag_key/tag_value pairs;
// apiRequest sends scalar query values and the UI needs only the group pair.
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

// GET /ga4gh/tes/v1/tasks/{id} (api/src/routes/tes.rs get_task). stdout/stderr
// and system logs are only populated at view=FULL once the task is terminal.
async function getTask(id: string, view: TesView = 'FULL'): Promise<TesTask> {
  assertEnabled()
  return request<TesTask>(`/ga4gh/tes/v1/tasks/${encodeURIComponent(id)}`, { query: { view } })
}

// createTask result: `workspaceIgnored` is set when the node rejected the
// (non-GA4GH) workspace field and the task was resubmitted without it.
export interface TesCreateTaskResult extends TesCreateTaskResponse {
  workspaceIgnored?: boolean
}

// POST /ga4gh/tes/v1/tasks (api/src/routes/tes.rs create_task). Under the
// portal's bearer auth the backend requires the owning-group tag, so it is
// validated here before the request leaves the browser.
async function createTask(task: TesTask): Promise<TesCreateTaskResult> {
  assertEnabled()
  if (!task?.tags?.[TES_GROUP_TAG]) {
    throw new Error(`A task must carry the owning group tag (${TES_GROUP_TAG}).`)
  }
  if (!task.executors?.some((e) => e.image.trim() && e.command.some((arg) => arg.trim()))) {
    throw new Error('A run needs at least one executor with an image and command.')
  }
  busy.value = true
  try {
    try {
      return await request<TesCreateTaskResponse>('/ga4gh/tes/v1/tasks', {
        method: 'POST',
        body: JSON.stringify(task),
      })
    } catch (err) {
      // Workspace choice is an Aruna extension: a node that predates it may
      // reject the unknown field with 400/422. Retry once without it; if the
      // retry succeeds the workspace field was the problem, otherwise the
      // original error stands.
      if (task.workspace && err instanceof ApiError && (err.status === 400 || err.status === 422)) {
        const { workspace: _workspace, ...rest } = task
        try {
          const created = await request<TesCreateTaskResponse>('/ga4gh/tes/v1/tasks', {
            method: 'POST',
            body: JSON.stringify(rest),
          })
          return { ...created, workspaceIgnored: true }
        } catch {
          throw err
        }
      }
      throw err
    }
  } finally {
    busy.value = false
  }
}

// POST /ga4gh/tes/v1/tasks/{id}:cancel (api/src/routes/tes.rs cancel_task). The
// literal ':cancel' action suffix is required; the handler rejects it otherwise.
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
