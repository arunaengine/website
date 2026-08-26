import { createSSRApp, h, ref } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RealmInfoResponse, UserDevice } from '@/lib/api'

const PAGE_ORIGIN = 'https://portal.test'
const ENROLL_URL = 'aruna://enroll?secret=abc%2Bdef%3D&seed=https%3A%2F%2Fnode.test&realm=R1'

const realmInfo = ref<RealmInfoResponse | null>(null)
const loadInfo = vi.fn(async () => {})

vi.mock('@/composables/useAruna', () => ({
  useAruna: () => ({
    apiBaseUrl: ref('https://node.test/api/v1'),
    authToken: ref('token'),
    realmInfo,
    loadInfo,
  }),
}))

const { useDeviceEnrollment } = await import('@/composables/useDeviceEnrollment')

interface Call {
  url: string
  method: string
  body: string | null
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, statusText: String(status) })
}

function serve(handler: (url: string, method: string) => Response): Call[] {
  const calls: Call[] = []
  vi.stubGlobal('window', { location: { origin: PAGE_ORIGIN } })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL, init: RequestInit = {}) => {
      const method = (init.method ?? 'GET').toUpperCase()
      calls.push({ url: String(input), method, body: (init.body as string | null) ?? null })
      return handler(String(input), method)
    }),
  )
  return calls
}

function device(over: Partial<UserDevice> = {}): UserDevice {
  return {
    id: 'node-1',
    node_id: 'node-1',
    enrollment_id: null,
    status: 'enrolled',
    expires_at: null,
    ...over,
  }
}

function realm(nodeIds: string[], maxDevices: number | null = null): RealmInfoResponse {
  return {
    nodes: nodeIds.map((node_id) => ({ node_id })),
    quota: { max_devices_per_user: maxDevices },
  } as unknown as RealmInfoResponse
}

// The composable registers onUnmounted, so it must run inside a real setup.
async function mount() {
  let api!: ReturnType<typeof useDeviceEnrollment>
  await renderToString(
    createSSRApp({
      setup() {
        api = useDeviceEnrollment()
        return () => h('div')
      },
    }),
  )
  return api
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  realmInfo.value = null
  loadInfo.mockClear()
})

describe('device mint', () => {
  it('takes the enrollment id the mint returned', async () => {
    // The minted id is the handle the status route takes; the device list must
    // not be consulted to guess one.
    const other = device({ id: 'enr-old', node_id: null, enrollment_id: 'enr-old', status: 'pending', expires_at: 1800 })
    serve((url, method) => {
      if (url.endsWith('/users/me/devices')) return json({ devices: [other] })
      if (method === 'POST') {
        return json(
          { onboarding_secret: 'S3CRET', enrollment_id: 'enr-new', mode: 'User', expires_at: 1800 },
          201,
        )
      }
      return json({}, 404)
    })

    const { mint } = await mount()
    await expect(mint(1800)).resolves.toMatchObject({ enrollmentId: 'enr-new' })
  })

  it('recovers the enrollment id from the device list', async () => {
    // Fallback for a node that names no enrollment: the status poll then
    // depends on matching the new pending entry by its exact expiry.
    const pending = device({ id: 'enr-new', node_id: null, enrollment_id: 'enr-new', status: 'pending', expires_at: 1800 })
    const stale = device({ id: 'enr-old', node_id: null, enrollment_id: 'enr-old', status: 'pending', expires_at: 900 })
    let minted = false
    const calls = serve((url, method) => {
      if (url.endsWith('/users/me/devices')) return json({ devices: minted ? [stale, pending] : [stale] })
      if (method === 'POST') {
        minted = true
        return json({ onboarding_secret: 'S3CRET', mode: 'User', expires_at: 1800, enroll_url: ENROLL_URL }, 201)
      }
      return json({}, 404)
    })

    const { mint } = await mount()
    const result = await mint(1800)

    expect(result.enrollmentId).toBe('enr-new')
    expect(result.response.enroll_url).toBe(ENROLL_URL)
    const post = calls.find((call) => call.method === 'POST')
    expect(post?.url).toBe(`${PAGE_ORIGIN}/api/v1/admin/onboarding/secrets`)
    expect(JSON.parse(post?.body ?? '{}')).toEqual({ seed_url: '', mode: 'User', expires_in_seconds: 1800 })
  })

  it('explains a refusal at the device cap', async () => {
    realmInfo.value = realm([], 2)
    serve((url, method) => {
      if (url.endsWith('/users/me/devices')) return json({ devices: [device(), device({ id: 'node-2', node_id: 'node-2' })] })
      if (method === 'POST') return json({ message: 'device cap reached' }, 409)
      return json({}, 404)
    })

    const { mint, mintError, atCap, deviceCount } = await mount()
    await expect(mint(1800)).rejects.toThrow()

    expect(deviceCount.value).toBe(2)
    expect(atCap.value).toBe(true)
    expect(mintError.value).toContain('Device cap reached')
    expect(mintError.value).toContain('2 per user')
  })

  it('names the token restriction behind a refusal', async () => {
    serve((url, method) => {
      if (url.endsWith('/users/me/devices')) return json({ devices: [] })
      if (method === 'POST') return json({ message: 'forbidden' }, 403)
      return json({}, 404)
    })

    const { mint, mintError } = await mount()
    await expect(mint(1800)).rejects.toThrow()

    expect(mintError.value).toContain('unrestricted token')
    expect(mintError.value).toContain('management node')
    expect(mintError.value).toContain('the node in use is https://node.test')
  })
})

describe('claim watch', () => {
  it('walks pending to claimed to present', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T00:00:00Z'))
    const expiresAt = Date.now() / 1000 + 600
    let claimed = false
    serve((url) => {
      if (url.includes('/onboarding/secrets/enr-1/status')) {
        return json({
          enrollment_id: 'enr-1',
          mode: 'User',
          owner: 'u1@R1',
          status: claimed ? 'claimed' : 'pending',
          claimed_node_id: claimed ? 'node-9' : null,
          expires_at: expiresAt,
        })
      }
      return json({ devices: [] })
    })

    const { startWatch, watch } = await mount()
    startWatch('enr-1', expiresAt)
    await vi.advanceTimersByTimeAsync(0)
    expect(watch.value.phase).toBe('pending')

    claimed = true
    await vi.advanceTimersByTimeAsync(5000)
    expect(watch.value.phase).toBe('claimed')
    expect(watch.value.nodeId).toBe('node-9')

    realmInfo.value = realm(['node-9'])
    await vi.advanceTimersByTimeAsync(5000)
    expect(watch.value.phase).toBe('present')
  })

  it('settles a pruned enrollment from the device list', async () => {
    // The record is deleted once enrollment completes, so the status route 404s
    // exactly when the device has landed.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T00:00:00Z'))
    let landed = false
    serve((url) => {
      if (url.includes('/status')) return json({ message: 'not found' }, 404)
      return json({ devices: landed ? [device({ id: 'node-7', node_id: 'node-7' })] : [] })
    })

    const { startWatch, watch } = await mount()
    startWatch('enr-1', Date.now() / 1000 + 600)
    await vi.advanceTimersByTimeAsync(0)
    expect(watch.value.phase).toBe('pending')

    landed = true
    await vi.advanceTimersByTimeAsync(5000)
    expect(watch.value.phase).toBe('present')
    expect(watch.value.nodeId).toBe('node-7')
  })

  it('gives up once the secret outlives its expiry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T00:00:00Z'))
    serve((url) => {
      if (url.includes('/status')) {
        return json({
          enrollment_id: 'enr-1',
          mode: 'User',
          owner: null,
          status: 'expired',
          claimed_node_id: null,
          expires_at: Date.now() / 1000,
        })
      }
      return json({ devices: [] })
    })

    const { startWatch, watch } = await mount()
    startWatch('enr-1', Date.now() / 1000 + 60)
    await vi.advanceTimersByTimeAsync(0)

    expect(watch.value.phase).toBe('expired')
  })
})

describe('device removal', () => {
  it('drops the row it removed', async () => {
    let removed = false
    const calls = serve((url, method) => {
      if (method === 'DELETE') {
        removed = true
        return new Response(null, { status: 204 })
      }
      return json({ devices: removed ? [] : [device()] })
    })

    const { loadDevices, revoke, devices, devicesError } = await mount()
    await loadDevices()
    expect(devices.value).toHaveLength(1)

    await revoke('node-1')

    expect(devices.value).toHaveLength(0)
    expect(devicesError.value).toBeNull()
    expect(calls.some((call) => call.method === 'DELETE' && call.url.endsWith('/users/me/devices/node-1'))).toBe(true)
  })

  it('keeps a refusal visible after the list reloads', async () => {
    serve((url, method) => {
      if (method === 'DELETE') return json({ message: 'forbidden' }, 403)
      return json({ devices: [device()] })
    })

    const { revoke, devicesError, devices } = await mount()
    await revoke('node-1')

    expect(devices.value).toHaveLength(1)
    expect(devicesError.value).toContain('unrestricted token')
  })

  it('treats an already gone device as removed', async () => {
    serve((url, method) => {
      if (method === 'DELETE') return json({ message: 'not found' }, 404)
      return json({ devices: [] })
    })

    const { revoke, devicesError } = await mount()
    await revoke('node-1')

    expect(devicesError.value).toBeNull()
  })
})
