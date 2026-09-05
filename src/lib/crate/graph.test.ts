import { describe, expect, it } from 'vitest'
import * as Editor from '@/lib/crate/editor'
import { addFilePart, linkReference } from '@/lib/crate/references'
import {
  crateGraph,
  dataOnly,
  describeGraph,
  layoutGraph,
  NODE_HEIGHT,
  toDraft,
} from '@/lib/crate/graph'

// Every graph view draws exactly what this model answers, so the model is
// what the tests pin down.
function seeded(): Editor.CrateDraft {
  const named = Editor.updateValue(Editor.newDraft(), './', 'name', 0, 'Example dataset')
  const person = Editor.addEntity(named, { type: 'Person', name: 'Ada Lovelace' })
  const authored = Editor.addValue(person.draft, './', 'author', {
    kind: 'reference',
    value: person.entity.id,
  })
  const withFile = addFilePart(authored, {
    id: 's3://bucket/reads.csv',
    name: 'reads.csv',
    contentSize: '2048',
    encodingFormat: 'text/csv',
  })
  return Editor.addValue(withFile, '#ada-lovelace', 'affiliation', {
    kind: 'reference',
    value: 'https://ror.org/03yrm5c26',
  })
}

function nodeById(source: unknown, id: string) {
  return crateGraph(source).nodes.find((node) => node.id === id)
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

  it('reads the crate JSON a page loaded for viewing', () => {
    // The same picture whether the crate comes from the editor or the node.
    const crate = Editor.toRoCrate(seeded())
    const fromJson = crateGraph(crate)
    const fromDraft = crateGraph(seeded())

    expect(toDraft(crate).entities.map((entity) => entity.id)).toEqual(seeded().entities.map((entity) => entity.id))
    expect(fromJson.nodes).toEqual(fromDraft.nodes)
    expect(fromJson.edges).toEqual(fromDraft.edges)
  })

  it('tells files and datasets apart by type, wherever they hang', () => {
    // A media file inside a sub-dataset is not in the root's hasPart.
    const crate = {
      '@graph': [
        { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
        { '@id': './', '@type': 'Dataset', name: 'Nested', hasPart: { '@id': 'images/' } },
        { '@id': 'images/', '@type': 'Dataset', hasPart: [{ '@id': 'images/a.png' }, { '@id': 'images/b.png' }] },
        { '@id': 'images/a.png', '@type': 'ImageObject', contentSize: '1024' },
        { '@id': 'images/b.png', '@type': ['File', 'ImageObject'] },
      ],
    }

    expect(nodeById(crate, 'images/')).toMatchObject({ kind: 'dataset', facts: '2 parts' })
    expect(nodeById(crate, 'images/a.png')).toMatchObject({ kind: 'file', facts: '1 KB' })
    expect(nodeById(crate, 'images/b.png')).toMatchObject({ kind: 'file', facts: '' })
    expect(nodeById(crate, './')).toMatchObject({ kind: 'root', facts: '1 part' })
  })

  it('puts one line of facts under every node', () => {
    const draft = seeded()

    expect(nodeById(draft, './')?.facts).toBe('1 part')
    expect(nodeById(draft, 's3://bucket/reads.csv')?.facts).toBe('2 KB · text/csv')
    expect(nodeById(draft, '#ada-lovelace')?.facts).toBe('Person')
    expect(nodeById(draft, 'https://ror.org/03yrm5c26')?.facts).toBe('ror.org')
  })

  it('gives a reference leaving the crate a ghost node', () => {
    const { nodes } = crateGraph(seeded())
    const ghost = nodes.find((node) => node.id === 'https://ror.org/03yrm5c26')

    expect(ghost).toMatchObject({ kind: 'external', badge: 'External', types: ['URL'] })
  })

  it('says when a dangling reference is no URL', () => {
    const draft = Editor.addValue(seeded(), './', 'publisher', { kind: 'reference', value: '#gone' })

    expect(nodeById(draft, '#gone')).toMatchObject({ kind: 'external', facts: 'Not in this crate', types: [] })
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

describe('dataOnly', () => {
  it('keeps the root and its data with the edges between them', () => {
    const model = dataOnly(crateGraph(seeded()))

    expect(model.nodes.map((node) => node.id)).toEqual(['./', 's3://bucket/reads.csv'])
    expect(model.edges.map((edge) => edge.property)).toEqual(['hasPart'])
  })
})

describe('describeGraph', () => {
  it('names the crate and counts what is drawn', () => {
    expect(describeGraph(crateGraph(seeded()))).toBe('Example dataset: 4 entities, 3 references')
    expect(describeGraph(dataOnly(crateGraph(seeded())))).toBe('Example dataset: 2 entities, 1 reference')
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
