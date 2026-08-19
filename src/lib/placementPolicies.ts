import { ApiError } from '@/lib/api'

export interface PolicyRefBody {
  policy_id: string
  digest: string
}

export interface LabelMatchBody {
  key: string
  value: string
}

export interface SelectorBody {
  node_id?: string
  location?: string
  labels: LabelMatchBody[]
  executor_kind?: string
}

export interface CreatePolicyRequest {
  policy_id?: string
  name: string
  allowed: SelectorBody[]
}

export interface PolicyResponse {
  policy_id: string
  digest: string
  name: string
  allowed: SelectorBody[]
  publisher: string
  created_by: string
  created_at_ms: number
}

export interface BucketPlacementRequest {
  policies: PolicyRefBody[]
  expected_generation?: number
}

export interface BucketPlacementResponse {
  bucket: string
  policies: PolicyRefBody[]
  generation: number
}

export interface ObjectPlacementRequest {
  key: string
  mutation_id: string
  expected_version_id: string
  expected_generation: number
  policies: PolicyRefBody[]
}

export interface ObjectPlacementResponse {
  outcome: 'minted' | 'replayed' | 'blocked' | string
  version_id?: string
  materialized?: boolean
  blocked_reason?: string
  policies: PolicyRefBody[]
}

export interface BulkRunRequest {
  operation_id: string
  limit?: number
  cursor?: string
}

export interface BlockedGapBody {
  key: string
  reason: string
}

export type BulkRunStatus = 'active' | 'completed' | 'superseded'

export interface BulkRunResponse {
  operation_id: string
  status: BulkRunStatus
  generation: number
  target_policies: PolicyRefBody[]
  observed: number
  covered: number
  minted: number
  replanned: number
  blocked: BlockedGapBody[]
  cursor?: string
  complete: boolean
}

export type CoverageScope = 'current' | 'historical'

export interface CoverageQuery {
  scope?: CoverageScope
  cursor?: string
  limit?: number
}

export interface CoverageGapBody {
  key: string
  version_id: string
  attachment: 'missing' | 'partial' | string
  copy?: 'registered' | 'quarantined' | 'absent' | 'reference_only' | string
}

export interface CoverageResponse {
  bucket: string
  scope: CoverageScope | string
  generation: number
  target_policies: PolicyRefBody[]
  observed: number
  deleted: number
  gaps: CoverageGapBody[]
  registered: number
  quarantined: number
  absent: number
  reference_only: number
  cursor?: string
  complete: boolean
  limits: string[]
}

export interface DiagnosticsQuery {
  cursor?: string
  limit?: number
}

export interface CopyViolationBody {
  bucket: string
  key: string
  version_id: string
  state: string
  policies: PolicyRefBody[]
}

export interface DiagnosticsResponse {
  subject_generation?: number
  subject_location?: string
  policy_draining: boolean
  serving_blocked: boolean
  observed: number
  registered: number
  quarantined: number
  unresolved_departed: number
  violations: CopyViolationBody[]
  cache_entries: number
  cache_verified: number
  cache_unavailable: number
  cache_bytes: number
  cache_truncated: boolean
  cursor?: string
  complete: boolean
}

export interface QuarantineResolveRequest {
  action: 'revalidate' | 'release'
  bucket?: string
  key?: string
  version_id?: string
}

export interface QuarantineResolveResponse {
  released: boolean
  scanned: number
  restored: number
  quarantined: number
  cleared: boolean
}

export interface BulkRunProgress {
  operation_id: string
  status: BulkRunStatus
  generation: number
  target_policies: PolicyRefBody[]
  observed: number
  covered: number
  minted: number
  replanned: number
  blocked: BlockedGapBody[]
  complete: boolean
  message?: string
}

export interface PlacementQuotaDeniedBody {
  scope: string
  dimension: string
  observed: number
  requested: number
  limit: number
}

export interface PlacementPoliciesBackendError {
  status?: number
  code?: string
  message?: string
  quota?: PlacementQuotaDeniedBody
}

export type PlacementErrorContext =
  | 'create'
  | 'bucket-cas'
  | 'bulk'
  | 'lookup'
  | 'quarantine'
  | 'generic'

export type BulkRunPoster = (request: BulkRunRequest) => Promise<BulkRunResponse>
export type BulkRunProgressHandler = (progress: BulkRunProgress) => void

const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const MAX_POLICY_NAME_BYTES = 128
const MAX_POLICY_SELECTORS = 32
const MAX_SELECTOR_LABELS = 16
const MAX_LOCATION_BYTES = 64
const MAX_LABEL_KEY_BYTES = 128
const MAX_LABEL_VALUE_BYTES = 256
const MAX_EXECUTOR_KIND_BYTES = 32

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

export function policyRefKey(policy: PolicyRefBody): string {
  return `${policy.policy_id}:${policy.digest}`
}

export function emptySelector(): SelectorBody {
  return { labels: [] }
}

export function selectorIsEmpty(selector: SelectorBody): boolean {
  return !selector.node_id?.trim()
    && !selector.location?.trim()
    && !selector.executor_kind?.trim()
    && selector.labels.length === 0
}

function normalizedSelector(selector: SelectorBody): SelectorBody {
  const normalized: SelectorBody = {
    labels: selector.labels.map((label) => ({
      key: label.key.trim(),
      value: label.value.trim(),
    })),
  }
  if (selector.node_id?.trim()) normalized.node_id = selector.node_id.trim()
  if (selector.location?.trim()) normalized.location = selector.location.trim()
  if (selector.executor_kind?.trim()) normalized.executor_kind = selector.executor_kind.trim()
  return normalized
}

export function policyCreationProblems(request: CreatePolicyRequest): string[] {
  const problems: string[] = []
  const name = request.name.trim()
  if (!name || byteLength(name) > MAX_POLICY_NAME_BYTES) {
    problems.push(`Name must be between 1 and ${MAX_POLICY_NAME_BYTES} bytes.`)
  }
  if (!request.allowed.length || request.allowed.length > MAX_POLICY_SELECTORS) {
    problems.push(`A residency policy needs between 1 and ${MAX_POLICY_SELECTORS} selectors.`)
  }
  request.allowed.forEach((selector, index) => {
    if (selectorIsEmpty(selector)) problems.push(`Selector ${index + 1} must constrain at least one field.`)
    if (selector.location && byteLength(selector.location.trim()) > MAX_LOCATION_BYTES) {
      problems.push(`Selector ${index + 1} location is longer than ${MAX_LOCATION_BYTES} bytes.`)
    }
    if (selector.executor_kind && byteLength(selector.executor_kind.trim()) > MAX_EXECUTOR_KIND_BYTES) {
      problems.push(`Selector ${index + 1} executor kind is longer than ${MAX_EXECUTOR_KIND_BYTES} bytes.`)
    }
    if (selector.labels.length > MAX_SELECTOR_LABELS) {
      problems.push(`Selector ${index + 1} has more than ${MAX_SELECTOR_LABELS} labels.`)
    }
    selector.labels.forEach((label, labelIndex) => {
      const key = label.key.trim()
      if (!key || byteLength(key) > MAX_LABEL_KEY_BYTES || byteLength(label.value.trim()) > MAX_LABEL_VALUE_BYTES) {
        problems.push(`Selector ${index + 1} label ${labelIndex + 1} has an invalid key or value.`)
      }
    })
  })
  return problems
}

export function normalizeCreatePolicyRequest(request: CreatePolicyRequest): CreatePolicyRequest {
  const normalized: CreatePolicyRequest = {
    name: request.name.trim(),
    allowed: request.allowed.map(normalizedSelector),
  }
  if (request.policy_id?.trim()) normalized.policy_id = request.policy_id.trim()
  return normalized
}

export function policyRefProblems(policies: PolicyRefBody[]): string[] {
  const problems: string[] = []
  const refs = new Set<string>()
  const ids = new Map<string, string>()
  policies.forEach((policy, index) => {
    const id = policy.policy_id.trim()
    const digest = policy.digest.trim()
    if (!id) problems.push(`Residency policy reference ${index + 1} needs an id.`)
    if (!/^[0-9a-f]{64}$/.test(digest)) {
      problems.push(`Residency policy reference ${index + 1} needs a 64-character lowercase hex digest.`)
    }
    const ref = `${id}:${digest}`
    if (refs.has(ref)) problems.push(`Residency policy reference ${index + 1} is duplicated.`)
    refs.add(ref)
    const prior = ids.get(id)
    if (id && prior && prior !== digest) {
      problems.push(`Residency policy id ${id} is paired with two different digests.`)
    }
    if (id) ids.set(id, digest)
  })
  return problems
}

export function createOperationId(now = Date.now()): string {
  let timestamp = Math.max(0, Math.min(Math.floor(now), 281_474_976_710_655))
  let timePart = ''
  for (let index = 0; index < 10; index += 1) {
    timePart = ULID_ALPHABET[timestamp % 32] + timePart
    timestamp = Math.floor(timestamp / 32)
  }
  const random = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(random)
  else for (let index = 0; index < random.length; index += 1) random[index] = Math.floor(Math.random() * 256)
  return timePart + Array.from(random, (value) => ULID_ALPHABET[value & 31]).join('')
}

function mergeBulkProgress(previous: BulkRunProgress | null, response: BulkRunResponse): BulkRunProgress {
  const blocked = new Map<string, BlockedGapBody>()
  for (const gap of previous?.blocked ?? []) blocked.set(`${gap.key}\u0000${gap.reason}`, gap)
  for (const gap of response.blocked) blocked.set(`${gap.key}\u0000${gap.reason}`, gap)
  const superseded = response.status === 'superseded'
  return {
    operation_id: response.operation_id,
    status: response.status,
    generation: response.generation,
    target_policies: response.target_policies,
    observed: (previous?.observed ?? 0) + response.observed,
    covered: (previous?.covered ?? 0) + response.covered,
    minted: (previous?.minted ?? 0) + response.minted,
    replanned: (previous?.replanned ?? 0) + response.replanned,
    blocked: [...blocked.values()],
    complete: response.complete || response.status === 'completed',
    message: superseded
      ? 'Run stopped because the bucket default changed underneath it. Start a new run to apply the new default.'
      : undefined,
  }
}

export async function runBulkToCompletion(
  post: BulkRunPoster,
  onProgress: BulkRunProgressHandler = () => undefined,
  operationId = createOperationId(),
  limit = 64,
): Promise<BulkRunProgress> {
  let cursor: string | undefined
  let progress: BulkRunProgress | null = null
  const cursors = new Set<string>()
  for (;;) {
    const response = await post({ operation_id: operationId, limit, cursor })
    progress = mergeBulkProgress(progress, response)
    onProgress(progress)
    if (response.status === 'superseded' || progress.complete) return progress
    if (!response.cursor) throw new Error('The active residency run returned no continuation cursor.')
    if (cursors.has(response.cursor)) throw new Error('The residency run repeated its continuation cursor.')
    cursors.add(response.cursor)
    cursor = response.cursor
  }
}

export function coverageLimitLabel(limit: string): string {
  const normalized = limit.replaceAll('-', '_')
  if (normalized === 'responder_local') return 'Responder-local view only'
  if (normalized === 'bounded_page') return 'Bounded page'
  if (normalized === 'historical_excluded') return 'Historical versions excluded'
  if (normalized === 'concurrent_writes') return 'Concurrent writes may not be reflected'
  return limit.replaceAll('_', ' ')
}

export function placementPoliciesErrorMessage(
  error: unknown,
  context: PlacementErrorContext = 'generic',
): string {
  const typed = error as PlacementPoliciesBackendError
  if (typed?.quota) {
    const quota = typed.quota
    return `Compute quota denied for ${quota.scope} ${quota.dimension}: observed ${quota.observed}, requested ${quota.requested}, limit ${quota.limit}.`
  }
  if (error instanceof ApiError && error.status === 409) {
    const message = error.message.toLowerCase()
    if (context === 'create' && message.includes('policy id') && message.includes('definition')) {
      return 'This policy id already identifies a different immutable definition. Publishing a changed definition requires a new policy id.'
    }
    if (context === 'bucket-cas') {
      return 'Bucket residency policies changed by someone else. Reload the bucket defaults before saving again.'
    }
    if (context === 'bulk') {
      return 'The bucket record changed while this residency run was being resumed. Start a new run.'
    }
  }
  return error instanceof Error ? error.message : String(error)
}
