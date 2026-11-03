import { describe, expect, it } from 'vitest'
import {
  BACKEND_KIND_SCHEMAS,
  backendQuota,
  backendSummary,
  copyHeldBack,
  copyOrigin,
  copyState,
  folderProblem,
  shortError,
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
  it('labels known and unknown copy states', () => {
    expect(copyState('not-stored').label).toBe('not stored')
    expect(copyState('future')).toEqual({ label: 'future', description: '' })
  })

  it('says why a copy is there, and stays silent when the node did not say', () => {
    expect(copyOrigin('write', { local: true })).toBe('this node, storage backend')
    expect(copyOrigin('write')).toBe('written here')
    expect(copyOrigin('sync', { path: 'mirror/reads.fastq' })).toBe('via sync into mirror/reads.fastq')
    expect(copyOrigin('sync')).toBe('via sync')
    expect(copyOrigin('replicate')).toBe('copied on request')
    expect(copyOrigin('staging')).toBe('staged for a run')
    expect(copyOrigin('reference')).toBe('points at data held elsewhere')
    expect(copyOrigin('unknown')).toBeNull()
    expect(copyOrigin(undefined)).toBeNull()
    expect(copyOrigin('minted-by-a-later-node')).toBeNull()
  })

  it('names a held-back copy and nothing else', () => {
    expect(copyHeldBack('quarantined')).toBe('Held back: no longer matches its rules')
    expect(copyHeldBack('allowed')).toBeNull()
    expect(copyHeldBack(undefined)).toBeNull()
  })
})

describe('shortError', () => {
  it('keeps a short message as it is', () => {
    expect(shortError('Access denied')).toBe('Access denied')
  })

  it('keeps only the first sentence', () => {
    expect(shortError('Test write failed. Response: <Error>...</Error> at https://s3.example.org/x')).toBe(
      'Test write failed.',
    )
  })

  it('replaces a very long text with a fixed message', () => {
    expect(shortError(`backend error ${'x'.repeat(400)}`)).toBe('The node could not save the backend.')
  })
})

describe('local folder kind', () => {
  it('needs a root, takes an optional folder and no credentials', () => {
    const schema = BACKEND_KIND_SCHEMAS.fs
    expect(schema.label).toBe('Local folder')
    expect(schema.public.map((field) => [field.key, Boolean(field.required)])).toEqual([
      ['root', true],
      ['folder', false],
    ])
    expect(schema.secret).toEqual([])
    expect(schema.identity).toEqual(['root', 'folder'])
  })

  it('accepts an empty folder or a relative one ending with a slash', () => {
    for (const folder of ['', '  ', 'raw/', 'raw/2026/', 'a b/c.d/']) expect(folderProblem(folder)).toBeNull()
  })

  it('refuses what the node refuses', () => {
    expect(folderProblem('raw')).toMatch(/slash/)
    for (const folder of ['/raw/', 'a//b/', './a/', 'a/../b/', '../', '/']) {
      expect(folderProblem(folder)).toMatch(/relative/)
    }
  })

  it('summarizes a folder by its root', () => {
    expect(backendSummary(backend('fs', { root: 'projects', folder: 'raw/' }))).toBe('projects · raw/')
  })
})
