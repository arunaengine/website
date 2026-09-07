import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/client'
import { preflightExport } from './exportPreflight'

const READABLE = '01JREADAB1E000000000000000'
const DENIED = '01JDEN1ED0000000000000000A'
const GONE = '01JG0NE000000000000000000A'
const BROKEN = '01JBR0KEN0000000000000000A'

function link(iri: string, name: string, identifier?: string) {
  return {
    '@id': iri,
    '@type': 'Dataset',
    name,
    conformsTo: { '@id': 'https://w3id.org/ro/crate' },
    ...(identifier ? { identifier } : {}),
  }
}

const crate = {
  '@context': 'https://w3id.org/ro/crate/1.2/context',
  '@graph': [
    { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
    {
      '@id': './',
      '@type': 'Dataset',
      hasPart: [
        { '@id': `https://w3id.org/aruna/${READABLE}` },
        { '@id': `https://w3id.org/aruna/${DENIED}` },
        { '@id': 'https://example.org/child' },
        { '@id': 'https://other.example/crate' },
        { '@id': `https://w3id.org/aruna/${BROKEN}` },
        { '@id': 'raw/reads.fastq' },
      ],
    },
    link(`https://w3id.org/aruna/${READABLE}`, 'Readable child'),
    link(`https://w3id.org/aruna/${DENIED}`, 'Restricted child'),
    link('https://example.org/child', 'Deleted child', GONE),
    link('https://other.example/crate', 'External crate'),
    link(`https://w3id.org/aruna/${BROKEN}`, 'Unreachable child'),
    { '@id': 'raw/reads.fastq', '@type': 'File', name: 'reads' },
  ],
}

describe('export preflight', () => {
  it('separates restricted, unchecked and failed subcrate links', async () => {
    const getItem = vi.fn(async (documentId: string) => {
      if (documentId === DENIED) throw new ApiError(403, 'forbidden')
      if (documentId === GONE) throw new ApiError(404, 'not found')
      if (documentId === BROKEN) throw new ApiError(503, 'unavailable')
      return { document_id: documentId }
    })

    const result = await preflightExport(crate, getItem)

    expect(getItem.mock.calls.map((call) => call[0]).sort()).toEqual([BROKEN, DENIED, GONE, READABLE].sort())
    expect(result.restricted.map((entry) => entry.name).sort()).toEqual(['Deleted child', 'Restricted child'])
    expect(result.unchecked.map((entry) => entry.name)).toEqual(['External crate'])
    expect(result.failed).toBe(true)
  })

  it('reports nothing for a crate whose links are all readable', async () => {
    const result = await preflightExport(crate, async () => ({}))

    expect(result).toEqual({ restricted: [], unchecked: [expect.objectContaining({ name: 'External crate' })], failed: false })
  })
})
