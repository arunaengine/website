import { readFileSync } from 'node:fs'
import { computed, createSSRApp, defineComponent, h, ref, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserDevice } from '@/lib/api'

const PassThrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))

const currentUser = ref<{ user_id: string } | null>({ user_id: 'u1@R1' })
const devices = ref<UserDevice[]>([])
const devicesError = ref<string | null>(null)
const deviceLimit = ref<number | null>(null)
const revoke = vi.fn()
const realmInfo = ref<{ nodes: Record<string, unknown>[] }>({ nodes: [] })

vi.mock('@/composables/useAruna', () => ({
  useAruna: () => ({ currentUser, realmInfo }),
}))

vi.mock('@/composables/useDeviceEnrollment', () => ({
  useDeviceEnrollment: () => ({
    devices,
    devicesError,
    busyIds: ref(new Set<string>()),
    deviceCount: computed(() => devices.value.filter((device) => device.status !== 'expired').length),
    deviceLimit,
    loadingDevices: ref(false),
    loadDevices: vi.fn(),
    revoke,
  }),
}))

let DevicesPanel: Component

beforeAll(async () => {
  // SecretsTable arms its countdown clock through window timers.
  vi.stubGlobal('window', globalThis)
  vi.doMock('@/components/ui/Button.vue', () => ({ default: PassThrough }))
  vi.doMock('@/components/onboarding/DeviceLane.vue', () => ({ default: PassThrough }))
  vi.doMock('vue-router', () => ({ RouterLink: PassThrough }))
  DevicesPanel = (await import('./DevicesPanel.vue')).default
})

beforeEach(() => {
  currentUser.value = { user_id: 'u1@R1' }
  devices.value = []
  devicesError.value = null
  deviceLimit.value = null
  realmInfo.value = { nodes: [{ node_id: 'node-1' }] }
})

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

async function text(): Promise<string> {
  const html = await renderToString(createSSRApp({ render: () => h(DevicesPanel) }))
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

describe('devices panel', () => {
  it('separates an enrolled device from an enrollment in flight', async () => {
    devices.value = [
      device(),
      device({ id: 'enr-1', node_id: null, enrollment_id: 'enr-1', status: 'pending', expires_at: 4102444800 }),
    ]
    const rendered = await text()

    // Without a realm record its contact is not known, which is not the same as offline.
    expect(rendered).toContain('Unknown')
    expect(rendered).not.toContain('offline')
    expect(rendered).toContain('Pending')
    expect(rendered).toContain('Remove')
  })

  it('counts enrollments in flight against the cap', async () => {
    // An outstanding code takes a slot on the backend, so the count must not
    // only tally devices that already joined.
    devices.value = [device(), device({ id: 'enr-1', node_id: null, enrollment_id: 'enr-1', status: 'pending' })]
    deviceLimit.value = 3

    expect(await text()).toContain('Your devices 2 of 3')
  })

  it('shows but does not count expired enrollments', async () => {
    devices.value = [device(), device({ id: 'enr-old', node_id: null, status: 'expired' })]
    deviceLimit.value = 2

    const rendered = await text()
    expect(rendered).toContain('Expired')
    expect(rendered).toContain('Your devices 1 of 2')
  })

  it('names a device by its label and shows when it was last seen', async () => {
    realmInfo.value = {
      nodes: [{ node_id: '73ea340a1234', connection_status: 'connected', last_seen_ms: Date.now() - 120_000, info: { labels: { device: 'Microbiology laptop' } } }],
    }
    devices.value = [device({ id: '73ea340a1234', node_id: '73ea340a1234' }), device({ id: 'enr-9abcdef12', node_id: null, status: 'pending' })]
    const rendered = await text()

    expect(rendered).toContain('Name Enrollment id Status Last seen')
    // The id stays in its own column; the name column never falls back to it.
    expect(rendered).toContain('Microbiology laptop 73ea340a1234 Online 2m ago')
    expect(rendered).toContain('enr-9abc enr-9abcdef12 Pending -')
  })

  it('lists the enrollment id of each device with a copy button', async () => {
    devices.value = [
      device({ id: 'node-1234567890abcdef', node_id: 'node-1234567890abcdef' }),
      device({ id: 'enr-1', node_id: null, enrollment_id: 'enr-1', status: 'pending', expires_at: 4102444800 }),
    ]
    const html = await renderToString(createSSRApp({ render: () => h(DevicesPanel) }))

    expect(html).toContain('Enrollment id')
    expect(html).toContain('title="node-1234567890abcdef"')
    expect(html).toContain('enr-1')
    expect(html.match(/aria-label="Copy enrollment id"/g)?.length).toBe(2)
  })

  it('reads a device the realm has seen as online, and one without contact as offline', async () => {
    realmInfo.value = {
      nodes: [
        { node_id: 'seen1234abcd', connection_status: 'seen', present: false, last_seen_ms: Date.now() - 300_000 },
        { node_id: 'quiet234abcd', connection_status: 'unknown', present: false },
      ],
    }
    devices.value = [device({ id: 'seen1234abcd', node_id: 'seen1234abcd' }), device({ id: 'quiet234abcd', node_id: 'quiet234abcd' })]
    const rendered = await text()

    expect(rendered).toContain('Online 5m ago')
    expect(rendered).toContain('Offline -')
    expect(rendered).not.toContain('Unknown')
  })

  it('names a device by its realm display name first', async () => {
    realmInfo.value = { nodes: [{ node_id: '73ea340a1234', connection_status: 'seen', display_name: 'Lab laptop', info: { labels: { device: 'Microbiology laptop' } } }] }
    devices.value = [device({ id: '73ea340a1234', node_id: '73ea340a1234' })]
    const rendered = await text()

    expect(rendered).toContain('Lab laptop 73ea340a1234 Online')
    expect(rendered).not.toContain('Microbiology laptop')
  })

  it('lets the owner rename an enrolled device, not an enrollment still in flight', async () => {
    realmInfo.value = { nodes: [{ node_id: '73ea340a1234', connection_status: 'seen', display_name: 'Lab laptop' }] }
    devices.value = [device({ id: '73ea340a1234', node_id: '73ea340a1234' }), device({ id: 'enr-9abcdef12', node_id: null, status: 'pending' })]
    const html = await renderToString(createSSRApp({ render: () => h(DevicesPanel) }))

    expect(html).toContain('aria-label="Rename Lab laptop"')
    expect(html.match(/aria-label="Rename /g)).toHaveLength(1)
  })

  it('gives an unnamed enrolled device a name for people, not just its id', async () => {
    realmInfo.value = { nodes: [{ node_id: '73ea340a1234', kind: 'user', connection_status: 'seen' }] }
    devices.value = [device({ id: '73ea340a1234', node_id: '73ea340a1234' }), device({ id: '5b1c9d2e7777', node_id: '5b1c9d2e7777' })]
    const rendered = await text()

    expect(rendered).toContain('Device 73ea340a1234 Online')
    // Not listed by the realm yet: still a device, never a bare id.
    expect(rendered).toContain('Device 5b1c9d2e7777 Unknown')
  })

  it('says the realm caps nothing when it does not', async () => {
    devices.value = [device()]
    expect(await text()).toContain('Your devices 1 Add a device')
  })

  it('states what removing a device costs before it is removed', () => {
    const source = readFileSync(new URL('./DevicesPanel.vue', import.meta.url), 'utf8')
    expect(source).toContain("row.status === 'pending' ? 'Its code stops working.' : 'It has to be enrolled again.'")
  })

  it('offers an empty account nothing to remove', async () => {
    expect(await text()).toContain('No devices on your account yet')
  })

  it('surfaces a refusal over the list', async () => {
    devicesError.value = 'Refused. Managing devices needs an unrestricted token'
    expect(await text()).toContain('unrestricted token')
  })

  it('asks an anonymous visitor to sign in', async () => {
    currentUser.value = null
    const rendered = await text()

    expect(rendered).toContain('Sign in to see the devices')
    expect(rendered).not.toContain('No devices on your account yet')
  })
})
