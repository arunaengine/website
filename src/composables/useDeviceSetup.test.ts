import { createSSRApp, h, ref } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeviceWatch } from '@/composables/useDeviceEnrollment'

const REALM = 'https://aruna.example'
const ENROLL_URL = 'aruna://enroll?secret=ab%2Bcd%2Fef%3D&seed=https%3A%2F%2Fnode.test&realm=R1'

const entries = new Map<string, string>()
const state = ref<DeviceWatch>({ phase: 'idle', enrollmentId: null, nodeId: null, lastError: null })
const mintError = ref<string | null>(null)
const mint = vi.fn()
const startWatch = vi.fn()
const resetWatch = vi.fn()
const enrollApply = vi.fn()
const nodeStatus = vi.fn()

vi.mock('@/composables/useDeviceEnrollment', () => ({
  WATCH_INTERVAL_MS: 5_000,
  useDeviceEnrollment: () => ({
    minting: ref(false),
    mintError,
    watch: state,
    mint,
    startWatch,
    resetWatch,
  }),
}))

vi.mock('@/lib/desktopBridge', () => ({ enrollApply, nodeStatus }))

let setup: typeof import('./useDeviceSetup').useDeviceSetup
let welcome: typeof import('@/lib/desktopWelcome')

beforeAll(async () => {
  vi.stubGlobal('window', {
    __ARUNA_DESKTOP__: { apiBaseUrl: '/api/v1', realmUrl: REALM },
    localStorage: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => void entries.set(key, value),
      removeItem: (key: string) => void entries.delete(key),
    },
  })
  setup = (await import('./useDeviceSetup')).useDeviceSetup
  welcome = await import('@/lib/desktopWelcome')
})

beforeEach(() => {
  entries.clear()
  vi.clearAllMocks()
  state.value = { phase: 'idle', enrollmentId: null, nodeId: null, lastError: null }
  mintError.value = null
  nodeStatus.mockResolvedValue({ enrolled: false })
})

afterEach(() => {
  vi.useRealTimers()
})

// useDeviceEnrollment registers onUnmounted, so the composable needs an instance.
async function mounted() {
  let api!: ReturnType<typeof setup>
  await renderToString(createSSRApp({ setup: () => ((api = setup()), () => h('div')) }))
  return api
}

describe('applying a setup', () => {
  it('records the enrollment it applied', async () => {
    mint.mockResolvedValue({ response: { enroll_url: ENROLL_URL, expires_at: 99 }, enrollmentId: 'enr-2' })
    const api = await mounted()

    await api.apply('work-laptop')

    expect(enrollApply).toHaveBeenCalledWith({
      secret: 'ab+cd/ef=',
      seedUrl: 'https://node.test',
      realm: 'R1',
      label: 'work-laptop',
    })
    expect(welcome.setupWatch()).toEqual({ enrollmentId: 'enr-2', expiresAt: 99 })
    expect(startWatch).toHaveBeenCalledWith('enr-2', 99)
    expect(api.watching.value).toBe(true)
    api.done()
  })

  it('keeps a failed apply on the form', async () => {
    mint.mockResolvedValue({ response: { enroll_url: null, expires_at: 99 }, enrollmentId: null })
    const api = await mounted()

    await api.apply('')

    expect(api.watching.value).toBe(false)
    expect(api.error.value).toContain('no enrollment link')
    expect(welcome.setupWatch()).toBeNull()
  })
})

describe('resuming a setup', () => {
  it('picks the watch back up after a reload', async () => {
    // The shell replaces the window once the node restarts; the form must not
    // come back and ask for the device again.
    welcome.setSetupWatch({ enrollmentId: 'enr-1', expiresAt: 42 })
    const api = await mounted()

    await api.resume()

    expect(api.watching.value).toBe(true)
    expect(startWatch).toHaveBeenCalledWith('enr-1', 42)
    expect(api.joined.value).toBe(false)
    api.done()
  })

  it('reads an enrolled node as joined', async () => {
    welcome.setSetupWatch({ enrollmentId: 'enr-1', expiresAt: 42 })
    nodeStatus.mockResolvedValue({ enrolled: true })
    const api = await mounted()

    await api.resume()
    expect(api.joined.value).toBe(true)
    api.done()
  })

  it('asks for the device with nothing on record', async () => {
    const api = await mounted()

    await api.resume()

    expect(api.watching.value).toBe(false)
    expect(startWatch).not.toHaveBeenCalled()
  })
})

describe('following the node', () => {
  it('completes on the enrollment the shell settled', async () => {
    // The shell spends the secret inside node_status alone, so the step must
    // keep asking while the realm side still shows the claim pending.
    vi.useFakeTimers()
    mint.mockResolvedValue({ response: { enroll_url: ENROLL_URL, expires_at: 99 }, enrollmentId: 'enr-3' })
    nodeStatus.mockResolvedValueOnce({ enrolled: false }).mockResolvedValue({ enrolled: true })
    const api = await mounted()

    await api.apply('')
    await vi.advanceTimersByTimeAsync(0)
    expect(api.joined.value).toBe(false)

    await vi.advanceTimersByTimeAsync(5_000)
    expect(nodeStatus).toHaveBeenCalledTimes(2)
    expect(api.joined.value).toBe(true)

    api.done()
    expect(welcome.setupWatch()).toBeNull()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(nodeStatus).toHaveBeenCalledTimes(2)
  })
})

describe('leaving the setup', () => {
  it('answers the prompt for this realm', async () => {
    welcome.setSetupWatch({ enrollmentId: 'enr-1', expiresAt: 42 })
    const api = await mounted()

    api.done()

    expect(welcome.setupWatch()).toBeNull()
    expect(welcome.setupSkipped()).toBe(true)
    expect(resetWatch).toHaveBeenCalled()
  })
})
