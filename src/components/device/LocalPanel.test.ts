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
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const Notice = compileClientComponent(new URL('../ui/Notice.vue', import.meta.url), {
  vue: VueRuntime,
  '@/lib/utils': Utils,
})

const LocalPanel = compileClientComponent(new URL('./LocalPanel.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Notice.vue': moduleDefault(Notice),
  '@/components/ui/Switch.vue': moduleDefault(SwitchStub),
  '@/composables/useAruna': {
    useAruna: () => ({
      nodeInfo: VueRuntime.computed(() => ({ services: { interfaces: { s3: { url: s3Url.value } } } })),
    }),
  },
  '@/lib/desktopBridge': {
    nodeSettings: async () => stored.value,
    setNodeSettings,
    pickDirectory: async () => null,
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
  it('names the endpoint the node is serving', async () => {
    const mounted = await mountApp(LocalPanel)
    const html = content(mounted.root)

    expect(html).toContain('Local S3 endpoint')
    expect(html).toContain('serves you an S3 endpoint on this machine')
    expect(html).toContain('restarts the node')
    expect(html).toContain('http://127.0.0.1:34118')
    expect(html).not.toContain('Start with the app')
    expect(toggle(mounted.root).props.checked).toBe(true)
    mounted.app.unmount()
  })

  it('saves the flag the owner turned off', async () => {
    const mounted = await mountApp(LocalPanel)

    await click(toggle(mounted.root))
    expect(toggle(mounted.root).props.checked).toBe(false)
    expect(setNodeSettings).not.toHaveBeenCalled()

    await click(button(mounted.root, 'Save settings'))
    expect(setNodeSettings).toHaveBeenCalledWith(expect.objectContaining({ s3Enabled: false }))
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('shows no URL while the node reports none', async () => {
    // A restart leaves the node without an announced endpoint for a moment.
    s3Url.value = null
    const mounted = await mountApp(LocalPanel)

    expect(content(mounted.root)).not.toContain('127.0.0.1')
    expect(toggle(mounted.root).props.checked).toBe(true)
    mounted.app.unmount()
  })

  it('hides the URL when the endpoint is off', async () => {
    stored.value = { ...stored.value, s3Enabled: false }
    const mounted = await mountApp(LocalPanel)

    expect(toggle(mounted.root).props.checked).toBe(false)
    expect(content(mounted.root)).not.toContain('127.0.0.1')
    mounted.app.unmount()
  })
})
