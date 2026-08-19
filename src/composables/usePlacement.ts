import { computed, ref } from 'vue'
import {
  ApiError,
  apiRequest,
  type ApiRequestOptions,
  type RealmPlacementMutationRequest,
} from '@/lib/api'
import { featureEnabled } from '@/lib/config'
import type { RealmPlacementConfigResponse } from '@/lib/placement'
import { useAruna } from '@/composables/useAruna'

const placementAdminEnabled = computed(() => featureEnabled('placementAdmin'))
const busy = ref(false)

function assertEnabled() {
  if (!featureEnabled('placementAdmin')) {
    throw new Error(
      'Placement administration is not enabled on this portal (portal-config features.placementAdmin)',
    )
  }
}

function request<T>(path: string, options: ApiRequestOptions = {}) {
  const { apiBaseUrl, authToken } = useAruna()
  return apiRequest<T>(path, options, { baseUrl: apiBaseUrl.value, token: authToken.value })
}

export function isPlacementUnsupported(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 405)
}

export function placementMutationErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) {
    if (/immutable job-family strategy/i.test(err.message)) {
      return 'The job-family strategy cannot be removed, and its shard count is frozen.'
    }
    if (/currently referenced/i.test(err.message)) {
      return 'This placement strategy is currently referenced and cannot be removed. Remove or update its references first.'
    }
  }
  return err instanceof Error ? err.message : String(err)
}

async function getRealmPlacement(): Promise<RealmPlacementConfigResponse> {
  assertEnabled()
  return request<RealmPlacementConfigResponse>('/info/realm/placement')
}

async function mutateRealmPlacement(
  mutation: RealmPlacementMutationRequest,
): Promise<RealmPlacementConfigResponse> {
  assertEnabled()
  busy.value = true
  try {
    return await request<RealmPlacementConfigResponse>('/info/realm/placement', {
      method: 'PATCH',
      body: JSON.stringify(mutation),
    })
  } finally {
    busy.value = false
  }
}

export function usePlacement() {
  return {
    placementAdminEnabled,
    busy,
    getRealmPlacement,
    mutateRealmPlacement,
  }
}
