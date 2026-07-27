import { describe, expect, it } from 'vitest'
import { isRecencyOrdered, walkRecentPages } from './useAruna'
import type { ListMetadataResponse, MetadataDocumentListItem } from '@/lib/api'

const HOUR = 3_600_000
const START = Date.UTC(2026, 6, 27)

// Descending by index: item 0 is the newest, matching a recency-ordered page.
function stamp(index: number): string {
  return new Date(START - index * HOUR).toISOString()
}

function doc(path: string, updated: string): MetadataDocumentListItem {
  return {
    document_id: path,
    group_id: 'group',
    document_path: path,
    graph_iri: `urn:${path}`,
    public: true,
    replicas: 1,
    created_at: updated,
    updated_at: updated,
  }
}

function page(documents: MetadataDocumentListItem[], offset: number, limit: number): ListMetadataResponse {
  return { documents, limit, offset, total_returned: documents.length }
}

function dataDocs(count: number, from = 0): MetadataDocumentListItem[] {
  return Array.from({ length: count }, (_, index) => doc(`data/${from + index}`, stamp(from + index)))
}

function profileDocs(count: number, from = 0): MetadataDocumentListItem[] {
  return Array.from({ length: count }, (_, index) => doc(`profiles/${from + index}`, stamp(from + index)))
}

describe('recency capability detection', () => {
  it('accepts a descending page', () => {
    expect(isRecencyOrdered(dataDocs(6))).toBe(true)
  })

  it('rejects a created-ascending page', () => {
    // What an older node answers: it ignores the unknown order parameter and
    // returns 200 with its oldest documents first.
    expect(isRecencyOrdered([...dataDocs(6)].reverse())).toBe(false)
  })

  it('accepts pages with no evidence', () => {
    expect(isRecencyOrdered([])).toBe(true)
    expect(isRecencyOrdered(dataDocs(1))).toBe(true)
    expect(isRecencyOrdered([doc('a', stamp(3)), doc('b', stamp(3))])).toBe(true)
  })

  it('ignores unparsable timestamps', () => {
    expect(isRecencyOrdered([doc('a', stamp(0)), doc('b', 'never'), doc('c', stamp(2))])).toBe(true)
  })
})

describe('the recent page walk', () => {
  it('takes one page when it fills', async () => {
    const offsets: number[] = []
    const walk = await walkRecentPages(async (offset, size) => {
      offsets.push(offset)
      return page(dataDocs(size), offset, size)
    }, 5)
    expect(offsets).toEqual([0])
    expect(walk).toEqual({ ordered: true, documents: dataDocs(5) })
  })

  it('deepens past a profile-only window', async () => {
    const offsets: number[] = []
    const walk = await walkRecentPages(async (offset, size) => {
      offsets.push(offset)
      return offset === 0 ? page(profileDocs(size), offset, size) : page(dataDocs(3, 20), offset, size)
    }, 5)
    expect(offsets).toEqual([0, 10])
    expect(walk.documents.map((item) => item.document_path)).toEqual(['data/20', 'data/21', 'data/22'])
  })

  it('stops at the page cap', async () => {
    const offsets: number[] = []
    const walk = await walkRecentPages(async (offset, size) => {
      offsets.push(offset)
      return page(profileDocs(size, offset), offset, size)
    }, 5)
    // Empty and ordered: the caller turns this into its own fallback list.
    expect(offsets).toEqual([0, 10, 20])
    expect(walk).toEqual({ ordered: true, documents: [] })
  })

  it('stops on a short page', async () => {
    const offsets: number[] = []
    const walk = await walkRecentPages(async (offset, size) => {
      offsets.push(offset)
      return page(profileDocs(2), offset, size)
    }, 5)
    expect(offsets).toEqual([0])
    expect(walk).toEqual({ ordered: true, documents: [] })
  })

  it('reports an unordered page once', async () => {
    const offsets: number[] = []
    const walk = await walkRecentPages(async (offset, size) => {
      offsets.push(offset)
      return page([...dataDocs(size)].reverse(), offset, size)
    }, 5)
    expect(offsets).toEqual([0])
    expect(walk).toEqual({ ordered: false, documents: [] })
  })
})
