import { computed, ref, watch } from 'vue'
import { apiRequest, type ApiRequestOptions } from '@/lib/api'
import { useAruna } from '@/composables/useAruna'
import { featureEnabled } from '@/lib/config'
import { policyRefKey } from '@/lib/placementPolicies'
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
  const policy = await request<PolicyResponse>('/admin/placement-policies', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  rememberPolicy(policy)
  return policy
}

async function getPlacementPolicy(policy: PolicyRefBody): Promise<PolicyResponse> {
  const stored = await request<PolicyResponse>(
    `/admin/placement-policies/${encodeURIComponent(policy.policy_id)}`,
    { query: { digest: policy.digest } },
  )
  rememberPolicy(stored)
  return stored
}

async function getBucketPlacement(bucket: string): Promise<BucketPlacementResponse> {
  const stored = await request<BucketPlacementResponse>(
    `/buckets/${encodeURIComponent(bucket)}/placement`,
  )
  rememberRefs(stored.policies)
  return stored
}

async function putBucketPlacement(
  bucket: string,
  body: BucketPlacementRequest,
): Promise<BucketPlacementResponse> {
  const stored = await request<BucketPlacementResponse>(
    `/buckets/${encodeURIComponent(bucket)}/placement`,
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
    `/buckets/${encodeURIComponent(bucket)}/placement/objects`,
    { method: 'POST', body: JSON.stringify(body) },
  )
  rememberRefs(stored.policies)
  return stored
}

async function runBucketPlacement(bucket: string, body: BulkRunRequest): Promise<BulkRunResponse> {
  const response = await request<BulkRunResponse>(
    `/buckets/${encodeURIComponent(bucket)}/placement/runs`,
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
    `/buckets/${encodeURIComponent(bucket)}/placement/coverage`,
    { query: { scope: query.scope, cursor: query.cursor, limit: query.limit } },
  )
  rememberRefs(response.target_policies)
  return response
}

async function getPlacementDiagnostics(query: DiagnosticsQuery = {}): Promise<DiagnosticsResponse> {
  return request<DiagnosticsResponse>('/admin/placement-diagnostics', {
    query: { cursor: query.cursor, limit: query.limit },
  })
}

async function resolvePlacementQuarantine(
  body: QuarantineResolveRequest,
): Promise<QuarantineResolveResponse> {
  return request<QuarantineResolveResponse>('/admin/placement-quarantine', {
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
    })
  }
  return {
    residencyAdminEnabled,
    sessionPolicies,
    sessionPolicyRefs,
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
