import { describe, expect, it, vi } from 'vitest'
import type { BacklinkPreflightResponse, BacklinkPreflightTargetResult } from '@/lib/backlinks'

vi.mock('@/composables/useAruna', () => ({ useAruna: () => ({}) }))
vi.mock('@/composables/useS3', () => ({ useS3: () => ({}) }))
const { mergeBulkBacklinkPreflights } = await import('./useDeletionPreflight')

const version = (key: string, version_id = 'v1') => ({ node_id: 'node-a', bucket: 'bakrep', key, version_id })
const target = (overrides: Partial<BacklinkPreflightTargetResult>): BacklinkPreflightTargetResult => ({
  content_w3id: null,
  location_iri: null,
  targeted_versions: [],
  visible_references: [],
  hidden_references_exist: false,
  would_remove_last_resolvable_aruna_location: false,
  location_impact_complete: true,
  ...overrides,
})
const response = (targets: BacklinkPreflightTargetResult[]): BacklinkPreflightResponse => ({
  targets,
  next_cursor: null,
  truncated: false,
  nodes_queried: 1,
  nodes_failed: 0,
  complete: true,
  failed_partitions: [],
  coverage: {
    queried_scope: 'realm',
    queried_forms: ['aruna_s3_url'],
    excluded_forms: [{ form: 'unread_content_w3id', reason: 'unread bytes have no content identity' }],
    node_freshness: [],
    target_resolution_complete: true,
    path_style_endpoint_coverage_complete: true,
    realm_coverage_complete: true,
  },
})

describe('merging the lookups of a selection', () => {
  it('keeps one target per unread key and the stored ones apart, and stays complete', () => {
    const merged = mergeBulkBacklinkPreflights(
      { bucket: 'bakrep', nodeId: null, keys: ['a.gff3', 'b.gff3'], prefixes: [] },
      [
        { key: 'a.gff3', exact: true, response: response([
          target({ location_iri: 's3://bakrep/a.gff3', targeted_versions: [version('a.gff3')], visible_references: [{ document_id: 'd1', title: 'A' }] }),
          target({ content_w3id: 'https://w3id.org/aruna/data/a', targeted_versions: [version('a.gff3', 'v0')] }),
        ]) },
        { key: 'b.gff3', exact: true, response: response([
          target({ location_iri: 's3://bakrep/b.gff3', targeted_versions: [version('b.gff3')], visible_references: [{ document_id: 'd2', title: 'B' }] }),
        ]) },
      ],
      0,
      'all_versions_purge',
    )

    expect(merged.targets.map((entry) => entry.location_iri ?? entry.content_w3id)).toEqual([
      's3://bakrep/a.gff3',
      'https://w3id.org/aruna/data/a',
      's3://bakrep/b.gff3',
    ])
    expect(merged.targets[2].visible_references).toEqual([{ document_id: 'd2', title: 'B' }])
    expect(merged.complete).toBe(true)
    expect(merged.coverage.target_resolution_complete).toBe(true)
    expect(merged.coverage.excluded_forms.map((form) => form.form)).toEqual(['unread_content_w3id'])
  })
})
