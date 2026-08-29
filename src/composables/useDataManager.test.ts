import { describe, expect, it } from 'vitest'
import { dataViewReady } from './useDataManager'

type ReadyState = Parameters<typeof dataViewReady>[0]

function state(overrides: Partial<ReadyState> = {}): ReadyState {
  return {
    contextReady: true,
    remoteBlocked: false,
    bucketsLoaded: true,
    bucketsFailed: false,
    bucket: '',
    listLoading: false,
    listedCount: 0,
    ...overrides,
  }
}

describe('Data view readiness', () => {
  it('waits for the session context', () => {
    expect(dataViewReady(state({ contextReady: false }))).toBe(false)
  })

  it('waits for the bucket list', () => {
    expect(dataViewReady(state({ bucketsLoaded: false }))).toBe(false)
  })

  it('opens on a failed bucket list', () => {
    expect(dataViewReady(state({ bucketsLoaded: false, bucketsFailed: true }))).toBe(true)
  })

  it('waits for the first listing of an open bucket', () => {
    expect(dataViewReady(state({ bucket: 'data', listLoading: true }))).toBe(false)
  })

  it('keeps a listing on screen while it pages', () => {
    expect(dataViewReady(state({ bucket: 'data', listLoading: true, listedCount: 40 }))).toBe(true)
  })

  it('opens when a remote node cannot be browsed', () => {
    expect(dataViewReady(state({ remoteBlocked: true, bucketsLoaded: false }))).toBe(true)
  })

  it('opens once the bucket list and the listing settled', () => {
    expect(dataViewReady(state({ bucket: 'data', listedCount: 3 }))).toBe(true)
  })
})
