import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthOpener } from '@/composables/useAuth'

type Handler = (command: string, args?: Record<string, unknown>) => unknown

let opener: AuthOpener | null = null
let invoke: ReturnType<typeof vi.fn>
const cancelSignIn = vi.fn()

vi.mock('@/composables/useAuth', () => ({
  cancelSignIn,
  setAuthOpener: (next: AuthOpener | null) => {
    opener = next
  },
}))
vi.mock('@/composables/useGlobalErrors', () => ({ reportGlobalError: vi.fn() }))

// The bridge is read from the desktop context, itself a module singleton: a
// fresh graph per case is what swaps the shell under test.
async function load(injected?: unknown) {
  vi.resetModules()
  opener = null
  cancelSignIn.mockClear()
  vi.stubGlobal('window', { __ARUNA_DESKTOP__: injected })
  return await import('./desktopBridge')
}

function withShell(handler: Handler) {
  invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => handler(command, args))
  return load({ apiBaseUrl: '/api/v1', bridge: { invoke, version: 1 } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('bridge availability', () => {
  it('refuses every command outside the shell', async () => {
    const bridge = await load()
    await expect(bridge.nodeStatus()).rejects.toBeInstanceOf(bridge.BridgeUnavailable)
  })

  it('refuses commands when the shell injected no bridge', async () => {
    const bridge = await load({ apiBaseUrl: '/api/v1' })
    await expect(bridge.pickDirectory()).rejects.toMatchObject({ command: 'pick_directory' })
  })

  it('reads an unregistered command as unavailable', async () => {
    // A shell shipped without a command half must not look like a failure.
    const bridge = await withShell(() => Promise.reject(new Error('unknown command: node_logs_tail')))
    await expect(bridge.nodeLogsTail()).rejects.toBeInstanceOf(bridge.BridgeUnavailable)
  })

  it('reports a refused command as a failure', async () => {
    const cause = new Error('the supervisor is not running')
    const bridge = await withShell(() => Promise.reject(cause))
    const failure = await bridge.nodeStatus().catch((err: unknown) => err)

    expect(failure).toBeInstanceOf(bridge.BridgeFailure)
    expect(failure).toMatchObject({ command: 'node_status', message: cause.message, cause })
  })

  it('rejects an answer of the wrong shape', async () => {
    const bridge = await withShell(() => 'running')
    await expect(bridge.nodeStatus()).rejects.toBeInstanceOf(bridge.BridgeFailure)
  })
})

describe('bridge commands', () => {
  it('normalizes the node status', async () => {
    // A shell that reports no readiness is not taken for one that is serving.
    const bridge = await withShell(() => ({
      state: 'sideways',
      nodeId: ' n1 ',
      enrolled: true,
      uptimeSeconds: 90,
      detail: ' supervisor exited ',
      realmMismatch: {
        expected: ' old-realm ',
        actual: ' new-realm ',
        realmUrl: ' https://realm.test ',
      },
    }))
    await expect(bridge.nodeStatus()).resolves.toEqual({
      state: 'error',
      nodeId: 'n1',
      realm: null,
      enrolled: true,
      enrolling: false,
      ready: false,
      apiBaseUrl: null,
      version: null,
      uptimeSeconds: 90,
      message: null,
      detail: 'supervisor exited',
      realmMismatch: {
        expected: 'old-realm',
        actual: 'new-realm',
        realmUrl: 'https://realm.test',
      },
    })
  })

  it('reads a node that is not listening yet', async () => {
    const bridge = await withShell(() => ({ state: 'running', enrolled: true, ready: false }))
    await expect(bridge.nodeStatus()).resolves.toMatchObject({ state: 'running', ready: false })

    const silent = await withShell(() => ({ state: 'running', enrolled: true }))
    await expect(silent.nodeStatus()).resolves.toMatchObject({ state: 'running', ready: false, realmMismatch: null })
  })

  it('reads a node that is redeeming a code', async () => {
    const bridge = await withShell(() => ({ state: 'starting', enrolling: true }))
    await expect(bridge.nodeStatus()).resolves.toMatchObject({ enrolled: false, enrolling: true })
  })

  it('takes the log tail in either answer shape', async () => {
    const asArray = await withShell(() => ['one', 2, 'three'])
    await expect(asArray.nodeLogsTail(50)).resolves.toEqual(['one', 'three'])
    expect(invoke).toHaveBeenCalledWith('node_logs_tail', { lines: 50 })

    const asRecord = await withShell(() => ({ lines: ['one'] }))
    await expect(asRecord.nodeLogsTail()).resolves.toEqual(['one'])
  })

  it('sends a settings patch under one key', async () => {
    const bridge = await withShell(() => ({ storagePath: '/data', paused: true }))
    await expect(bridge.setNodeSettings({ paused: true })).resolves.toEqual({
      storagePath: '/data',
      paused: true,
      s3Enabled: true,
      compute: {
        backend: 'auto',
        maxCpuCores: null,
        maxRamBytes: null,
        maxDiskBytes: null,
        maxConcurrent: null,
        keepFailed: false,
      },
    })
    expect(invoke).toHaveBeenCalledWith('node_settings_set', { settings: { paused: true } })
  })

  it('keeps the local S3 endpoint on unless it is denied', async () => {
    // Absent means on: the shell serves S3 by default.
    const off = await withShell(() => ({ storagePath: '/data', s3Enabled: false }))
    await expect(off.setNodeSettings({ s3Enabled: false })).resolves.toMatchObject({ s3Enabled: false })
    expect(invoke).toHaveBeenCalledWith('node_settings_set', { settings: { s3Enabled: false } })

    const absent = await withShell(() => ({ storagePath: '/data' }))
    await expect(absent.nodeSettings()).resolves.toMatchObject({ s3Enabled: true })
  })

  it('hands the enrollment over as one payload', async () => {
    const bridge = await withShell(() => ({ nodeId: 'n1', realm: 'R1' }))
    await expect(bridge.enrollApply({ secret: 'S3CRET', seedUrl: 'https://node.test' })).resolves.toEqual({
      nodeId: 'n1',
      realm: 'R1',
    })
    expect(invoke).toHaveBeenCalledWith('enroll_apply', { secret: 'S3CRET', seedUrl: 'https://node.test' })
  })

  it('reads back the realm the shell accepted', async () => {
    const bridge = await withShell(() => ({ origin: 'https://aruna.example', realm: 'R1', portal: true }))
    await expect(bridge.validateRealm(' aruna.example ')).resolves.toEqual({
      origin: 'https://aruna.example',
      realm: 'R1',
      apiVersion: null,
      portal: true,
      redirectedFrom: null,
    })
    expect(invoke).toHaveBeenCalledWith('validate_realm', { input: ' aruna.example ' })
  })

  it('carries a refused realm through as written', async () => {
    // The shell classifies the failure; the welcome view shows its wording.
    const refused = 'https://aruna.example refused the connection; nothing is listening there'
    const bridge = await withShell(() => Promise.reject(refused))
    await expect(bridge.validateRealm('aruna.example')).rejects.toMatchObject({ message: refused })
  })

  it('answers a shell holding no invitation with null', async () => {
    const bridge = await withShell(() => null)
    await expect(bridge.lastEnrollInvite()).resolves.toBeNull()
    expect(invoke).toHaveBeenCalledWith('enroll_invite_last', undefined)
  })

  it('normalizes the retained invitation', async () => {
    // The retained answer is the emitted event, so it is read the same way.
    const bridge = await withShell(() => ({ seed: ' https://seed.test ', applied: 'yes', error: 'the code expired' }))
    await expect(bridge.lastEnrollInvite()).resolves.toEqual({
      seed: 'https://seed.test',
      realm: null,
      applied: false,
      error: 'the code expired',
    })
  })

  it('answers a cancelled folder dialog with null', async () => {
    const bridge = await withShell(() => null)
    await expect(bridge.pickDirectory({ title: 'Storage' })).resolves.toBeNull()
  })

  it('echoes the wipe phrase the shell demands', async () => {
    const bridge = await withShell(() => null)
    await bridge.wipeDevice('wipe')
    expect(invoke).toHaveBeenCalledWith('wipe_device', { confirm: 'wipe' })
  })

  it('asks the shell to quit without arguments', async () => {
    const bridge = await withShell(() => null)
    await bridge.appQuit()
    expect(invoke).toHaveBeenCalledWith('app_quit', undefined)
  })
})

describe('system-browser auth', () => {
  it('opens the sign-in url outside the shell', async () => {
    const bridge = await withShell(() => null)
    bridge.installAuthOpener()
    opener?.('https://idp.test/authorize')
    await Promise.resolve()
    expect(invoke).toHaveBeenCalledWith('open_external', { url: 'https://idp.test/authorize' })
  })

  it('cancels sign-in when the shell cannot open it', async () => {
    const bridge = await withShell(() => Promise.reject(new Error('browser unavailable')))
    bridge.installAuthOpener()
    opener?.('https://idp.test/authorize')

    await vi.waitFor(() => expect(cancelSignIn).toHaveBeenCalledTimes(1))
  })

  it('installs no opener without a bridge', async () => {
    const bridge = await load({ apiBaseUrl: '/api/v1' })
    bridge.installAuthOpener()
    expect(opener).toBeNull()
  })
})
