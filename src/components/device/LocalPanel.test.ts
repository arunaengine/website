import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Utils from '@/lib/utils'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  moduleDefault,
  mountApp,
  type HostNode,
} from '@/test/clientRender'

interface Local {
  storagePath: string
  paused: boolean
  s3Enabled: boolean
  compute: Record<string, unknown>
}

const stored = ref<Local>({
  storagePath: '/home/me/aruna',
  paused: false,
  s3Enabled: true,
  compute: {},
})
const s3Url = ref<string | null>('http://127.0.0.1:34118')
const pickDirectory = vi.fn(async (): Promise<string | null> => null)
const setNodeSettings = vi.fn(async (patch: Partial<Local>) => ({ ...stored.value, ...patch }))

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const SwitchStub = defineComponent({
  inheritAttrs: false,
  props: { checked: Boolean },
  emits: ['update:checked'],
  setup: (props, { attrs, emit }) => () =>
    h('button', { ...attrs, checked: props.checked, onClick: () => emit('update:checked', !props.checked) }),
})
const plain = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('div', attrs, slots.default?.()),
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const Notice = compileClientComponent(new URL('../ui/Notice.vue', import.meta.url), {
  vue: VueRuntime,
  '@/lib/utils': Utils,
})

const LocalPanel = compileClientComponent(new URL('./LocalPanel.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/CopyButton.vue': moduleDefault(plain),
  'vue-router': { RouterLink: plain },
  '@/components/ui/Notice.vue': moduleDefault(Notice),
  '@/components/ui/Switch.vue': moduleDefault(SwitchStub),
  '@/composables/useDeviceStatus': { useDeviceStatus: () => ({ s3Url, refresh: async () => {} }) },
  '@/lib/desktopBridge': {
    nodeSettings: async () => stored.value,
    setNodeSettings,
    pickDirectory,
  },
  '@/lib/utils': Utils,
})

function toggle(root: HostNode): HostNode {
  return element(root, (node) => node.props['aria-label'] === 'Local S3 endpoint')
}

beforeEach(() => {
  stored.value = {
    storagePath: '/home/me/aruna',
    paused: false,
    s3Enabled: true,
    compute: {},
  }
  s3Url.value = 'http://127.0.0.1:34118'
  setNodeSettings.mockClear()
})

describe('the local S3 endpoint', () => {
  it('names the address the node is serving', async () => {
    const mounted = await mountApp(LocalPanel)
    const html = content(mounted.root)

    expect(html).toContain('Connect your tools')
    expect(html).toContain('http://127.0.0.1:34118')
    expect(html).toContain('Open Access & connection')
    expect(toggle(mounted.root).props.checked).toBe(true)
    mounted.app.unmount()
  })

  it('saves the flag the owner turned off at once', async () => {
    const mounted = await mountApp(LocalPanel)

    await click(toggle(mounted.root))

    expect(setNodeSettings).toHaveBeenCalledWith({ s3Enabled: false })
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('shows no address while the node reports none', async () => {
    // A restart leaves the node without an announced endpoint for a moment.
    s3Url.value = null
    const mounted = await mountApp(LocalPanel)

    expect(content(mounted.root)).not.toContain('127.0.0.1')
    expect(content(mounted.root)).toContain('once it is running')
    mounted.app.unmount()
  })

  it('hides the address when the endpoint is off', async () => {
    stored.value = { ...stored.value, s3Enabled: false }
    const mounted = await mountApp(LocalPanel)

    expect(toggle(mounted.root).props.checked).toBe(false)
    expect(content(mounted.root)).not.toContain('127.0.0.1')
    expect(content(mounted.root)).toContain('The address is off')
    mounted.app.unmount()
  })
})

describe('the storage folder', () => {
  it('waits for a yes before it moves Aruna to another folder', async () => {
    pickDirectory.mockResolvedValueOnce('/data/aruna')
    const mounted = await mountApp(LocalPanel)

    await click(button(mounted.root, 'Change'))
    expect(setNodeSettings).not.toHaveBeenCalled()
    expect(content(mounted.root)).toContain('/data/aruna')

    await click(button(mounted.root, 'Use this folder'))
    expect(setNodeSettings).toHaveBeenCalledWith({ storagePath: '/data/aruna' })
    mounted.app.unmount()
  })

  it('drops a chosen folder the owner cancels', async () => {
    pickDirectory.mockResolvedValueOnce('/data/aruna')
    const mounted = await mountApp(LocalPanel)

    await click(button(mounted.root, 'Change'))
    await click(button(mounted.root, 'Cancel'))

    expect(setNodeSettings).not.toHaveBeenCalled()
    expect(content(mounted.root)).not.toContain('/data/aruna')
    mounted.app.unmount()
  })
})
