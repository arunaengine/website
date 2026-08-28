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
  flush,
  moduleDefault,
  mountApp,
} from '@/test/clientRender'

const status = ref<{
  message: string | null
  detail?: string | null
  realmMismatch?: { expected: string; actual: string; realmUrl: string } | null
}>({ message: null, detail: null, realmMismatch: null })
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

const FactList = compileClientComponent(new URL('../ui/FactList.vue', import.meta.url), { vue: VueRuntime })
const Notice = compileClientComponent(new URL('../ui/Notice.vue', import.meta.url), {
  vue: VueRuntime,
  '@/lib/utils': Utils,
})
const Spinner = compileClientComponent(new URL('../ui/Spinner.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/lib/utils': Utils,
})

const NodeDown = compileClientComponent(new URL('./NodeDown.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: RouterLinkStub },
  '@lucide/vue': icons,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/FactList.vue': moduleDefault(FactList),
  '@/components/ui/Notice.vue': moduleDefault(Notice),
  '@/components/ui/Spinner.vue': moduleDefault(Spinner),
  '@/composables/useDeviceStatus': { useDeviceStatus: () => ({ status, state, refresh }) },
  '@/lib/desktopBridge': { setNodeSettings },
  '@/lib/utils': Utils,
})

beforeEach(() => {
  status.value = { message: null, detail: null, realmMismatch: null }
  state.value = 'stopped'
  refresh.mockReset().mockResolvedValue(undefined)
  setNodeSettings.mockReset().mockResolvedValue({})
})

describe('node down page', () => {
  it('uses the state-specific supervisor detail', async () => {
    const mounted = await mountApp(NodeDown)

    expect(content(mounted.root)).toContain("This computer's node is not running.")
    expect(content(mounted.root)).toContain('Aruna Desktop needs its node to work.')

    state.value = 'error'
    status.value = { message: 'The node stopped.', detail: 'The node process exited with code 1.' }
    await flush()

    expect(content(mounted.root)).toContain("This computer's node failed.")
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

  it('explains a recreated realm and links directly to the wipe section', async () => {
    const mismatch = {
      expected: '01K4EXPECTEDREALMID',
      actual: '01K4ACTUALREALMID',
      realmUrl: 'https://realm.example',
    }
    status.value = {
      message: 'The enrolled realm no longer matches.',
      detail: 'The realm at https://realm.example reports a different realm id.',
      realmMismatch: mismatch,
    }
    const mounted = await mountApp(NodeDown)

    expect(content(mounted.root)).toContain('The realm was recreated')
    expect(content(mounted.root)).toContain('Realmhttps://realm.example')
    expect(content(mounted.root)).toContain('Expected realm01K4EXPECTEDREALMID')
    expect(content(mounted.root)).toContain('Actual realm01K4ACTUALREALMID')
    expect(content(mounted.root)).toContain("This computer's data belongs to the old realm.")
    expect(content(mounted.root)).not.toContain('Start the node')
    expect(
      element(mounted.root, (node) => node.tag === 'code' && node.props.title === mismatch.expected).props.class,
    ).toContain('truncate')
    expect(
      element(mounted.root, (node) => node.tag === 'code' && node.props.title === mismatch.actual).props.class,
    ).toContain('font-mono')
    const link = element(
      mounted.root,
      (node) => node.tag === 'a' && content(node).trim() === 'Wipe this device and set it up again',
    )
    expect(JSON.parse(String(link.props['data-to']))).toEqual({ name: 'device', query: { section: 'wipe' } })
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
