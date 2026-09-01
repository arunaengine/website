import { describe, expect, it, vi } from 'vitest'
import { dataEntityIdentity, objectLocation } from './dataIdentity'

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
