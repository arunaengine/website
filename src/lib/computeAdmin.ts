import { ApiError } from '@/lib/api'

export interface LocationLinkBody {
  from: string
  to: string
  bandwidth_bytes_per_sec: number
}

export interface ComputeQuotaBody {
  max_jobs?: number
  max_cpu_cores?: number
  max_ram_bytes?: number
  max_disk_bytes?: number
  max_job_cpu_cores?: number
  max_job_ram_bytes?: number
  max_job_disk_bytes?: number
  max_job_walltime_ms?: number
}

export interface GroupQuotaBody {
  group_id: string
  quota: ComputeQuotaBody
}

export interface ComputeConfigBody {
  links: LocationLinkBody[]
  pessimistic_bandwidth_bytes_per_sec: number
  availability_stale_after_ms: number
  witness_base_delay_ms: number
  default_group_quota: ComputeQuotaBody
  group_quotas: GroupQuotaBody[]
}

export interface ResourceTotalsBody {
  count: number
  cpu_cores: number
  ram_bytes: number
  disk_bytes: number
}

export interface NodeSnapshotBody {
  node_id: string
  membership_generation: number
  publisher_generation: number
  observed_at_ms: number
  compute_draining: boolean
  leaving: boolean
  reserved: ResourceTotalsBody
  demand_groups: number
  demand_truncated: boolean
}

export interface GroupDemandBody {
  group_id: string
  demand: ResourceTotalsBody
  truncated: boolean
  quota: ComputeQuotaBody
}

export interface DepartureBody {
  departed_at_ms: number
  membership_generation: number
  unresolved: string[]
  truncated: boolean
}

export interface ComputeSnapshotsResponse {
  approximate: boolean
  operator_draining: boolean
  nodes: NodeSnapshotBody[]
  group?: GroupDemandBody
  departure?: DepartureBody
}

export interface DrainRequest {
  draining: boolean
}

export interface DrainResponse {
  draining: boolean
  changed: boolean
}

export type NumericDraftValue = string | number

export interface ByteInputDraft {
  value: NumericDraftValue
  unit: string
}

export interface LocationLinkDraft {
  from: string
  to: string
  bandwidth: ByteInputDraft
}

export interface ComputeQuotaDraft {
  max_jobs: NumericDraftValue
  max_cpu_cores: NumericDraftValue
  max_ram_bytes: ByteInputDraft
  max_disk_bytes: ByteInputDraft
  max_job_cpu_cores: NumericDraftValue
  max_job_ram_bytes: ByteInputDraft
  max_job_disk_bytes: ByteInputDraft
  max_job_walltime_ms: NumericDraftValue
}

export interface GroupQuotaDraft {
  group_id: string
  quota: ComputeQuotaDraft
}

export interface ComputeConfigDraft {
  links: LocationLinkDraft[]
  pessimistic_bandwidth: ByteInputDraft
  availability_stale_after_ms: NumericDraftValue
  witness_base_delay_ms: NumericDraftValue
  default_group_quota: ComputeQuotaDraft
  group_quotas: GroupQuotaDraft[]
}

export interface ComputeQuotaDeniedBody {
  scope: 'job' | 'group' | string
  dimension: 'jobs' | 'cpu_cores' | 'ram_bytes' | 'disk_bytes' | 'walltime_ms' | string
  observed: number
  requested: number
  limit: number
}

export interface ComputeAdminBackendError {
  status?: number
  code?: string
  message?: string
  quota?: ComputeQuotaDeniedBody
}

export const BYTE_UNITS = [
  { value: 'TiB', label: 'TiB', factor: 1024 ** 4 },
  { value: 'GiB', label: 'GiB', factor: 1024 ** 3 },
  { value: 'MiB', label: 'MiB', factor: 1024 ** 2 },
  { value: 'KiB', label: 'KiB', factor: 1024 },
  { value: 'B', label: 'B', factor: 1 },
]

const U32_MAX = 4_294_967_295
const MAX_LOCATION_LINKS = 256
const MAX_GROUP_QUOTAS = 256
const MAX_LOCATION_BYTES = 64

function text(value: NumericDraftValue): string {
  return value == null ? '' : String(value).trim()
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

function unitFactor(unit: string): number {
  return BYTE_UNITS.find((candidate) => candidate.value === unit)?.factor ?? 1
}

export function byteInputValue(input: ByteInputDraft): number | undefined {
  const raw = text(input.value)
  if (!raw) return undefined
  const amount = Number(raw)
  if (!Number.isFinite(amount) || amount < 0) return undefined
  const bytes = Math.round(amount * unitFactor(input.unit))
  return Number.isSafeInteger(bytes) ? bytes : undefined
}

export function seedByteInput(bytes: number): ByteInputDraft {
  const unit = BYTE_UNITS.find((candidate) => bytes % candidate.factor === 0)
  if (!unit) return { value: String(bytes), unit: 'B' }
  return { value: String(bytes / unit.factor), unit: unit.value }
}

export function emptyQuotaDraft(): ComputeQuotaDraft {
  return {
    max_jobs: '',
    max_cpu_cores: '',
    max_ram_bytes: { value: '', unit: 'GiB' },
    max_disk_bytes: { value: '', unit: 'GiB' },
    max_job_cpu_cores: '',
    max_job_ram_bytes: { value: '', unit: 'GiB' },
    max_job_disk_bytes: { value: '', unit: 'GiB' },
    max_job_walltime_ms: '',
  }
}

export function quotaDraftFromBody(quota: ComputeQuotaBody): ComputeQuotaDraft {
  return {
    max_jobs: quota.max_jobs == null ? '' : String(quota.max_jobs),
    max_cpu_cores: quota.max_cpu_cores == null ? '' : String(quota.max_cpu_cores),
    max_ram_bytes:
      quota.max_ram_bytes == null ? { value: '', unit: 'GiB' } : seedByteInput(quota.max_ram_bytes),
    max_disk_bytes:
      quota.max_disk_bytes == null ? { value: '', unit: 'GiB' } : seedByteInput(quota.max_disk_bytes),
    max_job_cpu_cores: quota.max_job_cpu_cores == null ? '' : String(quota.max_job_cpu_cores),
    max_job_ram_bytes:
      quota.max_job_ram_bytes == null
        ? { value: '', unit: 'GiB' }
        : seedByteInput(quota.max_job_ram_bytes),
    max_job_disk_bytes:
      quota.max_job_disk_bytes == null
        ? { value: '', unit: 'GiB' }
        : seedByteInput(quota.max_job_disk_bytes),
    max_job_walltime_ms:
      quota.max_job_walltime_ms == null ? '' : String(quota.max_job_walltime_ms),
  }
}

function optionalInteger(value: NumericDraftValue, maximum = Number.MAX_SAFE_INTEGER): number | undefined {
  const raw = text(value)
  if (!raw) return undefined
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximum) {
    throw new Error('Expected a non-negative whole number.')
  }
  return parsed
}

function optionalBytes(value: ByteInputDraft): number | undefined {
  if (!text(value.value)) return undefined
  const parsed = byteInputValue(value)
  if (parsed == null) throw new Error('Expected a non-negative byte amount.')
  return parsed
}

export function serializeQuotaDraft(draft: ComputeQuotaDraft): ComputeQuotaBody {
  const body: ComputeQuotaBody = {}
  const maxJobs = optionalInteger(draft.max_jobs, U32_MAX)
  const maxCpuCores = optionalInteger(draft.max_cpu_cores)
  const maxRamBytes = optionalBytes(draft.max_ram_bytes)
  const maxDiskBytes = optionalBytes(draft.max_disk_bytes)
  const maxJobCpuCores = optionalInteger(draft.max_job_cpu_cores, U32_MAX)
  const maxJobRamBytes = optionalBytes(draft.max_job_ram_bytes)
  const maxJobDiskBytes = optionalBytes(draft.max_job_disk_bytes)
  const maxJobWalltimeMs = optionalInteger(draft.max_job_walltime_ms)

  if (maxJobs != null) body.max_jobs = maxJobs
  if (maxCpuCores != null) body.max_cpu_cores = maxCpuCores
  if (maxRamBytes != null) body.max_ram_bytes = maxRamBytes
  if (maxDiskBytes != null) body.max_disk_bytes = maxDiskBytes
  if (maxJobCpuCores != null) body.max_job_cpu_cores = maxJobCpuCores
  if (maxJobRamBytes != null) body.max_job_ram_bytes = maxJobRamBytes
  if (maxJobDiskBytes != null) body.max_job_disk_bytes = maxJobDiskBytes
  if (maxJobWalltimeMs != null) body.max_job_walltime_ms = maxJobWalltimeMs
  return body
}

export function computeConfigDraftFromBody(config: ComputeConfigBody): ComputeConfigDraft {
  return {
    links: config.links.map((link) => ({
      from: link.from,
      to: link.to,
      bandwidth: seedByteInput(link.bandwidth_bytes_per_sec),
    })),
    pessimistic_bandwidth: seedByteInput(config.pessimistic_bandwidth_bytes_per_sec),
    availability_stale_after_ms: String(config.availability_stale_after_ms),
    witness_base_delay_ms: String(config.witness_base_delay_ms),
    default_group_quota: quotaDraftFromBody(config.default_group_quota),
    group_quotas: config.group_quotas.map((entry) => ({
      group_id: entry.group_id,
      quota: quotaDraftFromBody(entry.quota),
    })),
  }
}

function quotaProblems(quota: ComputeQuotaDraft, label: string): string[] {
  const problems: string[] = []
  const integers: Array<[NumericDraftValue, string, number]> = [
    [quota.max_jobs, 'max jobs', U32_MAX],
    [quota.max_cpu_cores, 'max CPU cores', Number.MAX_SAFE_INTEGER],
    [quota.max_job_cpu_cores, 'max job CPU cores', U32_MAX],
    [quota.max_job_walltime_ms, 'max job walltime', Number.MAX_SAFE_INTEGER],
  ]
  for (const [value, field, maximum] of integers) {
    if (!text(value)) continue
    const parsed = Number(text(value))
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximum) {
      problems.push(`${label} ${field} must be a non-negative whole number.`)
    }
  }
  const bytes: Array<[ByteInputDraft, string]> = [
    [quota.max_ram_bytes, 'max RAM'],
    [quota.max_disk_bytes, 'max disk'],
    [quota.max_job_ram_bytes, 'max job RAM'],
    [quota.max_job_disk_bytes, 'max job disk'],
  ]
  for (const [value, field] of bytes) {
    if (text(value.value) && byteInputValue(value) == null) {
      problems.push(`${label} ${field} must be a non-negative byte amount.`)
    }
  }
  return problems
}

export function validateDirectedLinks(links: LocationLinkDraft[]): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  if (links.length > MAX_LOCATION_LINKS) {
    problems.push(`A realm can configure at most ${MAX_LOCATION_LINKS} directed links.`)
  }
  links.forEach((link, index) => {
    const from = link.from.trim()
    const to = link.to.trim()
    if (!from || !to || byteLength(from) > MAX_LOCATION_BYTES || byteLength(to) > MAX_LOCATION_BYTES) {
      problems.push(`Link ${index + 1} needs locations between 1 and ${MAX_LOCATION_BYTES} bytes.`)
    }
    const bandwidth = byteInputValue(link.bandwidth)
    if (bandwidth == null || bandwidth === 0) {
      problems.push(`Link ${index + 1} bandwidth must be greater than zero.`)
    }
    const pair = `${from}\u0000${to}`
    if (from && to && seen.has(pair)) problems.push(`The directed link ${from} to ${to} appears twice.`)
    seen.add(pair)
  })
  return problems
}

export function validateComputeConfigDraft(draft: ComputeConfigDraft): string[] {
  const problems = validateDirectedLinks(draft.links)
  const pessimistic = byteInputValue(draft.pessimistic_bandwidth)
  if (pessimistic == null || pessimistic === 0) {
    problems.push('Pessimistic default bandwidth must be greater than zero.')
  }
  const staleAfter = Number(text(draft.availability_stale_after_ms))
  if (!Number.isSafeInteger(staleAfter) || staleAfter < 0) {
    problems.push('Availability stale after must be a non-negative whole number of milliseconds.')
  }
  const witnessDelay = Number(text(draft.witness_base_delay_ms))
  if (!Number.isSafeInteger(witnessDelay) || witnessDelay <= 0) {
    problems.push('Witness base delay must be greater than zero milliseconds.')
  }
  problems.push(...quotaProblems(draft.default_group_quota, 'Realm default'))
  if (draft.group_quotas.length > MAX_GROUP_QUOTAS) {
    problems.push(`A realm can configure at most ${MAX_GROUP_QUOTAS} group quota overrides.`)
  }
  const groups = new Set<string>()
  draft.group_quotas.forEach((entry, index) => {
    const groupId = entry.group_id.trim()
    if (!groupId) problems.push(`Group override ${index + 1} needs a group.`)
    if (groupId && groups.has(groupId)) problems.push(`Group ${groupId} has two quota overrides.`)
    groups.add(groupId)
    problems.push(...quotaProblems(entry.quota, `Group override ${index + 1}`))
  })
  return problems
}

export function computeConfigBodyFromDraft(draft: ComputeConfigDraft): ComputeConfigBody {
  const problems = validateComputeConfigDraft(draft)
  if (problems.length) throw new Error(problems[0])
  return {
    links: draft.links.map((link) => ({
      from: link.from.trim(),
      to: link.to.trim(),
      bandwidth_bytes_per_sec: byteInputValue(link.bandwidth) as number,
    })),
    pessimistic_bandwidth_bytes_per_sec: byteInputValue(draft.pessimistic_bandwidth) as number,
    availability_stale_after_ms: Number(text(draft.availability_stale_after_ms)),
    witness_base_delay_ms: Number(text(draft.witness_base_delay_ms)),
    default_group_quota: serializeQuotaDraft(draft.default_group_quota),
    group_quotas: draft.group_quotas.map((entry) => ({
      group_id: entry.group_id.trim(),
      quota: serializeQuotaDraft(entry.quota),
    })),
  }
}

export function isComputeAdminUnsupported(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 405)
}

export function quotaDimensionLabel(dimension: string): string {
  switch (dimension) {
    case 'jobs': return 'jobs'
    case 'cpu_cores': return 'CPU cores'
    case 'ram_bytes': return 'RAM'
    case 'disk_bytes': return 'disk'
    case 'walltime_ms': return 'walltime'
    case 'job_cpu_cores':
    case 'max_job_cpu_cores': return 'per-job CPU cores'
    case 'job_ram_bytes':
    case 'max_job_ram_bytes': return 'per-job RAM'
    case 'job_disk_bytes':
    case 'max_job_disk_bytes': return 'per-job disk'
    case 'job_walltime_ms':
    case 'max_job_walltime_ms': return 'per-job walltime'
    default: return dimension.replaceAll('_', ' ')
  }
}

export function computeAdminErrorMessage(error: unknown): string {
  const typed = (error instanceof ApiError ? error.details : error) as ComputeAdminBackendError | undefined
  if (typed?.quota) {
    const quota = typed.quota
    return `Compute quota denied for ${quota.scope} ${quotaDimensionLabel(quota.dimension)}: observed ${quota.observed}, requested ${quota.requested}, limit ${quota.limit}.`
  }
  if (error instanceof ApiError && error.status === 409) {
    return 'The compute configuration changed concurrently. Reload it before saving again.'
  }
  return error instanceof Error ? error.message : String(error)
}
