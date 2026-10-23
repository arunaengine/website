import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Utils from '@/lib/utils'
import { button, click, compileClientComponent, content, input, moduleDefault, mountApp, typeValue } from '@/test/clientRender'

const createKey = vi.fn()
const available = ref(true)
const myGroups = ref([{ id: 'g1', name: 'Lab group' }])
const stored: Record<string, string> = {}

const Passthrough = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const InputStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }),
})
const Empty = defineComponent(() => () => null)

const CreateKeyDialog = compileClientComponent(new URL('./CreateKeyDialog.vue', import.meta.url), {
  vue: VueRuntime,
  ...Object.fromEntries(
    ['Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle', 'DialogDescription', 'DialogFooter', 'DialogClose'].map(
      (name) => [`@/components/ui/${name}.vue`, moduleDefault(Passthrough)],
    ),
  ),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/RefusalNote.vue': moduleDefault(Passthrough),
  '@/components/ui/Select.vue': moduleDefault(Empty),
  '@/components/ui/Spinner.vue': moduleDefault(Empty),
  '@/composables/useAruna': { useAruna: () => ({ myGroups }) },
  '@/composables/useDeviceKeys': { useDeviceKeys: () => ({ available, create: createKey }) },
  '@/lib/keyNames': { rememberKeyName: (id: string, name: string) => (stored[id] = name) },
  '@/lib/utils': Utils,
})

beforeEach(() => {
  createKey.mockReset().mockResolvedValue({ access_key_id: 'ARK1', access_secret: 'secret' })
  available.value = true
  for (const id of Object.keys(stored)) delete stored[id]
})

describe('creating a key', () => {
  it('makes the key on the device and hands up the secret once', async () => {
    const onCreated = vi.fn()
    const mounted = await mountApp(CreateKeyDialog, { props: { open: true, onCreated } })

    await typeValue(input(mounted.root, 'aria-label', 'Key name'), ' Laptop tools ')
    await click(button(mounted.root, 'Create key'))

    expect(createKey).toHaveBeenCalledWith('g1', 365 * 24 * 3600)
    expect(onCreated).toHaveBeenCalledWith({ accessKeyId: 'ARK1', secret: 'secret', name: 'Laptop tools' })
    expect(stored).toEqual({ ARK1: 'Laptop tools' })
    mounted.app.unmount()
  })

  it('makes nothing while the node on this computer is not there', async () => {
    available.value = false
    const mounted = await mountApp(CreateKeyDialog, { props: { open: true } })

    await typeValue(input(mounted.root, 'aria-label', 'Key name'), 'Laptop tools')
    await click(button(mounted.root, 'Create key'))

    expect(createKey).not.toHaveBeenCalled()
    expect(content(mounted.root)).toContain('Aruna is not running on this computer')
    mounted.app.unmount()
  })

  it('shows the refusal and remembers no name when the node says no', async () => {
    createKey.mockRejectedValue(new Error('The group has no write access.'))
    const mounted = await mountApp(CreateKeyDialog, { props: { open: true } })

    await typeValue(input(mounted.root, 'aria-label', 'Key name'), 'Laptop tools')
    await click(button(mounted.root, 'Create key'))

    expect(stored).toEqual({})
    mounted.app.unmount()
  })
})
