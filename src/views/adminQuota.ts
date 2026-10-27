// The quota policy form of the realm administration view, as a draft of the
// stored policy and back. Settings the form does not edit are carried through.
import type { RealmQuotaConfig } from '@/lib/api'

// Mirrors aruna's `impl Default for QuotaConfig`: the effective policy when a
// backend serves no quota block. null = unlimited.
export const DEFAULT_QUOTA: RealmQuotaConfig = {
  default_group_quota_bytes: null,
  grace_factor_percent: 110,
  warn_threshold_percent: 85,
  group_overrides: [],
  max_groups_per_user: 3,
  user_group_cap_overrides: [],
  max_devices_per_user: null,
  count_replicas: false,
}

export const UNITS = [
  { value: 'TiB', factor: 1024 ** 4 },
  { value: 'GiB', factor: 1024 ** 3 },
  { value: 'MiB', factor: 1024 ** 2 },
  { value: 'KiB', factor: 1024 },
  { value: 'B', factor: 1 },
]

// type="number" inputs emit numbers; normalize before any string handling.
export function text(v: unknown): string {
  return v == null ? '' : String(v)
}

export interface QuotaField {
  unlimited: boolean
  value: string | number
  unit: string
}
export interface OverrideRow {
  group_id: string
  quota: QuotaField
  grace: string | number
  count_replicas: boolean | null
}
export interface UserCapRow {
  user_id: string
  name: string
  max_groups: string | number
}
export interface Draft {
  defaultQuota: QuotaField
  grace: string | number
  warn: string | number
  maxGroups: string | number
  maxDevices: string | number
  overrides: OverrideRow[]
  userCaps: UserCapRow[]
  countReplicas: boolean
}

// B always divides cleanly, so the seed is exact and round-trips byte-identical.
function bytesToAmount(bytes: number): { value: string; unit: string } {
  const unit = UNITS.find((u) => bytes % u.factor === 0) ?? { value: 'B', factor: 1 }
  return { value: String(bytes / unit.factor), unit: unit.value }
}
export function amountToBytes(value: string | number, unit: string): number | null {
  const s = text(value).trim()
  const n = Number(s)
  if (s === '' || !Number.isFinite(n) || n < 0) return null
  const factor = UNITS.find((u) => u.value === unit)?.factor ?? 1024 ** 3
  const bytes = Math.round(n * factor)
  return Number.isSafeInteger(bytes) ? bytes : null
}
export function fieldBytes(f: QuotaField): number | null {
  return f.unlimited ? null : amountToBytes(f.value, f.unit)
}
function seedField(bytes: number | null): QuotaField {
  if (bytes == null) return { unlimited: true, value: '', unit: 'GiB' }
  const { value, unit } = bytesToAmount(bytes)
  return { unlimited: false, value, unit }
}

export function seedDraft(quota: RealmQuotaConfig | undefined, names: Map<string, string> = new Map()): Draft {
  const q = quota ?? DEFAULT_QUOTA
  return {
    defaultQuota: seedField(q.default_group_quota_bytes),
    grace: String(q.grace_factor_percent),
    warn: String(q.warn_threshold_percent),
    maxGroups: q.max_groups_per_user == null ? '' : String(q.max_groups_per_user),
    maxDevices: q.max_devices_per_user == null ? '' : String(q.max_devices_per_user),
    overrides: q.group_overrides.map((o) => ({
      group_id: o.group_id,
      quota: seedField(o.quota_bytes),
      grace: o.grace_factor_percent == null ? '' : String(o.grace_factor_percent),
      count_replicas: o.count_replicas ?? null,
    })),
    userCaps: q.user_group_cap_overrides.map((u) => ({
      user_id: u.user_id,
      name: names.get(u.user_id) ?? '',
      max_groups: u.max_groups == null ? '' : String(u.max_groups),
    })),
    countReplicas: q.count_replicas ?? false,
  }
}

export function buildConfig(draft: Draft): RealmQuotaConfig {
  return {
    default_group_quota_bytes: fieldBytes(draft.defaultQuota),
    grace_factor_percent: Number(draft.grace),
    warn_threshold_percent: Number(draft.warn),
    group_overrides: draft.overrides.map((o) => ({
      group_id: o.group_id,
      quota_bytes: fieldBytes(o.quota),
      grace_factor_percent: o.quota.unlimited || text(o.grace).trim() === '' ? null : Number(o.grace),
      count_replicas: o.count_replicas,
    })),
    max_groups_per_user: text(draft.maxGroups).trim() === '' ? null : Number(draft.maxGroups),
    user_group_cap_overrides: draft.userCaps.map((u) => ({
      user_id: u.user_id,
      max_groups: text(u.max_groups).trim() === '' ? null : Number(u.max_groups),
    })),
    max_devices_per_user: text(draft.maxDevices).trim() === '' ? null : Number(draft.maxDevices),
    count_replicas: draft.countReplicas,
  }
}
