import { describe, expect, it, vi } from 'vitest'
import { dataEntityIdentity, folderRoute, hasLocalIdentity, objectLocation, objectRoute, parseDataIdentity } from './dataIdentity'

const BLAKE3 = 'a'.repeat(64)

describe('dataEntityIdentity', () => {
  it('identifies a resolvable object by its content, not its place', async () => {
    const getDrsObject = vi.fn().mockResolvedValue({ checksums: [{ type: 'blake3', checksum: BLAKE3 }] })

    expect(await dataEntityIdentity('reads', 'raw/one.csv', {
      realmId: 'realm-1',
      nodeId: 'node-1',
      getVersionId: async () => '01JABCDEF0123456789ABCDEFG',
      getDrsObject,
    })).toEqual({
      id: `https://w3id.org/aruna/data/${BLAKE3}`,
      contentUrl: 's3://reads/raw/one.csv',
    })
    expect(getDrsObject).toHaveBeenCalledWith('arn:aruna:realm-1:node-1:s3/reads/raw/one.csv@01JABCDEF0123456789ABCDEFG')
  })

  it('falls back to the location when the node cannot answer', async () => {
    expect(await dataEntityIdentity('reads', 'raw/one.csv', {
      realmId: 'realm-1',
      nodeId: 'node-1',
      getVersionId: async () => { throw new Error('offline') },
    })).toEqual({
      id: 's3://reads/raw/one.csv',
      contentUrl: 's3://reads/raw/one.csv',
    })
  })

  it('pins the picked version in the location', async () => {
    const version = '01JABCDEF0123456789ABCDEFG'

    expect(await dataEntityIdentity('reads', 'raw/one.csv', {}, version)).toEqual({
      id: `s3://reads/raw/one.csv?versionId=${version}`,
      contentUrl: `s3://reads/raw/one.csv?versionId=${version}`,
    })
    expect(parseDataIdentity({ id: 's3://reads/raw/one.csv', contentUrl: `s3://reads/raw/one.csv?versionId=${version}` }).s3)
      .toEqual({ bucket: 'reads', key: 'raw/one.csv' })
  })

  it('falls back to the location without a node to ask', async () => {
    expect(await dataEntityIdentity('reads', 'raw/one.csv')).toEqual({
      id: 's3://reads/raw/one.csv',
      contentUrl: 's3://reads/raw/one.csv',
    })
    expect(objectLocation('reads', 'raw/one.csv')).toBe('s3://reads/raw/one.csv')
  })
})

describe('parseDataIdentity', () => {
  const CONTENT = `https://w3id.org/aruna/data/${BLAKE3}`

  it('reads the global id of a version, and not that of a bucket or folder', () => {
    const id = 'https://w3id.org/aruna/data/k3V9xQ2m/01K8Y2B6D8F0H2K4M6P8R0T2V4'

    expect(parseDataIdentity({ id }).global).toEqual({ realmId: 'k3V9xQ2m', versionId: '01K8Y2B6D8F0H2K4M6P8R0T2V4' })
    expect(parseDataIdentity({ id: 'x', contentUrl: id }).global?.versionId).toBe('01K8Y2B6D8F0H2K4M6P8R0T2V4')
    expect(parseDataIdentity({ id: 'https://w3id.org/aruna/data/k3V9xQ2m/01K8Y2B6D8F0H2K4M6P8R0T2V4/' }).global).toBeNull()
    expect(parseDataIdentity({ id: CONTENT }).global).toBeNull()
  })

  it('reads the current form', () => {
    expect(parseDataIdentity({ id: CONTENT, contentUrl: 's3://reads/raw/one.csv', localPath: 'raw/one.csv' })).toEqual({
      contentId: CONTENT,
      s3: { bucket: 'reads', key: 'raw/one.csv' },
      arn: null,
      global: null,
      localPath: 'raw/one.csv',
    })
  })

  it('reads an older versioned ARN id with the content address in contentUrl', () => {
    const id = 'https://w3id.org/aruna/data/arn:aruna:realm-1:node-1:s3/reads/raw/two%20words.csv@01JABCDEF0123456789ABCDEFG'
    expect(parseDataIdentity({ id, contentUrl: CONTENT })).toEqual({
      contentId: CONTENT,
      s3: { bucket: 'reads', key: 'raw/two words.csv' },
      arn: { realmId: 'realm-1', nodeId: 'node-1', version: '01JABCDEF0123456789ABCDEFG' },
      global: null,
      localPath: null,
    })
  })

  it('never takes a versioned ARN id for a content address', () => {
    const id = 'https://w3id.org/aruna/data/arn:aruna:realm-1:node-1:s3/reads/raw/one.csv@01JABCDEF0123456789ABCDEFG'
    expect(parseDataIdentity({ id }).contentId).toBeNull()
  })

  it('reads an s3 id, a pinned version and a path-style location', () => {
    expect(parseDataIdentity({ id: 's3://reads/raw/one.csv' }).s3).toEqual({ bucket: 'reads', key: 'raw/one.csv' })
    expect(parseDataIdentity({ id: CONTENT, contentUrl: 's3://reads/one.ipynb?versionId=01V' }).s3)
      .toEqual({ bucket: 'reads', key: 'one.ipynb' })
    expect(parseDataIdentity({ id: CONTENT, contentUrl: 'https://s3.test/reads/a%20b.csv' }, 'https://s3.test').s3)
      .toEqual({ bucket: 'reads', key: 'a b.csv' })
  })

  it('reads a relative id as a crate path without a location', () => {
    expect(parseDataIdentity({ id: 'data/one.csv' })).toEqual({
      contentId: null,
      s3: null,
      arn: null,
      global: null,
      localPath: 'data/one.csv',
    })
  })

  it('knows nothing about an external link', () => {
    expect(parseDataIdentity({ id: 'https://example.org/one.csv' })).toEqual({
      contentId: null,
      s3: null,
      arn: null,
      global: null,
      localPath: null,
    })
  })
})

describe('bucket browser routes', () => {
  it('opens an object in its folder and a folder key as the folder', () => {
    expect(objectRoute('reads', 'raw/one.csv')).toEqual({
      name: 'bucket',
      params: { bucketId: 'reads' },
      query: { prefix: 'raw', object: 'raw/one.csv' },
    })
    expect(objectRoute('reads', 'raw/')).toEqual({ name: 'bucket', params: { bucketId: 'reads' }, query: { prefix: 'raw' } })
    expect(folderRoute('datasets-g1', 'D1/', 'G1')).toEqual({
      name: 'bucket',
      params: { bucketId: 'datasets-g1' },
      query: { prefix: 'D1', group: 'G1' },
    })
  })
})

describe('node-strict identifiers', () => {
  const VERSION = '01JABCDEF0123456789ABCDEFG'
  const ARN = 'arn:aruna:own:n:s3/reads/one.csv@'

  it('takes only a lowercase hex content id', () => {
    expect(parseDataIdentity({ id: `https://w3id.org/aruna/data/${'A'.repeat(64)}` }).contentId).toBeNull()
    expect(parseDataIdentity({ id: `https://w3id.org/aruna/data/${'a'.repeat(63)}` }).contentId).toBeNull()
  })

  it('takes only a 26 character uppercase ULID as the ARN version', () => {
    expect(hasLocalIdentity({ id: ARN + VERSION }, 'own', 'n')).toBe(true)
    for (const bad of ['01V', VERSION.toLowerCase(), `${VERSION}A`, VERSION.slice(0, 25), `I${VERSION.slice(1)}`]) {
      expect(parseDataIdentity({ id: ARN + bad }).arn).toBeNull()
      expect(hasLocalIdentity({ id: ARN + bad }, 'own', 'n')).toBe(false)
    }
  })
})

describe('hasLocalIdentity', () => {
  const OWN = 'arn:aruna:own:n:s3/reads/one.csv@01JABCDEF0123456789ABCDEFG'
  const FOREIGN = 'arn:aruna:other:n:s3/reads/one.csv@01JABCDEF0123456789ABCDEFG'

  it('accepts every form the source node can copy', () => {
    expect(hasLocalIdentity({ id: `https://w3id.org/aruna/data/${BLAKE3}` }, 'own', 'n')).toBe(true)
    expect(hasLocalIdentity({ id: 'https://example.org/a', contentUrl: 's3://reads/one.csv' }, 'own', 'n')).toBe(true)
    expect(hasLocalIdentity({ id: OWN }, 'own', 'n')).toBe(true)
    expect(hasLocalIdentity({ id: `https://w3id.org/aruna/data/${OWN}` }, 'own', 'n')).toBe(true)
    expect(hasLocalIdentity({ id: `arn:aruna:own:n:ch/blake3/${BLAKE3}` }, 'own', 'n')).toBe(true)
  })

  it('accepts a foreign ARN only with a usable local identity', () => {
    const id = `https://w3id.org/aruna/data/${FOREIGN}`
    expect(hasLocalIdentity({ id }, 'own', 'n')).toBe(false)
    expect(hasLocalIdentity({ id: FOREIGN }, 'own', 'n')).toBe(false)
    expect(hasLocalIdentity({ id: `arn:aruna:other:n:ch/${BLAKE3}` }, 'own', 'n')).toBe(false)
    expect(hasLocalIdentity({ id, contentUrl: 's3://reads/one.csv' }, 'own', 'n')).toBe(true)
    expect(hasLocalIdentity({ id, contentUrl: `https://w3id.org/aruna/data/${BLAKE3}` }, 'own', 'n')).toBe(true)
  })

  it('accepts a versioned ARN of the realm only on the serving node', () => {
    const web = `https://w3id.org/aruna/data/${OWN}`
    expect(hasLocalIdentity({ id: OWN }, 'own', 'm')).toBe(false)
    expect(hasLocalIdentity({ id: web, contentUrl: 's3://reads/one.csv' }, 'own', 'm')).toBe(false)
    expect(hasLocalIdentity({ id: OWN }, 'own', '')).toBe(false)
    expect(hasLocalIdentity({ id: web, contentUrl: `https://w3id.org/aruna/data/${BLAKE3}` }, 'own', 'm')).toBe(true)
  })

  it('follows the last versioned ARN as the node does', () => {
    const remote = OWN.replace(':n:', ':m:')
    expect(hasLocalIdentity({ id: OWN, contentUrl: remote }, 'own', 'n')).toBe(false)
    expect(hasLocalIdentity({ id: remote, contentUrl: OWN }, 'own', 'n')).toBe(true)
    expect(hasLocalIdentity({ id: OWN, contentUrl: FOREIGN }, 'own', 'n')).toBe(false)
  })

  it('rejects a web link and a crate path without a location', () => {
    expect(hasLocalIdentity({ id: 'https://example.org/one.csv' }, 'own', 'n')).toBe(false)
    expect(hasLocalIdentity({ id: 'https://example.org/one.csv', contentUrl: 'https://example.org/one.csv' }, 'own', 'n')).toBe(false)
    expect(hasLocalIdentity({ id: 'data/one.csv' }, 'own', 'n')).toBe(false)
  })
})
