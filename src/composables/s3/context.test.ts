import { describe, expect, it } from 'vitest'
import { contextKey, shouldOpenContext } from './context'

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
