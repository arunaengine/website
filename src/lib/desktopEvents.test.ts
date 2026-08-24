import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EnrollInvite } from './desktopEvents'

type Emit = (payload: unknown) => void

let emit: Emit = () => {}
const unlisten = vi.fn()

// The bridge is read from the desktop context, a module singleton, so every
// case boots a graph of its own around the shell it wants.
async function load(injected: unknown, listen?: unknown) {
  vi.resetModules()
  vi.stubGlobal('window', { __ARUNA_DESKTOP__: injected })
  vi.doMock('@tauri-apps/api/event', () => {
    if (listen === undefined) throw new Error('the Tauri event channel is absent')
    return { listen }
  })
  return await import('./desktopEvents')
}

function channel() {
  return vi.fn(async (_event: string, handler: (event: { payload: unknown }) => void) => {
    emit = (payload: unknown) => handler({ payload })
    return unlisten
  })
}

function shell(bridge = true) {
  return { apiBaseUrl: '/api/v1', ...(bridge ? { bridge: { invoke: vi.fn(), version: 1 } } : {}) }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.doUnmock('@tauri-apps/api/event')
})

describe('enroll invites', () => {
  it('subscribes to the shell event', async () => {
    const listen = channel()
    const events = await load(shell(), listen)
    const seen: EnrollInvite[] = []

    const stop = await events.onEnrollInvite((invite) => seen.push(invite))
    expect(listen).toHaveBeenCalledWith('enroll-invite', expect.any(Function))
    emit({ seed: ' https://seed.test ', realm: 'R1', applied: true })

    expect(seen).toEqual([{ seed: 'https://seed.test', realm: 'R1', applied: true, error: null }])
    stop?.()
    expect(unlisten).toHaveBeenCalled()
  })

  it('reads a failed invitation as not applied', async () => {
    // A refused enrollment must never read as a joined one.
    const events = await load(shell(), channel())
    const seen: EnrollInvite[] = []

    await events.onEnrollInvite((invite) => seen.push(invite))
    emit({ applied: 'yes', error: 'the code expired' })
    emit('nonsense')

    expect(seen).toEqual([
      { seed: null, realm: null, applied: false, error: 'the code expired' },
      { seed: null, realm: null, applied: false, error: null },
    ])
  })

  it('answers null when there is no channel to listen on', async () => {
    // Outside the shell, and inside one whose event API cannot be reached.
    const web = await load(undefined, channel())
    await expect(web.onEnrollInvite(() => {})).resolves.toBeNull()

    const absent = await load(shell())
    await expect(absent.onEnrollInvite(() => {})).resolves.toBeNull()

    const refused = await load(shell(), vi.fn(async () => Promise.reject(new Error('not allowed'))))
    await expect(refused.onEnrollInvite(() => {})).resolves.toBeNull()
  })
})
