import { computed, ref } from 'vue'
import { ApiError, apiRequest, type ApiRequestOptions } from '@/lib/api'
import { featureEnabled } from '@/lib/config'
import { useAruna } from '@/composables/useAruna'
import type {
  DryRunRequest,
  DryRunResponse,
  EffectivePoliciesResponse,
  PoliciesResponse,
  Policy,
  ValidatePolicyRequest,
  ValidatePolicyResponse,
} from '@/lib/policies'
import { toWirePolicy } from '@/lib/policies'

const policiesEnabled = computed(() => featureEnabled('policies'))
const saving = ref(false)

function request<T>(path: string, options: ApiRequestOptions = {}) {
  const { apiBaseUrl, authToken } = useAruna()
  return apiRequest<T>(path, options, { baseUrl: apiBaseUrl.value, token: authToken.value })
}

/** True on backends that predate the policy API, so callers can hide the tab. */
export function isPoliciesUnsupported(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 405)
}

/** A concurrent write landed first; the caller must reload before retrying. */
export function isStaleWrite(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409
}

function getRealmPolicies(): Promise<PoliciesResponse> {
  return request<PoliciesResponse>('/policies/realm')
}

function getGroupPolicies(groupId: string): Promise<PoliciesResponse> {
  return request<PoliciesResponse>(`/policies/group/${encodeURIComponent(groupId)}`)
}

// The API replaces a whole scope per write, so every save round-trips the
// set_hash it was based on; a 409 means someone else changed the set meanwhile.
async function setPolicies(
  path: string,
  policies: Policy[],
  expectedHash?: string,
): Promise<PoliciesResponse> {
  saving.value = true
  try {
    return await request<PoliciesResponse>(path, {
      method: 'PUT',
      body: JSON.stringify({
        policies: policies.map(toWirePolicy),
        ...(expectedHash ? { expected_hash: expectedHash } : {}),
      }),
    })
  } finally {
    saving.value = false
  }
}

function setRealmPolicies(policies: Policy[], expectedHash?: string) {
  return setPolicies('/policies/realm', policies, expectedHash)
}

function setGroupPolicies(groupId: string, policies: Policy[], expectedHash?: string) {
  return setPolicies(`/policies/group/${encodeURIComponent(groupId)}`, policies, expectedHash)
}

function getEffective(groupId?: string): Promise<EffectivePoliciesResponse> {
  return request<EffectivePoliciesResponse>('/policies/effective', {
    query: groupId ? { group_id: groupId } : {},
  })
}

function validatePolicy(body: ValidatePolicyRequest): Promise<ValidatePolicyResponse> {
  return request<ValidatePolicyResponse>('/policies/validate', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function dryRun(body: DryRunRequest): Promise<DryRunResponse> {
  return request<DryRunResponse>('/policies/dry-run', {
    method: 'POST',
    body: JSON.stringify({
      ...body,
      ...(body.candidate_policies
        ? { candidate_policies: body.candidate_policies.map(toWirePolicy) }
        : {}),
    }),
  })
}

export function usePolicies() {
  return {
    policiesEnabled,
    saving,
    getRealmPolicies,
    getGroupPolicies,
    setRealmPolicies,
    setGroupPolicies,
    getEffective,
    validatePolicy,
    dryRun,
  }
}
