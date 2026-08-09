// Deny-only CEL request policies, verified against aruna
// api/src/routes/policies.rs and core/src/request_policy.rs.
//
// Two shapes that look alike are deliberately kept apart: a stored policy's
// `kind` is lowercase on the wire ("deny"/"require"), while the dry-run trace
// reports PascalCase `kind` and `result`. Never compare the two directly.

/** Maximum policies one scope may hold (MAX_POLICIES_PER_SCOPE). */
export const MAX_POLICIES_PER_SCOPE = 64
/** Maximum bytes in one expression or guard (MAX_POLICY_EXPRESSION_BYTES). */
export const MAX_POLICY_EXPRESSION_BYTES = 4 * 1024

export type PolicyKind = 'deny' | 'require'

export interface PolicyKindInfo {
  kind: PolicyKind
  label: string
  description: string
}

export const POLICY_KINDS: PolicyKindInfo[] = [
  {
    kind: 'deny',
    label: 'Deny when true',
    description: 'Rejects the request whenever the expression evaluates to true.',
  },
  {
    kind: 'require',
    label: 'Require to allow',
    description: 'Rejects the request unless the expression evaluates to true.',
  },
]

/** Request variables an expression may reference (KNOWN_POLICY_VARIABLES). */
export const POLICY_VARIABLES = [
  { name: 'path', description: 'Canonical permission path the request targets.' },
  { name: 'permission', description: '"read" or "write".' },
  { name: 'user', description: 'Caller identity; empty for anonymous callers.' },
  { name: 'anonymous', description: 'True when the caller presented no identity.' },
  { name: 'operation', description: 'Interface the request arrived on, e.g. "rest" or "s3".' },
  { name: 'params', description: 'Query/path parameters as a string map.' },
  { name: 'headers', description: 'Request headers as a string map.' },
  { name: 'body', description: 'Parsed request body; absent on reads. Guard with has().' },
]

export interface Policy {
  /** Absent on a draft; the backend mints one on write. */
  policy_id?: string | null
  name: string
  kind: PolicyKind | string
  /** Optional CEL applicability guard. */
  when?: string | null
  expression: string
  enabled: boolean
}

export interface PoliciesResponse {
  policies: Policy[]
  /** Content address of the stored set, for optimistic concurrency. */
  set_hash: string
}

export interface SetPoliciesRequest {
  policies: Policy[]
  /** When set, the write only applies if it matches the stored set_hash. */
  expected_hash?: string
}

/** An effective-view policy, tagged with the scope it came from. */
export type ScopedPolicy = Policy & { scope: string }

export interface EffectivePoliciesResponse {
  policies: ScopedPolicy[]
}

export interface ValidatePolicyRequest {
  kind: PolicyKind | string
  when?: string | null
  expression: string
}

export interface ValidatePolicyResponse {
  valid: boolean
  errors: string[]
  referenced_variables: string[]
  unknown_variables: string[]
  unknown_functions: string[]
}

export type DryRunScope = 'realm' | 'group' | 'effective'

export interface DryRunRequest {
  path: string
  permission: string
  user?: string
  operation?: string
  params?: Record<string, string>
  headers?: Record<string, string>
  body?: unknown
  /** Ad hoc policies to try instead of a stored scope. */
  candidate_policies?: Policy[]
  scope?: DryRunScope
  group_id?: string
}

/** PascalCase on the wire, unlike a stored policy's lowercase `kind`. */
export type TraceResult = 'Passed' | 'Denied' | 'SkippedDisabled' | 'Error'

export interface TraceEntry {
  scope: string
  policy_id: string
  name: string
  kind: 'Deny' | 'Require'
  applicable: boolean
  result: TraceResult
  detail?: string
}

export interface DryRunResponse {
  denied: boolean
  matched_scope?: string
  policy_name?: string
  reason?: string
  trace: TraceEntry[]
}

export function emptyPolicy(): Policy {
  return { name: '', kind: 'deny', when: '', expression: '', enabled: true }
}

/** Byte length as the backend measures an expression against its cap. */
export function expressionBytes(source: string): number {
  return new TextEncoder().encode(source).length
}

export interface PolicyProblem {
  field: 'name' | 'expression' | 'when'
  message: string
}

/**
 * Local checks that mirror the backend's rejections, so an obviously invalid
 * draft never costs a round trip. The backend remains the authority.
 */
export function policyProblems(policy: Policy): PolicyProblem[] {
  const problems: PolicyProblem[] = []
  if (!policy.name.trim()) {
    problems.push({ field: 'name', message: 'A policy needs a name; denials quote it.' })
  }
  if (!policy.expression.trim()) {
    problems.push({ field: 'expression', message: 'An expression is required.' })
  } else if (expressionBytes(policy.expression) > MAX_POLICY_EXPRESSION_BYTES) {
    problems.push({
      field: 'expression',
      message: `Expression exceeds ${MAX_POLICY_EXPRESSION_BYTES} bytes.`,
    })
  }
  if (policy.when && expressionBytes(policy.when) > MAX_POLICY_EXPRESSION_BYTES) {
    problems.push({ field: 'when', message: `Guard exceeds ${MAX_POLICY_EXPRESSION_BYTES} bytes.` })
  }
  return problems
}

/** Strips draft-only emptiness the backend would rather not store. */
export function toWirePolicy(policy: Policy): Policy {
  const guard = policy.when?.trim()
  return {
    ...(policy.policy_id ? { policy_id: policy.policy_id } : {}),
    name: policy.name.trim(),
    kind: policy.kind,
    when: guard ? guard : null,
    expression: policy.expression,
    enabled: policy.enabled,
  }
}

const TRACE_LABELS: Record<TraceResult, string> = {
  Passed: 'passed',
  Denied: 'denied',
  SkippedDisabled: 'skipped (disabled)',
  Error: 'error (denies)',
}

export function traceLabel(result: TraceResult): string {
  return TRACE_LABELS[result] ?? result
}

/** Scope labels arrive as "realm" or "group(<ulid>)"; shorten for display. */
export function scopeLabel(scope: string): string {
  const group = /^group\((.+)\)$/.exec(scope)
  if (!group) return scope
  const id = group[1]
  return `group ${id.length > 8 ? `${id.slice(0, 8)}…` : id}`
}
