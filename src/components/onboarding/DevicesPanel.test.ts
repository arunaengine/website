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

vi.mock('@/composables/useAruna', () => ({
  useAruna: () => ({ currentUser, realmInfo: ref({ nodes: [{ node_id: 'node-1' }] }) }),
}))

vi.mock('@/composables/useDeviceEnrollment', () => ({
  useDeviceEnrollment: () => ({
    devices,
    devicesError,
    busyIds: ref(new Set<string>()),
    deviceCount: computed(() => devices.value.length),
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

    expect(rendered).toContain('enrolled')
    expect(rendered).toContain('pending')
    expect(rendered).toContain('enrolled devices do not expire')
    expect(rendered).toContain('Remove')
  })

  it('counts enrollments in flight against the cap', async () => {
    // An outstanding code takes a slot on the backend, so the count must not
    // only tally devices that already joined.
    devices.value = [device(), device({ id: 'enr-1', node_id: null, enrollment_id: 'enr-1', status: 'pending' })]
    deviceLimit.value = 3

    expect(await text()).toContain('2 of 3 devices')
  })

  it('says the realm caps nothing when it does not', async () => {
    devices.value = [device()]
    expect(await text()).toContain('1 enrolled')
  })

  it('states what removing an enrolled device costs', async () => {
    expect(await text()).toContain('disconnects it from the realm')
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
