import { computed, ref, watch } from 'vue'
import {
  type CreateJoinRequestRequest,
  type DecideJoinRequestRequest,
  type DecideJoinRequestResponse,
  type JoinRequest,
  type ListJoinRequestsResponse,
} from '@/lib/api'
import { featureEnabled } from '@/lib/config'
import { useAruna } from '@/composables/useAruna'
import { assertCurrentSession, request, sessionEpoch } from '@/composables/aruna/state'
import { errorMessage } from '@/lib/utils'

const ownRequests = ref<JoinRequest[]>([])
const ownRequestsLoaded = ref(false)
const ownRequestsError = ref<string | null>(null)
const busy = ref(false)
// Serializes the first-load fan-out: every JoinRequestButton plus GroupsView call
// ensureOwnRequestsLoaded() in the same tick before ownRequestsLoaded flips.
let ownRequestsInflight: Promise<void> | null = null

let ownGeneration = 0
watch(sessionEpoch, () => {
  ++ownGeneration
  ownRequests.value = []
  ownRequestsLoaded.value = false
  ownRequestsError.value = null
  ownRequestsInflight = null
  busy.value = false
}, { flush: 'sync' })

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

async function loadPages(path: string, status?: string): Promise<JoinRequest[]> {
  const epoch = sessionEpoch.value
  const requests: JoinRequest[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await request<ListJoinRequestsResponse>(path, { query: { status, start_after: cursor } })
    assertCurrentSession(epoch)
    requests.push(...page.requests)
    cursor = page.next_start_after ?? undefined
    if (cursor && seen.has(cursor)) throw new Error('Membership request pagination did not advance.')
    if (cursor) seen.add(cursor)
  } while (cursor)
  return requests
}

async function loadOwnRequests(): Promise<void> {
  assertEnabled()
  ownRequestsError.value = null
  const epoch = sessionEpoch.value
  const generation = ++ownGeneration
  try {
    const requests = await loadPages('/access/users/join-requests')
    if (epoch !== sessionEpoch.value || generation !== ownGeneration) return
    ownRequests.value = requests
    ownRequestsLoaded.value = true
  } catch (err) {
    if (epoch === sessionEpoch.value && generation === ownGeneration) ownRequestsError.value = errorMessage(err)
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
    const pending = loadOwnRequests().finally(() => {
      if (ownRequestsInflight === pending) ownRequestsInflight = null
    })
    ownRequestsInflight = pending
  }
  await ownRequestsInflight
}

async function requestJoin(groupId: string, message?: string): Promise<JoinRequest> {
  assertEnabled()
  busy.value = true
  const epoch = sessionEpoch.value
  ++ownGeneration
  try {
    const body: CreateJoinRequestRequest = {}
    if (message && message.trim()) body.message = message.trim()
    const created = await request<JoinRequest>(`/access/groups/${groupId}/join-requests`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    assertCurrentSession(epoch)
    ownRequests.value = [created, ...ownRequests.value.filter((entry) => entry.request_id !== created.request_id)]
    await loadOwnRequests()
    return created
  } finally {
    if (epoch === sessionEpoch.value) busy.value = false
  }
}

async function withdrawRequest(req: JoinRequest): Promise<void> {
  assertEnabled()
  busy.value = true
  const epoch = sessionEpoch.value
  ++ownGeneration
  try {
    await request<void>(`/access/groups/${req.group_id}/join-requests/${req.request_id}`, {
      method: 'DELETE',
    })
    assertCurrentSession(epoch)
    ownRequests.value = ownRequests.value.filter((r) => r.request_id !== req.request_id)
    await loadOwnRequests()
  } finally {
    if (epoch === sessionEpoch.value) busy.value = false
  }
}

async function listGroupJoinRequests(groupId: string): Promise<JoinRequest[]> {
  assertEnabled()
  return (await loadPages(`/access/groups/${groupId}/join-requests`, 'pending'))
    .filter((r) => r.status === 'pending')
}

async function decideJoinRequest(
  groupId: string,
  requestId: string,
  input: DecideJoinRequestRequest,
): Promise<DecideJoinRequestResponse> {
  assertEnabled()
  busy.value = true
  const epoch = sessionEpoch.value
  ++ownGeneration
  try {
    const response = await request<DecideJoinRequestResponse>(
      `/access/groups/${groupId}/join-requests/${requestId}/decide`,
      { method: 'POST', body: JSON.stringify(input) },
    )
    assertCurrentSession(epoch)
    ownRequests.value = ownRequests.value.filter((r) => r.request_id !== requestId)
    return response
  } finally {
    if (epoch === sessionEpoch.value) busy.value = false
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
