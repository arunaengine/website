import { computed, createSSRApp, defineComponent, h, ref, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NO_MANAGEMENT_NODE_MESSAGE, type CreateOnboardingSecretResponse } from '@/lib/api'
import type { DeviceWatch } from '@/composables/useDeviceEnrollment'

const ENROLL_URL = 'aruna://enroll?secret=ab%2Bcd%2Fef%3D&seed=https%3A%2F%2Fnode.test&realm=R1'

const PassThrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const InputStub = defineComponent((_, { attrs }) => () => h('input', attrs))
const SelectStub = defineComponent((_, { attrs }) => () => h('select', attrs))
// Prints the value it was handed, so the test sees what the QR encodes.
const QrStub = defineComponent((props: { value: string }) => () => h('div', props.value), {
  props: ['value'],
})

const currentUser = ref<{ user_id: string } | null>({ user_id: 'u1@R1' })
const isManagementNode = ref(true)
const minted = ref<CreateOnboardingSecretResponse | null>(null)
const mintError = ref<string | null>(null)
const noManagementNode = ref(false)
const deviceCount = ref(0)
const deviceLimit = ref<number | null>(null)
const watchState = ref<DeviceWatch>({ phase: 'idle', enrollmentId: null, nodeId: null, lastError: null })

vi.mock('@/composables/useAruna', () => ({
  useAruna: () => ({
    currentUser,
    isManagementNode,
    realmInfo: ref({ nodes: [] }),
    apiBaseUrl: ref('https://node.test/api/v1'),
  }),
}))

vi.mock('@/composables/useDeviceEnrollment', () => ({
  useDeviceEnrollment: () => ({
    minting: ref(false),
    mintError,
    noManagementNode,
    minted,
    watch: watchState,
    deviceCount,
    deviceLimit,
    atCap: computed(() => deviceLimit.value != null && deviceCount.value >= deviceLimit.value),
    loadDevices: vi.fn(),
    mint: vi.fn(),
    startWatch: vi.fn(),
    resetWatch: vi.fn(),
  }),
}))

let DeviceLane: Component

beforeAll(async () => {
  // SecretPanel arms its countdown through window timers, which the node test
  // environment has only under globalThis.
  vi.stubGlobal('window', globalThis)
  for (const path of ['Tabs', 'TabsList', 'TabsTrigger', 'TabsContent', 'Button']) {
    vi.doMock(`@/components/ui/${path}.vue`, () => ({ default: PassThrough }))
  }
  vi.doMock('@/components/ui/Input.vue', () => ({ default: InputStub }))
  vi.doMock('@/components/ui/Select.vue', () => ({ default: SelectStub }))
  vi.doMock('@/components/onboarding/QrCode.vue', () => ({ default: QrStub }))
  vi.doMock('vue-router', () => ({ RouterLink: PassThrough, useRouter: () => ({ push: vi.fn() }) }))
  DeviceLane = (await import('./DeviceLane.vue')).default
})

beforeEach(() => {
  currentUser.value = { user_id: 'u1@R1' }
  isManagementNode.value = true
  minted.value = null
  mintError.value = null
  noManagementNode.value = false
  deviceCount.value = 0
  deviceLimit.value = null
  watchState.value = { phase: 'idle', enrollmentId: null, nodeId: null, lastError: null }
})

function enrollment(over: Partial<CreateOnboardingSecretResponse> = {}): CreateOnboardingSecretResponse {
  return {
    onboarding_secret: 'S3CRET-VALUE',
    mode: 'User',
    expires_at: 4102444800,
    enroll_url: ENROLL_URL,
    ...over,
  }
}

// Markup escaping is the renderer's, not the lane's: undo it so an assertion
// about the deep link sees the percent-encoding the backend produced.
function decode(markup: string): string {
  return markup.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
}

async function html(step: number): Promise<string> {
  return decode(await renderToString(createSSRApp({ render: () => h(DeviceLane, { step }) })))
}

async function text(step: number): Promise<string> {
  return (await html(step)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

describe('device lane gates', () => {
  it('asks an anonymous visitor to sign in', async () => {
    currentUser.value = null
    expect(await text(1)).toContain('Sign in to enroll a device')
  })

  it('offers the form on a node that is not a management node', async () => {
    // The mint is relayed, so the lane attempts it instead of refusing first.
    isManagementNode.value = false
    expect(await text(1)).toContain('Enroll this device')
  })

  it('points at a management node when none answered the mint', async () => {
    noManagementNode.value = true
    mintError.value = NO_MANAGEMENT_NODE_MESSAGE
    const rendered = await text(1)
    expect(rendered).toContain(NO_MANAGEMENT_NODE_MESSAGE)
    expect(rendered).toContain('This node does not enroll devices')
  })
})

describe('device details step', () => {
  it('shows the cap as used of allowed', async () => {
    deviceCount.value = 2
    deviceLimit.value = 3
    expect(await text(1)).toContain('2 of 3 devices')
  })

  it('says the realm caps nothing when it does not', async () => {
    deviceCount.value = 2
    expect(await text(1)).toContain('this realm sets no device limit')
  })

  it('surfaces a refusal at the cap', async () => {
    deviceCount.value = 3
    deviceLimit.value = 3
    mintError.value = 'Device cap reached. This realm allows 3 per user.'
    const rendered = await text(1)
    expect(rendered).toContain('Device cap reached')
    expect(rendered).toContain('Remove one under Settings')
  })
})

describe('device hand-off step', () => {
  it('hands the deep link to the anchor unchanged', async () => {
    // enroll_url is opaque: re-encoding its query would break the claim.
    minted.value = enrollment()
    expect(await html(2)).toContain(`href="${ENROLL_URL}"`)
  })

  it('encodes the same deep link in the qr code', async () => {
    minted.value = enrollment()
    expect(await text(2)).toContain(ENROLL_URL)
  })

  it('says so when the node returned no deep link', async () => {
    minted.value = enrollment({ enroll_url: null })
    expect(await text(2)).toContain('no deep link')
  })

  it('offers all four hand-off routes with the real code', async () => {
    minted.value = enrollment()
    const rendered = await text(2)
    for (const tab of ['Open in Aruna Desktop', 'QR', 'Paste', 'Headless env']) {
      expect(rendered).toContain(tab)
    }
    expect(rendered).toContain('S3CRET-VALUE')
    expect(rendered).toContain('ONBOARDING_SECRET=S3CRET-VALUE')
    expect(rendered).toContain('STORAGE_PATH=/data')
  })
})

describe('hand-off inside the desktop app', () => {
  let inShell: Component

  beforeAll(async () => {
    // The desktop context is read once per module graph, so the lane is
    // imported again with the shell's global in place.
    vi.resetModules()
    Object.assign(globalThis, { __ARUNA_DESKTOP__: { apiBaseUrl: '/api/v1' } })
    inShell = (await import('./DeviceLane.vue')).default
  })

  it('enrolls this computer instead of emitting a link', async () => {
    minted.value = enrollment()
    const markup = decode(await renderToString(createSSRApp({ render: () => h(inShell, { step: 2 }) })))

    expect(markup).not.toContain(`href="${ENROLL_URL}"`)
    expect(markup).toContain('Enroll this device now')
    expect(markup).toContain('already runs in Aruna Desktop')
  })
})

describe('device watch step', () => {
  it('waits on the claim before the join', async () => {
    watchState.value = { phase: 'pending', enrollmentId: 'enr-1', nodeId: null, lastError: null }
    const rendered = await text(3)
    expect(rendered).toContain('Waiting for the device to claim the code')
    expect(rendered).toContain('Joining the realm')
  })

  it('reports the joined device', async () => {
    watchState.value = { phase: 'present', enrollmentId: 'enr-1', nodeId: 'node-abcdef123456', lastError: null }
    const rendered = await text(3)
    expect(rendered).toContain('Claimed by the device')
    expect(rendered).toContain('Joined the realm')
    expect(rendered).toContain('Enroll another device')
  })

  it('reports an expired code as a failed claim', async () => {
    watchState.value = { phase: 'expired', enrollmentId: 'enr-1', nodeId: null, lastError: null }
    const rendered = await text(3)
    expect(rendered).toContain('The code expired before any device claimed it')
    expect(rendered).toContain('Start over')
  })
})
