import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

const source = read('../components/metadata/view/DatasetFiles.vue')
const view = read('./MetadataView.vue')
const list = read('../components/data/ReferencedBy.vue')

describe('Dataset file discovery presentation', () => {
  it('runs the reference lookup only from the file action and hands it to the shared list', () => {
    expect(source).toContain('@click.stop="loadBacklinks(row)"')
    expect(source).toContain("{ target: { kind: 'content_w3ids', content_w3ids: [identity] } }")
    expect(source).toContain('<ReferencedBy')
    expect(source).not.toContain('coverage.queried_scope')
    expect(source).not.toContain('node_freshness')
    expect(list).toContain('Other restricted datasets reference this file.')
    expect(list).toContain('Not checked:')
    expect(list).toContain("section=\"What the reference check covers\"")
  })

  it('keeps the loaded cache separate and presents identity apart from location', () => {
    expect(source).toContain('Loaded datasets only:')
    expect(source.indexOf('Loaded datasets only:')).not.toBe(source.indexOf('<ReferencedBy'))
    expect(source).toContain('Content identity: {{ row.id }}')
    expect(source).toContain('Location:')
    expect(source).toContain("row.contentUrl ?? (contentW3id(row) ? '' : row.id)")
    expect(view).toContain("query: { expert: '1', document: detailId }")
  })
})
