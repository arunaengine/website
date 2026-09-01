import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import * as Utils from '@/lib/utils'
import { button, click, compileClientComponent, content, element, moduleDefault, mountApp, typeValue } from '@/test/clientRender'

const identity = ref<{ nodeId: string; realm: string } | null>({ nodeId: 'node-1', realm: 'realm-1' })
const loaded = ref(true)
const status = ref<Record<string, unknown> | null>({ enrolled: true, nodeId: null })
const calls: string[] = []
const apiRequest = vi.fn(async () => { calls.push('realm') })
const wipeDevice = vi.fn(async () => { calls.push('local') })

const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const InputStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () => h('input', {
    ...attrs,
    value: props.modelValue,
    onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
  }),
})
const PassThrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const EmptyStub = defineComponent(() => () => null)

const WipePanel = compileClientComponent(new URL('./WipePanel.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(PassThrough),
  '@/composables/useAruna': { useAruna: () => ({ apiBaseUrl: ref('/api/v1'), authToken: ref('token') }) },
  '@/composables/useDeviceStatus': { useDeviceStatus: () => ({ identity, loaded, status }) },
  '@/lib/api': { ...Api, apiRequest },
  '@/lib/desktopBridge': { wipeDevice },
  '@/lib/utils': Utils,
})

beforeEach(() => {
  identity.value = { nodeId: 'node-1', realm: 'realm-1' }
  loaded.value = true
  status.value = { enrolled: true, nodeId: null }
  calls.length = 0
  apiRequest.mockClear()
  wipeDevice.mockClear()
})

async function confirmWipe() {
  const mounted = await mountApp(WipePanel)
  await typeValue(element(mounted.root, (node) => node.tag === 'input'), 'wipe')
  await click(button(mounted.root, 'Wipe device'))
  return mounted
}

describe('WipePanel', () => {
  it('evicts the realm device before wiping it locally', async () => {
    const mounted = await confirmWipe()

    expect(apiRequest).toHaveBeenCalledWith('/access/users/me/devices/node-1', { method: 'DELETE' }, {
      baseUrl: '/api/v1',
      token: 'token',
    })
    expect(calls).toEqual(['realm', 'local'])
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('does not wipe an enrolled device while its realm identity is unavailable', async () => {
    identity.value = null
    const mounted = await confirmWipe()

    expect(apiRequest).not.toHaveBeenCalled()
    expect(wipeDevice).not.toHaveBeenCalled()
    expect(content(mounted.root)).toContain('The realm could not identify this device')
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })
})
