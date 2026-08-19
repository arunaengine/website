import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(fileURLToPath(new URL('./MetadataView.vue', import.meta.url)), 'utf8')

describe('Dataset file discovery presentation', () => {
  it('runs backlink preflight only from the file action and renders authoritative coverage', () => {
    expect(source).toContain('@click.stop="loadBacklinks(row)"')
    expect(source).toContain('await preflightBacklinks(')
    expect(source).toContain("{ target: { kind: 'content_w3ids', content_w3ids: [identity] } }")
    expect(source).toContain('Authoritative Realm backlink lookup')
    expect(source).toContain('backlinkResult.coverage.queried_scope')
    expect(source).toContain('backlinkResult.coverage.node_freshness')
    expect(source).toContain('backlinkResult.coverage.realm_coverage_complete')
    expect(source).toContain('backlinkResult.coverage.path_style_endpoint_coverage_complete')
    expect(source).toContain('backlinkResult.coverage.target_resolution_complete')
    expect(source).toContain('backlinkTarget.visible_references')
    expect(source).toContain('Other restricted Datasets reference this content')
  })

  it('keeps the loaded-crate cache separate and presents identity apart from location', () => {
    expect(source).toContain('Loaded-crate cache only:')
    expect(source.indexOf('Loaded-crate cache only:')).not.toBe(source.indexOf('Authoritative Realm backlink lookup'))
    expect(source).toContain('Content identity: {{ row.id }}')
    expect(source).toContain('Location:')
    expect(source).toContain("row.contentUrl ?? (contentW3id(row) ? '' : row.id)")
    expect(source).toContain("query: { expert: '1', document: detailId }")
  })
})
