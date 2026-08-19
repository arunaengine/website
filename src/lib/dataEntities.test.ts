import { describe, expect, it } from 'vitest'
import {
  applyDataEntities,
  dataEntitiesOf,
  dataEntityTreeOf,
  formatContentSize,
  isDataEntity,
  isLeafFile,
} from './dataEntities'

// Shaped like the ENA metagenome crate: a root with a MediaObject file and a
// sub-Dataset directory that lists its own parts. `./meta.json` is referenced
// from hasPart with no entity behind it, and `./run/stats.txt` is plain `File`
// so the hoisting regression below can bite: the pre-fix flat union only
// matched `File`/`Dataset`, so a MediaObject-only fixture hid the bug.
function nestedCrate() {
  return {
    '@context': 'https://w3id.org/ro/crate/1.2/context',
    '@graph': [
      { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': 'root' } },
      {
        '@id': 'root',
        '@type': 'Dataset',
        name: 'Sample',
        hasPart: [{ '@id': './run/' }, { '@id': './meta.json' }],
      },
      {
        '@id': './run/',
        '@type': 'Dataset',
        name: 'Run',
        hasPart: [{ '@id': './run/reads.fasta.gz' }, { '@id': './run/stats.txt' }],
      },
      {
        '@id': './run/reads.fasta.gz',
        '@type': ['MediaObject', 'https://w3id.org/mixs/0010011'],
        name: 'reads.fasta.gz',
        contentSize: '3755160',
        encodingFormat: 'application/gzip',
      },
      { '@id': './run/stats.txt', '@type': 'File', name: 'stats.txt' },
    ],
  }
}

function crateOf(...entities: Array<Record<string, unknown>>) {
  return {
    '@graph': [
      { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': 'root' } },
      ...entities,
    ],
  }
}

function ids(crate: unknown): string[] {
  return dataEntityTreeOf(crate).map((node) => node.id)
}

describe('shared data entity classification', () => {
  it.each([
    ['File', 'https://schema.org/File'],
    ['MediaObject', 'https://schema.org/MediaObject'],
    ['ImageObject', 'https://schema.org/ImageObject'],
    ['AudioObject', 'https://schema.org/AudioObject'],
    ['VideoObject', 'https://schema.org/VideoObject'],
  ])('classifies compact and full-IRI %s types as leaf files', (compact, fullIri) => {
    expect(isDataEntity([compact])).toBe(true)
    expect(isLeafFile([compact])).toBe(true)
    expect(isDataEntity([fullIri])).toBe(true)
    expect(isLeafFile([fullIri])).toBe(true)
  })

  it('classifies Dataset as data but never as a leaf file', () => {
    expect(isDataEntity(['Dataset'])).toBe(true)
    expect(isDataEntity(['https://schema.org/Dataset'])).toBe(true)
    expect(isLeafFile(['Dataset'])).toBe(false)
    expect(isLeafFile(['File', 'https://schema.org/Dataset'])).toBe(false)
  })

  it('uses the shared predicate when collecting unreferenced data entities', () => {
    const crate = crateOf(
      { '@id': 'root', '@type': 'Dataset' },
      { '@id': './image.png', '@type': 'https://schema.org/ImageObject' },
    )
    expect(dataEntitiesOf(crate).map((entity) => entity.id)).toEqual(['./image.png'])
  })
})

describe('the data entity tree', () => {
  it('walks hasPart depth first, in list order', () => {
    expect(ids(nestedCrate())).toEqual([
      './run/',
      './run/reads.fasta.gz',
      './run/stats.txt',
      './meta.json',
    ])
  })

  it('reports depth, parent and directory per node', () => {
    const byId = new Map(dataEntityTreeOf(nestedCrate()).map((node) => [node.id, node]))
    expect(byId.get('./run/')).toMatchObject({ depth: 0, parentId: 'root', directory: true })
    expect(byId.get('./run/reads.fasta.gz')).toMatchObject({ depth: 1, parentId: './run/', directory: false })
    expect(byId.get('./meta.json')).toMatchObject({ depth: 0, parentId: 'root', directory: false })
    expect(byId.get('./run/')?.childIds).toEqual(['./run/reads.fasta.gz', './run/stats.txt'])
  })

  it('carries the entity fields the table and dialog read', () => {
    const reads = dataEntityTreeOf(nestedCrate()).find((node) => node.id === './run/reads.fasta.gz')
    expect(reads).toMatchObject({
      name: 'reads.fasta.gz',
      contentSize: '3755160',
      encodingFormat: 'application/gzip',
      types: ['MediaObject', 'https://w3id.org/mixs/0010011'],
    })
  })

  it('lists a hasPart id with no entity behind it', () => {
    // The row still has to render, keyed by its verbatim @id.
    const meta = dataEntityTreeOf(nestedCrate()).find((node) => node.id === './meta.json')
    expect(meta).toMatchObject({ name: './meta.json', types: ['File'], directory: false })
  })

  it('detects data types through an ontology URI and a full schema.org URI', () => {
    // The mixs URI sits beside MediaObject in the @type array, and a Dataset
    // written as a full URI must still recurse as a directory.
    const crate = crateOf(
      { '@id': 'root', '@type': 'Dataset', hasPart: [{ '@id': './dir/' }] },
      { '@id': './dir/', '@type': 'http://schema.org/Dataset', hasPart: [{ '@id': './dir/a' }] },
      { '@id': './dir/a', '@type': ['MediaObject', 'https://w3id.org/mixs/0010011'] },
    )
    const tree = dataEntityTreeOf(crate)
    expect(tree.map((node) => [node.id, node.depth, node.directory])).toEqual([
      ['./dir/', 0, true],
      ['./dir/a', 1, false],
    ])
  })

  it('appends data entities no hasPart chain reaches', () => {
    const crate = crateOf(
      { '@id': 'root', '@type': 'Dataset', hasPart: [{ '@id': './listed' }] },
      { '@id': './listed', '@type': 'File' },
      { '@id': './stray', '@type': 'MediaObject' },
    )
    expect(ids(crate)).toEqual(['./listed', './stray'])
    expect(dataEntityTreeOf(crate).find((node) => node.id === './stray')?.depth).toBe(0)
  })

  it('excludes the root and the descriptor', () => {
    expect(ids(nestedCrate())).not.toContain('root')
    expect(ids(nestedCrate())).not.toContain('ro-crate-metadata.json')
  })

  it('terminates on a cycle, listing each id once', () => {
    const crate = crateOf(
      { '@id': 'root', '@type': 'Dataset', hasPart: [{ '@id': './a/' }] },
      { '@id': './a/', '@type': 'Dataset', hasPart: [{ '@id': './b/' }] },
      { '@id': './b/', '@type': 'Dataset', hasPart: [{ '@id': './a/' }] },
    )
    expect(ids(crate)).toEqual(['./a/', './b/'])
  })

  it('stops descending at maxDepth', () => {
    const crate = crateOf(
      { '@id': 'root', '@type': 'Dataset', hasPart: [{ '@id': './a/' }] },
      { '@id': './a/', '@type': 'Dataset', hasPart: [{ '@id': './a/b/' }] },
      { '@id': './a/b/', '@type': 'Dataset', hasPart: [{ '@id': './a/b/c' }] },
      { '@id': './a/b/c', '@type': 'File' },
    )
    // Depth 1 is the last level walked; the entity below it is unreachable by
    // the chain, so it lands as a depth-0 stray rather than disappearing.
    const tree = dataEntityTreeOf(crate, 1)
    expect(tree.map((node) => [node.id, node.depth])).toEqual([
      ['./a/', 0],
      ['./a/b/', 1],
      ['./a/b/c', 0],
    ])
  })

  it('returns nothing for an empty or non-crate value', () => {
    expect(dataEntityTreeOf(undefined)).toEqual([])
    expect(dataEntityTreeOf({})).toEqual([])
    expect(dataEntityTreeOf({ '@graph': [] })).toEqual([])
  })
})

describe('content size formatting', () => {
  it('formats a numeric string as bytes', () => {
    expect(formatContentSize('3755160')).toBe('3.6 MB')
    expect(formatContentSize('0')).toBe('0 B')
  })

  it('passes a non-numeric value through verbatim', () => {
    expect(formatContentSize('12 MB')).toBe('12 MB')
    expect(formatContentSize('unspecified')).toBe('unspecified')
  })

  it('renders a missing value as a dash', () => {
    expect(formatContentSize(undefined)).toBe('-')
    expect(formatContentSize('')).toBe('-')
    expect(formatContentSize('   ')).toBe('-')
  })
})

describe('writing the editor file list back', () => {
  it('keeps a nested entity out of the root hasPart on a no-op save', () => {
    // Regression: the editor seeds from depth-0 rows, so a sub-dataset's own
    // part is neither hoisted into the root nor pruned from the graph.
    const crate = nestedCrate()
    const depthZero = dataEntityTreeOf(crate).filter((node) => node.depth === 0)
    applyDataEntities(crate, depthZero)

    const graph = crate['@graph'] as Array<Record<string, unknown>>
    const root = graph.find((entity) => entity['@id'] === 'root')
    const run = graph.find((entity) => entity['@id'] === './run/')
    expect((root?.hasPart as Array<{ '@id': string }>).map((ref) => ref['@id'])).toEqual([
      './run/',
      './meta.json',
    ])
    expect((run?.hasPart as Array<{ '@id': string }>).map((ref) => ref['@id'])).toEqual([
      './run/reads.fasta.gz',
      './run/stats.txt',
    ])
    expect(graph.some((entity) => entity['@id'] === './run/stats.txt')).toBe(true)
  })

  it('hoists nested parts when seeded from the flat union', () => {
    // Pins WHY the editor must seed from the tree: the flat union reports a
    // nested File at top level, and writing that back rewrites the root's
    // hasPart with it. If this ever stops hoisting, the test above has gone
    // blind and its fixture needs a File-typed nested part again.
    const crate = nestedCrate()
    applyDataEntities(crate, dataEntitiesOf(crate))

    const root = (crate['@graph'] as Array<Record<string, unknown>>).find((entity) => entity['@id'] === 'root')
    expect((root?.hasPart as Array<{ '@id': string }>).map((ref) => ref['@id'])).toContain('./run/stats.txt')
  })

  it('drops a removed entity only when nothing else references it', () => {
    const crate = nestedCrate()
    const kept = dataEntityTreeOf(crate).filter((node) => node.depth === 0 && node.id !== './meta.json')
    applyDataEntities(crate, kept)

    const graph = crate['@graph'] as Array<Record<string, unknown>>
    expect((graph.find((entity) => entity['@id'] === 'root')?.hasPart as Array<{ '@id': string }>)).toEqual([
      { '@id': './run/' },
    ])
    // Still referenced by the sub-dataset's hasPart, so it survives the prune.
    expect(graph.some((entity) => entity['@id'] === './run/reads.fasta.gz')).toBe(true)
  })

  it('prunes a stray entity the author removed from the list', () => {
    // A stray is reachable from no hasPart chain, so the editor shows it at
    // depth zero. Removal therefore has to delete it, or it lingers as an
    // orphan no view can reach and no author can get rid of.
    const crate = crateOf(
      { '@id': 'root', '@type': 'Dataset', hasPart: [{ '@id': './listed' }] },
      { '@id': './listed', '@type': 'File', name: 'listed' },
      { '@id': './stray', '@type': 'File', name: 'stray' },
    )
    const shown = dataEntityTreeOf(crate).filter((node) => node.depth === 0)
    expect(shown.map((node) => node.id)).toEqual(['./listed', './stray'])

    applyDataEntities(crate, shown.filter((node) => node.id !== './stray'))
    const graph = crate['@graph'] as Array<Record<string, unknown>>
    expect(graph.some((entity) => entity['@id'] === './stray')).toBe(false)
    expect(graph.some((entity) => entity['@id'] === './listed')).toBe(true)
  })
})
