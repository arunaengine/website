// Client-side interpretation of the server-computed GroupQuotaStatus
// (GET /access/groups/{id}/usage). The server owns the warn flag and the limits;
// this module only classifies "where usage sits relative to those limits"
// so the quota bar, dashboard cards and upload precheck all say the same
// thing. The QuotaGate enforces against the group's REALM-WIDE
// logical_bytes, so quotaCountedBytes() must be the only way callers pick
// the counter.
import type { GroupQuotaStatus, UsageResponse } from './api'

export type QuotaState =
  | 'no-policy' // usage response carried no quota block (old backend)
  | 'unlimited' // policy reports no byte quota for this group
  | 'ok'
  | 'warning' // server warn flag set (>= warn threshold)
  | 'over-quota' // >= quota, still below the hard cap (grace headroom in use)
  | 'over-ceiling' // >= quota x grace: the node rejects writes (QuotaExceeded)

export interface QuotaAssessment {
  state: QuotaState
  usedBytes: number
  quotaBytes: number | null
  ceilingBytes: number | null
  /** Bytes left before the soft quota (never negative); null when unlimited/no policy. */
  remainingToQuota: number | null
  /** Bytes left before the enforced hard cap (never negative); null when unlimited/no policy. */
  remainingToCeiling: number | null
}

/** The counter the backend QuotaGate enforces against (groups.rs get_group_usage). */
export function quotaCountedBytes(usage: UsageResponse): number {
  return usage.realm?.logical_bytes ?? usage.logical_bytes ?? 0
}

export function referencedBytes(usage: UsageResponse): number {
  return usage.realm?.referenced_bytes ?? usage.referenced_bytes
}

export function assessQuota(
  quota: GroupQuotaStatus | null | undefined,
  usedBytes: number,
): QuotaAssessment {
  if (!quota) {
    return {
      state: 'no-policy',
      usedBytes,
      quotaBytes: null,
      ceilingBytes: null,
      remainingToQuota: null,
      remainingToCeiling: null,
    }
  }
  const quotaBytes = quota.quota_bytes
  const ceilingBytes = quota.ceiling_bytes
  if (quotaBytes == null) {
    return {
      state: 'unlimited',
      usedBytes,
      quotaBytes: null,
      ceilingBytes: null,
      remainingToQuota: null,
      remainingToCeiling: null,
    }
  }
  const remainingToQuota = Math.max(0, quotaBytes - usedBytes)
  const remainingToCeiling = ceilingBytes == null ? null : Math.max(0, ceilingBytes - usedBytes)
  const state: QuotaState =
    ceilingBytes != null && usedBytes >= ceilingBytes
      ? 'over-ceiling'
      : usedBytes >= quotaBytes
        ? 'over-quota'
        : quota.warning
          ? 'warning'
          : 'ok'
  return { state, usedBytes, quotaBytes, ceilingBytes, remainingToQuota, remainingToCeiling }
}

// Single source of truth for the quota bar segment tones so callers and the
// bar never scatter hex literals.
export const QUOTA_BAR_COLORS = {
  counted: '#335DC6',
  referenced: '#24A9E6',
  warn: '#D97706',
  danger: '#DC2626',
} as const

// One badge vocabulary for every quota surface.
export const QUOTA_STATE_BADGES: Record<
  QuotaState,
  { label: string; variant: 'outline' | 'warn' | 'destructive' } | null
> = {
  'no-policy': null,
  unlimited: { label: 'unlimited', variant: 'outline' },
  ok: null,
  warning: { label: 'near quota', variant: 'warn' },
  'over-quota': { label: 'in grace', variant: 'warn' },
  'over-ceiling': { label: 'writes blocked', variant: 'destructive' },
}
