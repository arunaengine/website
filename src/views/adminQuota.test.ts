import { describe, expect, it } from 'vitest'
import { buildConfig, seedDraft } from './adminQuota'
import type { RealmQuotaConfig } from '@/lib/api'

describe('realm quota draft', () => {
  it('keeps the replica settings through an unrelated edit', () => {
    const stored: RealmQuotaConfig = {
      default_group_quota_bytes: 1024 ** 3,
      grace_factor_percent: 110,
      warn_threshold_percent: 85,
      group_overrides: [
        { group_id: 'counted', quota_bytes: null, grace_factor_percent: null, count_replicas: false },
        { group_id: 'inherits', quota_bytes: 1024, grace_factor_percent: 120, count_replicas: null },
      ],
      max_groups_per_user: 3,
      user_group_cap_overrides: [],
      max_devices_per_user: null,
      count_replicas: true,
    }
    const draft = seedDraft(stored)
    draft.warn = '90'

    const saved = buildConfig(draft)

    expect(saved).toEqual({ ...stored, warn_threshold_percent: 90 })
  })

  it('does not count replicas without a stored policy', () => {
    expect(buildConfig(seedDraft(undefined)).count_replicas).toBe(false)
  })
})
