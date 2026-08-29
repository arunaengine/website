import { describe, expect, it } from 'vitest'
import { contextKey, dataViewReady, shouldOpenContext } from './useDataManager'

type ReadyState = Parameters<typeof dataViewReady>[0]
type OpenState = Parameters<typeof shouldOpenContext>[0]

function openState(overrides: Partial<OpenState> = {}): OpenState {
  return {
    signedIn: true,
    groupId: 'group-1',
    nodeId: 'node-1',
    ready: false,
    busy: false,
    failedKey: null,
    ...overrides,
  }
}

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

describe('Automatic session opening', () => {
  it('opens the selected group on the required node', () => {
    expect(shouldOpenContext(openState())).toBe(true)
  })

  it('waits for a signed-in user, a group and a node', () => {
    expect(shouldOpenContext(openState({ signedIn: false }))).toBe(false)
    expect(shouldOpenContext(openState({ groupId: '' }))).toBe(false)
    expect(shouldOpenContext(openState({ nodeId: null }))).toBe(false)
  })

  it('opens once instead of on every state change', () => {
    expect(shouldOpenContext(openState({ busy: true }))).toBe(false)
    expect(shouldOpenContext(openState({ ready: true }))).toBe(false)
  })

  it('does not open the same pair again after a failure', () => {
    const failedKey = contextKey('node-1', 'group-1')
    expect(shouldOpenContext(openState({ failedKey }))).toBe(false)
  })

  it('opens the next group after a failure', () => {
    const failedKey = contextKey('node-1', 'group-1')
    expect(shouldOpenContext(openState({ failedKey, groupId: 'group-2' }))).toBe(true)
    expect(shouldOpenContext(openState({ failedKey, nodeId: 'node-2' }))).toBe(true)
  })
})
