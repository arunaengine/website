import { describe, expect, it } from 'vitest'
import {
  backendQuota,
  backendSummary,
  copyState,
  scanLimitText,
  targetLabel,
  tenantClasses,
} from './storage'
import type { BackendStatus, GroupBackendResponse } from './api'

function backend(kind: string, config: Record<string, string>): GroupBackendResponse {
  return {
    backend_id: '01J000000000000000000BACK',
    group_id: '01J0000000000000000000GRP',
    kind,
    name: 'tenant-store',
    public_config: config,
  }
}

function status(overrides: Partial<BackendStatus> = {}): BackendStatus {
  return {
    name: 'hot',
    backend: 's3',
    class: 'hot',
    allow_tenants: true,
    default: false,
    status: 'available',
    ...overrides,
  }
}

describe('backendSummary', () => {
  it('names the store per kind', () => {
    expect(backendSummary(backend('s3', { endpoint: 'https://s3.example.org', bucket: 'data' }))).toBe(
      'https://s3.example.org · data',
    )
    expect(backendSummary(backend('b2', { bucket: 'data', bucket_id: 'abc123' }))).toBe('data · abc123')
  })

  it('appends the root prefix', () => {
    expect(backendSummary(backend('s3', { endpoint: 'https://s3.example.org', bucket: 'data', root: 'aruna/' }))).toBe(
      'https://s3.example.org · data · aruna/',
    )
  })

  it('falls back for an unknown kind', () => {
    // A node may serve a kind this portal does not model; never render blank.
    expect(backendSummary(backend('future', { endpoint: 'https://x.example.org' }))).toBe(
      'https://x.example.org',
    )
  })
})

describe('tenantClasses', () => {
  it('keeps only labelled tenant-routable classes', () => {
    expect(
      tenantClasses([
        status({ class: 'hot' }),
        status({ name: 'archive', class: 'archive', allow_tenants: false }),
        status({ name: 'plain', class: null }),
        status({ name: 'hot-2', class: 'hot' }),
      ]),
    ).toEqual(['hot'])
  })

  it('handles a node without backends', () => {
    expect(tenantClasses(undefined)).toEqual([])
  })
})

describe('targetLabel', () => {
  const backends = [backend('s3', {})]

  it('resolves a backend id to its name', () => {
    expect(targetLabel({ backend_id: backends[0].backend_id }, backends)).toBe('tenant-store')
  })

  it('shows the raw id of an unknown backend', () => {
    expect(targetLabel({ backend_id: 'gone' }, backends)).toBe('gone')
  })

  it('marks classes and the empty default', () => {
    expect(targetLabel({ class: 'hot' }, backends)).toBe('Class hot')
    expect(targetLabel(null, backends)).toBe('Node default')
  })
})

describe('backendQuota', () => {
  it('treats a served usage as the enforcement signal', () => {
    expect(backendQuota(status({ quota_bytes: 100, used_bytes: 40 }))).toEqual({
      quotaBytes: 100,
      usedBytes: 40,
      enforced: true,
    })
  })

  it('reports a declared quota as unenforced', () => {
    // No used_bytes: the node cannot reject a write against this allowance.
    expect(backendQuota(status({ quota_bytes: 100 }))).toEqual({
      quotaBytes: 100,
      usedBytes: null,
      enforced: false,
    })
  })

  it('counts a zero usage as enforced', () => {
    expect(backendQuota(status({ quota_bytes: 100, used_bytes: 0 })).enforced).toBe(true)
  })
})

describe('wording fallbacks', () => {
  it('explains known and unknown scan limits', () => {
    expect(scanLimitText('holder-path-unknown')).toContain('could not be asked')
    expect(scanLimitText('future-limit')).toBe('The search was limited: future-limit.')
  })

  it('labels known and unknown copy states', () => {
    expect(copyState('not-stored').label).toBe('not stored')
    expect(copyState('future')).toEqual({ label: 'future', description: '' })
  })
})
