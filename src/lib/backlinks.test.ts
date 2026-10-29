import { describe, expect, it } from 'vitest'
import { exactFileBacklinkPreflight, locationOf, targetIdentity, type BacklinkPreflightResponse, type BacklinkPreflightTargetResult } from './backlinks'

const version = (bucket: string, key: string, version_id = 'v1') => ({ node_id: 'node-a', bucket, key, version_id })
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
  nodes_queried: 3,
  nodes_failed: 0,
  complete: true,
  failed_partitions: [],
  coverage: {
    queried_scope: 'realm',
    queried_forms: ['content_w3id', 'aruna_s3_url'],
    excluded_forms: [{ form: 'unread_content_w3id', reason: 'documents citing unread bytes by content w3id are not found' }],
    node_freshness: [],
    target_resolution_complete: true,
    path_style_endpoint_coverage_complete: true,
    realm_coverage_complete: true,
  },
})

const stored = target({ content_w3id: 'https://w3id.org/aruna/data/abc', targeted_versions: [version('bakrep', 'a/b.gff3')], visible_references: [{ document_id: 'd1', title: 'Run 1' }] })
const located = target({ location_iri: 's3://bakrep/a/b.gff3', targeted_versions: [version('bakrep', 'a/b.gff3', 'v1'), version('bakrep', 'a/b.gff3', 'v2')], visible_references: [{ document_id: 'd2', title: 'Run 2' }] })

describe('preflight targets', () => {
  it('names a target by its content identity or, for unread bytes, by its location', () => {
    expect(targetIdentity(stored)).toBe('https://w3id.org/aruna/data/abc')
    expect(targetIdentity(located)).toBe('s3://bakrep/a/b.gff3')
    expect(locationOf('s3://bakrep/a/b.gff3')).toEqual({ bucket: 'bakrep', key: 'a/b.gff3' })
    expect(locationOf('https://w3id.org/aruna/data/abc')).toBeNull()
  })

  it('keeps a stored target of the file and stays complete', () => {
    const exact = exactFileBacklinkPreflight(response([stored]), 'bakrep', 'a/b.gff3')
    expect(exact.targets).toHaveLength(1)
    expect(exact.complete).toBe(true)
  })

  it('keeps a location target of the file, all its versions, and stays complete despite the stated limit', () => {
    const exact = exactFileBacklinkPreflight(response([located]), 'bakrep', 'a/b.gff3')
    expect(exact.targets.map((entry) => entry.targeted_versions.length)).toEqual([2])
    expect(exact.complete).toBe(true)
    expect(exact.coverage.target_resolution_complete).toBe(true)
  })

  it('keeps a location target named for the file even without listed versions', () => {
    const exact = exactFileBacklinkPreflight(response([target({ location_iri: 's3://bakrep/a/b.gff3' })]), 'bakrep', 'a/b.gff3')
    expect(exact.targets).toHaveLength(1)
  })

  it('keeps both kinds in a mixed answer and calls another key of the bucket inexact', () => {
    const mixed = exactFileBacklinkPreflight(response([stored, located]), 'bakrep', 'a/b.gff3')
    expect(mixed.targets.map(targetIdentity)).toEqual(['https://w3id.org/aruna/data/abc', 's3://bakrep/a/b.gff3'])
    expect(mixed.complete).toBe(true)

    const sibling = target({ location_iri: 's3://bakrep/a/other.gff3' })
    const withSibling = exactFileBacklinkPreflight(response([stored, sibling]), 'bakrep', 'a/b.gff3')
    expect(withSibling.targets.map(targetIdentity)).toEqual(['https://w3id.org/aruna/data/abc'])
    expect(withSibling.complete).toBe(false)
  })
})
