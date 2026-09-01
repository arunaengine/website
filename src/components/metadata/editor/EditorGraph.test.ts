import { describe, expect, it } from 'vitest'
import * as Editor from '@/lib/crate/editor'
import { addFilePart, linkReference } from '@/lib/crate/references'
import { crateGraph, layoutGraph, NODE_HEIGHT } from '@/lib/crate/graph'

// The graph tab draws exactly what this model answers, so the model is what
// the tests pin down; mounting Vue Flow needs a DOM this suite does not have.
function seeded(): Editor.CrateDraft {
  const named = Editor.updateValue(Editor.newDraft(), './', 'name', 0, 'Example dataset')
  const person = Editor.addEntity(named, { type: 'Person', name: 'Ada Lovelace' })
  const authored = Editor.addValue(person.draft, './', 'author', {
    kind: 'reference',
    value: person.entity.id,
  })
  const withFile = addFilePart(authored, { id: 's3://bucket/reads.csv', name: 'reads.csv' })
  return Editor.addValue(withFile, '#ada-lovelace', 'affiliation', {
    kind: 'reference',
    value: 'https://ror.org/03yrm5c26',
  })
}

describe('crateGraph', () => {
  it('badges every entity by what it is', () => {
    const { nodes } = crateGraph(seeded())
    const badges = Object.fromEntries(nodes.map((node) => [node.id, node.badge]))

    expect(badges['./']).toBe('Root')
    expect(badges['s3://bucket/reads.csv']).toBe('File')
    expect(badges['#ada-lovelace']).toBe('Contextual')
    expect(nodes.find((node) => node.id === './')?.label).toBe('Example dataset')
    expect(nodes.find((node) => node.id === '#ada-lovelace')?.types).toEqual(['Person'])
  })

  it('gives a reference leaving the crate a ghost node', () => {
    const { nodes } = crateGraph(seeded())
    const ghost = nodes.find((node) => node.id === 'https://ror.org/03yrm5c26')

    expect(ghost).toMatchObject({ kind: 'external', badge: 'External', types: ['URL'] })
  })

  it('labels each edge with the property it stands for', () => {
    const { edges } = crateGraph(seeded())
    const labelled = edges.map((edge) => [edge.source, edge.label, edge.target])

    expect(labelled).toContainEqual(['./', 'author', '#ada-lovelace'])
    expect(labelled).toContainEqual(['./', 'hasPart', 's3://bucket/reads.csv'])
    expect(labelled).toContainEqual(['#ada-lovelace', 'affiliation', 'https://ror.org/03yrm5c26'])
  })

  it('reads an edge label from the vocabulary when there is one', () => {
    const model = crateGraph(seeded(), {
      property: () => undefined,
      propertyNamed: (name: string) => ({ label: `The ${name}` }),
    } as never)

    expect(model.edges.find((edge) => edge.property === 'author')?.label).toBe('The author')
  })

  it('draws one edge however often a connection is dragged', () => {
    // Drag-connect writes through linkReference, so a repeat is not a new part.
    const once = linkReference(seeded(), './', 'hasPart', '#ada-lovelace')
    const twice = linkReference(once, './', 'hasPart', '#ada-lovelace')
    const edges = crateGraph(twice).edges.filter((edge) => edge.property === 'hasPart')

    expect(edges.map((edge) => edge.target)).toEqual(['s3://bucket/reads.csv', '#ada-lovelace'])
  })

  it('leaves an empty reference out of the graph', () => {
    const draft = Editor.addValue(seeded(), './', 'publisher', { kind: 'reference', value: '' })

    expect(crateGraph(draft).edges.some((edge) => edge.property === 'publisher')).toBe(false)
  })
})

describe('layoutGraph', () => {
  it('places the root above what it points at', () => {
    const model = crateGraph(seeded())
    const placed = layoutGraph(model)
    const at = (id: string) => placed.find((entry) => entry.node.id === id)

    expect(placed).toHaveLength(model.nodes.length)
    expect(at('./')?.y ?? 0).toBeLessThan(at('#ada-lovelace')?.y ?? 0)
    expect((at('#ada-lovelace')?.y ?? 0) - (at('./')?.y ?? 0)).toBeGreaterThanOrEqual(NODE_HEIGHT)
  })
})
