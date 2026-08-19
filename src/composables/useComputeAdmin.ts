import { apiRequest, type ApiRequestOptions } from '@/lib/api'
import { useAruna } from '@/composables/useAruna'
import type {
  ComputeConfigBody,
  ComputeSnapshotsResponse,
  DrainRequest,
  DrainResponse,
} from '@/lib/computeAdmin'

function request<T>(path: string, options: ApiRequestOptions = {}) {
  const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
  const epoch = sessionEpoch.value
  return apiRequest<T>(path, options, { baseUrl: apiBaseUrl.value, token: authToken.value })
    .then((response) => {
      if (epoch !== sessionEpoch.value) throw new DOMException('The API session changed.', 'AbortError')
      return response
    })
}

async function getComputeConfig(): Promise<ComputeConfigBody> {
  return request<ComputeConfigBody>('/admin/compute/config')
}

async function putComputeConfig(config: ComputeConfigBody): Promise<ComputeConfigBody> {
  return request<ComputeConfigBody>('/admin/compute/config', {
    method: 'PUT',
    body: JSON.stringify(config),
  })
}

async function getComputeSnapshots(groupId?: string): Promise<ComputeSnapshotsResponse> {
  return request<ComputeSnapshotsResponse>('/admin/compute/snapshots', {
    query: { group_id: groupId?.trim() || undefined },
  })
}

async function setComputeDrain(draining: boolean): Promise<DrainResponse> {
  const body: DrainRequest = { draining }
  return request<DrainResponse>('/admin/compute/drain', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function useComputeAdmin() {
  return {
    getComputeConfig,
    putComputeConfig,
    getComputeSnapshots,
    setComputeDrain,
  }
}
