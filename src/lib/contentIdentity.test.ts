import { describe, expect, it, vi } from 'vitest'
import { dataEntitiesOf } from './dataEntities'
import {
  arunaContentReference,
  contentIdentityFromBlake3,
  externalContentReference,
  resolveContentIdentity,
} from './contentIdentity'
import { newDraft, toRoCrate } from './crate/editor'
import { addFilePart } from './crate/references'

const BLAKE3 = 'ab'.repeat(32)

// A crate the editor could have written for this reference.
function crateWith(reference: ReturnType<typeof arunaContentReference>, name = 'reads.fastq.gz') {
  return toRoCrate(addFilePart(newDraft(), {
    id: reference.id,
    name,
    ...(reference.contentUrl ? { contentUrl: reference.contentUrl } : {}),
  }))
}

describe('canonical content identity authoring', () => {
  it('resolves a bucket and key through the current version DRS checksum', async () => {
    const getVersionId = vi.fn().mockResolvedValue('01JABCDEF0123456789ABCDEFG')
    const getDrsObject = vi.fn().mockResolvedValue({
      checksums: [
        { type: 'sha256', checksum: 'cd'.repeat(32) },
        { type: 'blake3', checksum: BLAKE3.toUpperCase() },
      ],
    })

    await expect(resolveContentIdentity('raw-data', 'runs/a @ %.fastq', {
      realmId: 'realm-id',
      nodeId: 'node-id',
      getVersionId,
      getDrsObject,
    })).resolves.toEqual({
      status: 'resolved',
      id: `https://w3id.org/aruna/data/${BLAKE3}`,
      blake3: BLAKE3,
    })
    expect(getVersionId).toHaveBeenCalledWith('raw-data', 'runs/a @ %.fastq')
    expect(getDrsObject).toHaveBeenCalledWith(
      'arn:aruna:realm-id:node-id:s3/raw-data/runs/a%20%40%20%25.fastq@01JABCDEF0123456789ABCDEFG',
    )
  })

  it('round-trips Aruna-held content with a W3ID and separate location', () => {
    const location = 's3://raw-data/runs/reads.fastq.gz'
    const reference = arunaContentReference(location, contentIdentityFromBlake3(BLAKE3))
    const graph = crateWith(reference)['@graph'] as Array<Record<string, unknown>>

    expect(reference).toEqual({
      id: `https://w3id.org/aruna/data/${BLAKE3}`,
      contentUrl: location,
      identity: 'content',
    })
    expect(graph.find((node) => node['@id'] === './')?.hasPart).toEqual({ '@id': reference.id })
    expect(dataEntitiesOf(crateWith(reference))).toEqual([{
      id: reference.id,
      name: 'reads.fastq.gz',
      types: ['File'],
      encodingFormat: undefined,
      contentSize: undefined,
      contentUrl: location,
      description: undefined,
    }])
  })

  it('falls back without fabricating a digest and carries the location marker', async () => {
    const location = 's3://raw-data/runs/unresolved.fastq.gz'
    const resolution = await resolveContentIdentity('raw-data', 'runs/unresolved.fastq.gz', {
      realmId: 'realm-id',
      nodeId: 'node-id',
      getVersionId: vi.fn().mockRejectedValue(new Error('unavailable')),
    })
    const reference = arunaContentReference(location, resolution)

    // The read side must list the location form exactly as it lists the w3id one.
    expect(reference).toEqual({ id: location, identity: 'location' })
    expect(dataEntitiesOf(crateWith(reference, 'unresolved.fastq.gz'))).toMatchObject([{
      id: location,
      name: 'unresolved.fastq.gz',
      types: ['File'],
    }])
  })

  it('preserves an external source identity untouched', () => {
    const source = 'https://example.org/archive/data.tar.gz'
    const reference = externalContentReference(source)

    expect(reference).toEqual({ id: source, identity: 'external' })
    expect(dataEntitiesOf(crateWith(reference, 'External archive'))[0].id).toBe(source)
  })
})
