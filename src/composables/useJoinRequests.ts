import { computed, ref, watch } from 'vue'
import {
  apiRequest,
  type CreateJoinRequestRequest,
  type DecideJoinRequestRequest,
  type DecideJoinRequestResponse,
  type JoinRequest,
  type ListJoinRequestsResponse,
} from '@/lib/api'
import { featureEnabled } from '@/lib/config'
import { useAruna } from '@/composables/useAruna'
import { errorMessage } from '@/lib/utils'

// Join requests (aruna#248). The backend does not serve these endpoints yet;
// every path here is gated behind the `joinRequests` feature flag, so with the
// default config (features: {}) this module is inert: no HTTP call can fire
// because every mutation/loader starts with assertEnabled().

const ownRequests = ref<JoinRequest[]>([])
const ownRequestsLoaded = ref(false)
const ownRequestsError = ref<string | null>(null)
const busy = ref(false)
// Serializes the first-load fan-out: every JoinRequestButton plus GroupsView call
// ensureOwnRequestsLoaded() in the same tick before ownRequestsLoaded flips.
let ownRequestsInflight: Promise<void> | null = null

// Sign-out via the non-Keycloak fallback and account switches (manual token swap)
// change currentUser without a page reload, so the module-singleton own-request
// cache would otherwise survive and render the previous account's requests.
// Mirror useNotifications: reset on account change. Reset only (no HTTP, no
// featureEnabled read), so the flag-off zero-HTTP guarantee is untouched. Keying
// on the id (not just null) also covers a direct A→B token swap; consumers' own
// watches then refetch because ownRequestsLoaded is false again.
if (typeof window !== 'undefined') {
  const { currentUser } = useAruna()
  watch(
    () => currentUser.value?.id,
    (id, prev) => {
      if (id === prev) return
      ownRequests.value = []
      ownRequestsLoaded.value = false
      ownRequestsError.value = null
    },
  )
}

const joinRequestsEnabled = computed(() => featureEnabled('joinRequests'))

// Own PENDING request per group id: drives button/badge state.
const pendingByGroup = computed<Map<string, JoinRequest>>(
  () =>
    new Map(
      ownRequests.value.filter((r) => r.status === 'pending').map((r) => [r.group_id, r]),
    ),
)

function assertEnabled() {
  if (!featureEnabled('joinRequests')) {
    throw new Error(
      'Join requests are not enabled on this portal (portal-config features.joinRequests)',
    )
  }
}

// Sibling composable to useAruna: it does not export its raw request() helper,
// but it does export the apiBaseUrl/authToken refs, so we build the same client.
function request<T>(path: string, options = {}) {
  const { apiBaseUrl, authToken } = useAruna()
  return apiRequest<T>(path, options, { baseUrl: apiBaseUrl.value, token: authToken.value })
}

// GET /users/join-requests: own pending + recently decided requests.
// not yet provided by the backend (aruna#248). A missing backend must degrade
// to an inline notice, so this catches and stores the error rather than throwing.
async function loadOwnRequests(): Promise<void> {
  assertEnabled()
  ownRequestsError.value = null
  try {
    const response = await request<ListJoinRequestsResponse>('/users/join-requests')
    ownRequests.value = response.requests
    ownRequestsLoaded.value = true
  } catch (err) {
    ownRequestsError.value = errorMessage(err)
  }
}

// Idempotent mount hook: load once, skip when already loaded or signed out.
async function ensureOwnRequestsLoaded(): Promise<void> {
  if (!featureEnabled('joinRequests')) return
  const { authToken } = useAruna()
  if (ownRequestsLoaded.value || !authToken.value) return
  // Collapse the mount-time fan-out into a single request; callers all await the
  // same in-flight promise and it clears once settled so a later reload can refetch.
  if (!ownRequestsInflight) {
    ownRequestsInflight = loadOwnRequests().finally(() => {
      ownRequestsInflight = null
    })
  }
  await ownRequestsInflight
}

// POST /groups/{groupId}/join-requests: not yet provided by the backend (aruna#248).
async function requestJoin(groupId: string, message?: string): Promise<JoinRequest> {
  assertEnabled()
  busy.value = true
  try {
    const body: CreateJoinRequestRequest = {}
    if (message && message.trim()) body.message = message.trim()
    const created = await request<JoinRequest>(`/groups/${groupId}/join-requests`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    ownRequests.value = [created, ...ownRequests.value]
    return created
  } finally {
    busy.value = false
  }
}

// DELETE /groups/{group_id}/join-requests/{request_id}: not yet provided by
// the backend (aruna#248). Requester withdraws a still-pending request (204).
async function withdrawRequest(req: JoinRequest): Promise<void> {
  assertEnabled()
  busy.value = true
  try {
    await request<void>(`/groups/${req.group_id}/join-requests/${req.request_id}`, {
      method: 'DELETE',
    })
    ownRequests.value = ownRequests.value.filter((r) => r.request_id !== req.request_id)
  } finally {
    busy.value = false
  }
}

// GET /groups/{groupId}/join-requests?status=pending: admin inbox. The status
// filter is part of the assumed contract; the client additionally filters
// status === 'pending' defensively. not yet provided by the backend (aruna#248).
async function listGroupJoinRequests(groupId: string): Promise<JoinRequest[]> {
  assertEnabled()
  const response = await request<ListJoinRequestsResponse>(`/groups/${groupId}/join-requests`, {
    query: { status: 'pending' },
  })
  return response.requests.filter((r) => r.status === 'pending')
}

// POST /groups/{groupId}/join-requests/{requestId}/decide: approve (assigns
// role_ids, defaulting to the "user" role like AddGroupMemberRequest) or deny.
// not yet provided by the backend (aruna#248).
async function decideJoinRequest(
  groupId: string,
  requestId: string,
  input: DecideJoinRequestRequest,
): Promise<DecideJoinRequestResponse> {
  assertEnabled()
  busy.value = true
  try {
    const response = await request<DecideJoinRequestResponse>(
      `/groups/${groupId}/join-requests/${requestId}/decide`,
      { method: 'POST', body: JSON.stringify(input) },
    )
    // Harmless cross-account safety: if this id happens to be in our own list,
    // drop it so a stale pending row cannot linger.
    ownRequests.value = ownRequests.value.filter((r) => r.request_id !== requestId)
    return response
  } finally {
    busy.value = false
  }
}

export function useJoinRequests() {
  return {
    joinRequestsEnabled,
    ownRequests,
    ownRequestsLoaded,
    ownRequestsError,
    pendingByGroup,
    busy,
    loadOwnRequests,
    ensureOwnRequestsLoaded,
    requestJoin,
    withdrawRequest,
    listGroupJoinRequests,
    decideJoinRequest,
  }
}
