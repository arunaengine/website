import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  flush,
  moduleDefault,
  mountApp,
} from '@/test/clientRender'

const status = ref<{ message: string | null; detail?: string | null }>({ message: null, detail: null })
const state = ref<'stopped' | 'error'>('stopped')
const refresh = vi.fn(async () => undefined)
const setNodeSettings = vi.fn()

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const RouterLinkStub = defineComponent({
  props: { to: { type: [String, Object], required: true } },
  setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()),
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const NodeDown = compileClientComponent(new URL('./NodeDown.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: RouterLinkStub },
  '@lucide/vue': icons,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/composables/useDeviceStatus': { useDeviceStatus: () => ({ status, state, refresh }) },
  '@/lib/desktopBridge': { setNodeSettings },
})

beforeEach(() => {
  status.value = { message: null, detail: null }
  state.value = 'stopped'
  refresh.mockReset().mockResolvedValue(undefined)
  setNodeSettings.mockReset().mockResolvedValue({})
})

describe('node down page', () => {
  it('uses the state-specific supervisor detail', async () => {
    const mounted = await mountApp(NodeDown)

    expect(content(mounted.root)).toContain("This device's node is not running.")
    expect(content(mounted.root)).toContain('Aruna Desktop needs its node to work.')

    state.value = 'error'
    status.value = { message: 'The node stopped.', detail: 'The node process exited with code 1.' }
    await flush()

    expect(content(mounted.root)).toContain("This device's node failed.")
    expect(content(mounted.root)).toContain('The node process exited with code 1.')
    expect(element(mounted.root, (node) => node.tag === 'a').props['data-to']).toContain('device')
    mounted.app.unmount()
  })

  it('clears the pause, stays busy, and refreshes the status', async () => {
    let settle = () => {}
    setNodeSettings.mockImplementationOnce(
      () => new Promise((resolve) => {
        settle = () => resolve({})
      }),
    )
    const mounted = await mountApp(NodeDown)

    const pending = click(button(mounted.root, 'Start the node'))
    await flush()

    expect(setNodeSettings).toHaveBeenCalledWith({ paused: false })
    expect(button(mounted.root, 'Starting…').props.disabled).toBe(true)

    settle()
    await pending

    expect(refresh).toHaveBeenCalledOnce()
    expect(content(mounted.root)).toContain('Start the node')
    mounted.app.unmount()
  })

  it('shows a start failure inline', async () => {
    setNodeSettings.mockRejectedValueOnce(new Error('The supervisor refused to start.'))
    const mounted = await mountApp(NodeDown)

    await click(button(mounted.root, 'Start the node'))

    expect(content(mounted.root)).toContain('The supervisor refused to start.')
    expect(refresh).not.toHaveBeenCalled()
    mounted.app.unmount()
  })
})
