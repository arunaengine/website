import { computed, ref, watch } from 'vue'
import { apiRequest, type ApiRequestOptions } from '@/lib/api'
import { useAruna } from '@/composables/useAruna'
import { featureEnabled } from '@/lib/config'
import {
  isPolicyListUnsupported,
  listPlacementPolicies,
  policyRefKey,
} from '@/lib/placementPolicies'
import type {
  BucketPlacementRequest,
  BucketPlacementResponse,
  BulkRunRequest,
  BulkRunResponse,
  CoverageQuery,
  CoverageResponse,
  CreatePolicyRequest,
  DiagnosticsQuery,
  DiagnosticsResponse,
  ObjectPlacementRequest,
  ObjectPlacementResponse,
  PolicyRefBody,
  PolicyResponse,
  QuarantineResolveRequest,
  QuarantineResolveResponse,
} from '@/lib/placementPolicies'
import { errorMessage } from '@/lib/utils'

const residencyAdminEnabled = computed(() => featureEnabled('placementAdmin'))
const sessionPolicies = ref<PolicyResponse[]>([])
const sessionPolicyRefs = ref<PolicyRefBody[]>([])
let sessionWatcherInstalled = false

function request<T>(path: string, options: ApiRequestOptions = {}) {
  const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
  const epoch = sessionEpoch.value
  return apiRequest<T>(path, options, { baseUrl: apiBaseUrl.value, token: authToken.value })
    .then((response) => {
      if (epoch !== sessionEpoch.value) throw new DOMException('The API session changed.', 'AbortError')
      return response
    })
}

function rememberRefs(refs: PolicyRefBody[]) {
  const known = new Map(sessionPolicyRefs.value.map((policy) => [policyRefKey(policy), policy]))
  for (const policy of refs) known.set(policyRefKey(policy), policy)
  sessionPolicyRefs.value = [...known.values()]
}

function rememberPolicy(policy: PolicyResponse) {
  const key = policyRefKey(policy)
  const index = sessionPolicies.value.findIndex((candidate) => policyRefKey(candidate) === key)
  if (index < 0) sessionPolicies.value = [...sessionPolicies.value, policy]
  else sessionPolicies.value = sessionPolicies.value.map((candidate, position) =>
    position === index ? policy : candidate,
  )
  rememberRefs([policy])
}

async function createPlacementPolicy(body: CreatePolicyRequest): Promise<PolicyResponse> {
  const policy = await request<PolicyResponse>('/data/placement/policies', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  rememberPolicy(policy)
  return policy
}

// ── Realm policy listing ─────────────────────────────────────────────────────
// The read view of the realm's published residency policies. A node that does
// not serve it answers 404/405, and the panel keeps its session library rather
// than claiming the realm has none.

export type PolicyListState = 'idle' | 'loading' | 'ready' | 'unsupported' | 'error'

const listedPolicies = ref<PolicyResponse[]>([])
const listCursor = ref<string | null>(null)
const listComplete = ref(true)
const listState = ref<PolicyListState>('idle')
const listError = ref<string | null>(null)
const listLoadingMore = ref(false)

const POLICY_PAGE_SIZE = 50

async function loadPolicyPage(more = false): Promise<void> {
  if (more && (!listCursor.value || listLoadingMore.value)) return
  const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
  const epoch = sessionEpoch.value
  if (more) listLoadingMore.value = true
  else {
    listState.value = 'loading'
    listError.value = null
  }
  try {
    const page = await listPlacementPolicies(
      { limit: POLICY_PAGE_SIZE, cursor: more ? (listCursor.value ?? undefined) : undefined },
      { baseUrl: apiBaseUrl.value, token: authToken.value },
    )
    if (epoch !== sessionEpoch.value) return
    listedPolicies.value = more ? [...listedPolicies.value, ...page.policies] : page.policies
    listCursor.value = page.next_cursor
    listComplete.value = page.complete
    listState.value = 'ready'
    for (const policy of page.policies) rememberPolicy(policy)
  } catch (error) {
    if (epoch !== sessionEpoch.value) return
    if (isPolicyListUnsupported(error)) {
      listState.value = 'unsupported'
      return
    }
    if (more) listError.value = errorMessage(error)
    else {
      listState.value = 'error'
      listError.value = errorMessage(error)
    }
  } finally {
    listLoadingMore.value = false
  }
}

async function getPlacementPolicy(policy: PolicyRefBody): Promise<PolicyResponse> {
  const stored = await request<PolicyResponse>(
    `/data/placement/policies/${encodeURIComponent(policy.policy_id)}`,
    { query: { digest: policy.digest } },
  )
  rememberPolicy(stored)
  return stored
}

async function getBucketPlacement(bucket: string): Promise<BucketPlacementResponse> {
  const stored = await request<BucketPlacementResponse>(
    `/data/buckets/${encodeURIComponent(bucket)}/placement`,
  )
  rememberRefs(stored.policies)
  return stored
}

async function putBucketPlacement(
  bucket: string,
  body: BucketPlacementRequest,
): Promise<BucketPlacementResponse> {
  const stored = await request<BucketPlacementResponse>(
    `/data/buckets/${encodeURIComponent(bucket)}/placement`,
    { method: 'PUT', body: JSON.stringify(body) },
  )
  rememberRefs(stored.policies)
  return stored
}

async function mintObjectPlacement(
  bucket: string,
  body: ObjectPlacementRequest,
): Promise<ObjectPlacementResponse> {
  const stored = await request<ObjectPlacementResponse>(
    `/data/buckets/${encodeURIComponent(bucket)}/placement/objects`,
    { method: 'POST', body: JSON.stringify(body) },
  )
  rememberRefs(stored.policies)
  return stored
}

async function runBucketPlacement(bucket: string, body: BulkRunRequest): Promise<BulkRunResponse> {
  const response = await request<BulkRunResponse>(
    `/data/buckets/${encodeURIComponent(bucket)}/placement/runs`,
    { method: 'POST', body: JSON.stringify(body) },
  )
  rememberRefs(response.target_policies)
  return response
}

async function getPlacementCoverage(
  bucket: string,
  query: CoverageQuery = {},
): Promise<CoverageResponse> {
  const response = await request<CoverageResponse>(
    `/data/buckets/${encodeURIComponent(bucket)}/placement/coverage`,
    { query: { scope: query.scope, cursor: query.cursor, limit: query.limit } },
  )
  rememberRefs(response.target_policies)
  return response
}

async function getPlacementDiagnostics(query: DiagnosticsQuery = {}): Promise<DiagnosticsResponse> {
  return request<DiagnosticsResponse>('/data/placement/diagnostics', {
    query: { cursor: query.cursor, limit: query.limit },
  })
}

async function resolvePlacementQuarantine(
  body: QuarantineResolveRequest,
): Promise<QuarantineResolveResponse> {
  return request<QuarantineResolveResponse>('/data/placement/quarantine', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function usePlacementPolicies() {
  if (!sessionWatcherInstalled) {
    sessionWatcherInstalled = true
    const { sessionEpoch } = useAruna()
    watch(sessionEpoch, () => {
      sessionPolicies.value = []
      sessionPolicyRefs.value = []
      listedPolicies.value = []
      listCursor.value = null
      listState.value = 'idle'
      listError.value = null
    })
  }
  return {
    residencyAdminEnabled,
    sessionPolicies,
    sessionPolicyRefs,
    listedPolicies,
    listCursor,
    listComplete,
    listState,
    listError,
    listLoadingMore,
    loadPolicyPage,
    createPlacementPolicy,
    getPlacementPolicy,
    getBucketPlacement,
    putBucketPlacement,
    mintObjectPlacement,
    runBucketPlacement,
    getPlacementCoverage,
    getPlacementDiagnostics,
    resolvePlacementQuarantine,
  }
}
