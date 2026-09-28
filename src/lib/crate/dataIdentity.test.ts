import { describe, expect, it, vi } from 'vitest'
import { dataEntityIdentity, folderRoute, objectLocation, objectRoute, parseDataIdentity } from './dataIdentity'

const BLAKE3 = 'a'.repeat(64)

describe('dataEntityIdentity', () => {
  it('identifies a resolvable object by its content, not its place', async () => {
    const getDrsObject = vi.fn().mockResolvedValue({ checksums: [{ type: 'blake3', checksum: BLAKE3 }] })

    expect(await dataEntityIdentity('reads', 'raw/one.csv', {
      realmId: 'realm-1',
      nodeId: 'node-1',
      getVersionId: async () => '01VERSION',
      getDrsObject,
    })).toEqual({
      id: `https://w3id.org/aruna/data/${BLAKE3}`,
      contentUrl: 's3://reads/raw/one.csv',
    })
    expect(getDrsObject).toHaveBeenCalledWith('arn:aruna:realm-1:node-1:s3/reads/raw/one.csv@01VERSION')
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

  it('reads the current form', () => {
    expect(parseDataIdentity({ id: CONTENT, contentUrl: 's3://reads/raw/one.csv', localPath: 'raw/one.csv' })).toEqual({
      contentId: CONTENT,
      s3: { bucket: 'reads', key: 'raw/one.csv' },
      arn: null,
      localPath: 'raw/one.csv',
    })
  })

  it('reads an older versioned ARN id with the content address in contentUrl', () => {
    const id = 'https://w3id.org/aruna/data/arn:aruna:realm-1:node-1:s3/reads/raw/two%20words.csv@01VERSION'
    expect(parseDataIdentity({ id, contentUrl: CONTENT })).toEqual({
      contentId: CONTENT,
      s3: { bucket: 'reads', key: 'raw/two words.csv' },
      arn: { realmId: 'realm-1', nodeId: 'node-1', version: '01VERSION' },
      localPath: null,
    })
  })

  it('never takes a versioned ARN id for a content address', () => {
    const id = 'https://w3id.org/aruna/data/arn:aruna:realm-1:node-1:s3/reads/raw/one.csv@01VERSION'
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
      localPath: 'data/one.csv',
    })
  })

  it('knows nothing about an external link', () => {
    expect(parseDataIdentity({ id: 'https://example.org/one.csv' })).toEqual({
      contentId: null,
      s3: null,
      arn: null,
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
