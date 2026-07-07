import { computed, ref } from 'vue'
import {
  ApiError,
  apiRequest,
  type ApiRequestOptions,
  type GroupPlacementResponse,
  type GroupPlacementStrategyResponse,
  type PlacementStrategyConfig,
  type PlacementTransitionsResponse,
  type PutPlacementStrategyRequest,
  type RealmPlacementDefaultsResponse,
} from '@/lib/api'
import { featureEnabled } from '@/lib/config'
import { useAruna } from '@/composables/useAruna'

// Placement administration (aruna#269). The backend serves NO strategy /
// placement-defaults / transitions endpoints yet; every path here is gated
// behind the `placementAdmin` feature flag, so with the default config
// (features: {}) this module is inert — no HTTP call can fire because every
// function starts with assertEnabled(). The field vocabulary tracks
// core/src/structs/placement.rs so the flip is trivial once the REST surface
// lands (see api.ts placement block).

const placementAdminEnabled = computed(() => featureEnabled('placementAdmin'))
const busy = ref(false)

function assertEnabled() {
  if (!featureEnabled('placementAdmin')) {
    throw new Error(
      'Placement administration is not enabled on this portal (portal-config features.placementAdmin)',
    )
  }
}

// Sibling composable to useAruna: it does not export its raw request() helper,
// but it does export the apiBaseUrl/authToken refs, so we build the same client.
function request<T>(path: string, options: ApiRequestOptions = {}) {
  const { apiBaseUrl, authToken } = useAruna()
  return apiRequest<T>(path, options, { baseUrl: apiBaseUrl.value, token: authToken.value })
}

// True for "flag on, backend without aruna#269 yet" — consumers render the
// honest not-served-yet panel instead of a raw error.
export function isPlacementUnsupported(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 405)
}

// GET /groups/{id}/placement-strategy — assumed endpoint, aruna#269.
async function getGroupStrategy(groupId: string): Promise<GroupPlacementStrategyResponse> {
  assertEnabled()
  return request<GroupPlacementStrategyResponse>(`/groups/${groupId}/placement-strategy`)
}

// PUT /groups/{id}/placement-strategy — assumed endpoint, aruna#269. Management
// node validates against realm policy and re-signs; a 400 carries the human
// bounds message, rendered verbatim by callers.
async function putGroupStrategy(
  groupId: string,
  strategy: PlacementStrategyConfig,
): Promise<GroupPlacementStrategyResponse> {
  assertEnabled()
  busy.value = true
  try {
    const body: PutPlacementStrategyRequest = { strategy }
    return await request<GroupPlacementStrategyResponse>(`/groups/${groupId}/placement-strategy`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  } finally {
    busy.value = false
  }
}

// GET /info/realm/placement-defaults — assumed endpoint, aruna#269.
async function getRealmPlacementDefaults(): Promise<RealmPlacementDefaultsResponse> {
  assertEnabled()
  return request<RealmPlacementDefaultsResponse>('/info/realm/placement-defaults')
}

// PUT /info/realm/placement-defaults — assumed endpoint, aruna#269. Mirrors
// PUT /info/realm/quota: realm-admin + management node.
async function putRealmPlacementDefaults(
  strategy: PlacementStrategyConfig,
): Promise<RealmPlacementDefaultsResponse> {
  assertEnabled()
  busy.value = true
  try {
    const body: PutPlacementStrategyRequest = { strategy }
    return await request<RealmPlacementDefaultsResponse>('/info/realm/placement-defaults', {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  } finally {
    busy.value = false
  }
}

// GET /groups/{id}/placement — assumed endpoint, aruna#269. The computed node
// set for the group's records; the portal aggregates it by location.
async function getGroupPlacement(groupId: string): Promise<GroupPlacementResponse> {
  assertEnabled()
  return request<GroupPlacementResponse>(`/groups/${groupId}/placement`)
}

// GET /info/realm/placement/transitions — assumed endpoint, aruna#269.
async function listPlacementTransitions(): Promise<PlacementTransitionsResponse> {
  assertEnabled()
  return request<PlacementTransitionsResponse>('/info/realm/placement/transitions')
}

export function usePlacement() {
  return {
    placementAdminEnabled,
    busy,
    getGroupStrategy,
    putGroupStrategy,
    getRealmPlacementDefaults,
    putRealmPlacementDefaults,
    getGroupPlacement,
    listPlacementTransitions,
  }
}
