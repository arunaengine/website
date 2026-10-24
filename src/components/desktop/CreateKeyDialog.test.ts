import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Utils from '@/lib/utils'
import { button, click, compileClientComponent, content, flush, input, moduleDefault, mountApp, typeValue } from '@/test/clientRender'

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

  it('makes the key on the node it is handed, even with this computer down', async () => {
    available.value = false
    const onNode = vi.fn().mockResolvedValue({ access_key_id: 'AKN1', access_secret: 'node-secret' })
    const onCreated = vi.fn()
    const mounted = await mountApp(CreateKeyDialog, { props: { open: true, create: onNode, onCreated } })

    await typeValue(input(mounted.root, 'aria-label', 'Key name'), 'Lab server backup')
    await click(button(mounted.root, 'Create key'))

    expect(onNode).toHaveBeenCalledWith('g1', 365 * 24 * 3600)
    expect(createKey).not.toHaveBeenCalled()
    expect(onCreated).toHaveBeenCalledWith({ accessKeyId: 'AKN1', secret: 'node-secret', name: 'Lab server backup' })
    mounted.app.unmount()
  })

  it('keeps a reopened dialog as it is when an earlier, closed one gets its answer', async () => {
    let answer!: (made: unknown) => void
    createKey.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    const open = ref(true)
    const onCreated = vi.fn()
    const host = defineComponent(() => () =>
      h(CreateKeyDialog, { open: open.value, 'onUpdate:open': (v: boolean) => (open.value = v), onCreated }),
    )
    const mounted = await mountApp(host)

    await typeValue(input(mounted.root, 'aria-label', 'Key name'), 'First')
    const first = click(button(mounted.root, 'Create key'))
    await flush()
    open.value = false
    await flush()
    open.value = true
    await flush()
    await typeValue(input(mounted.root, 'aria-label', 'Key name'), 'Second')
    answer({ access_key_id: 'ARKLATE', access_secret: 'late-secret' })
    await first

    expect(open.value).toBe(true)
    expect(onCreated).not.toHaveBeenCalled()
    expect(input(mounted.root, 'aria-label', 'Key name').props.value).toBe('Second')
    expect(button(mounted.root, 'Create key').props.disabled).toBe(false)
    expect(stored).toEqual({ ARKLATE: 'First' })
    mounted.app.unmount()
  })

  it('hands up the saved name of a key that answers after a cancel, never its secret', async () => {
    let answer!: (made: unknown) => void
    createKey.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    const open = ref(true)
    const onCreated = vi.fn()
    const onNamed = vi.fn()
    const host = defineComponent(() => () =>
      h(CreateKeyDialog, { open: open.value, 'onUpdate:open': (v: boolean) => (open.value = v), onCreated, onNamed }),
    )
    const mounted = await mountApp(host)

    await typeValue(input(mounted.root, 'aria-label', 'Key name'), 'Cancelled')
    const first = click(button(mounted.root, 'Create key'))
    await flush()
    open.value = false
    await flush()
    answer({ access_key_id: 'ARKCANCEL', access_secret: 'cancel-secret' })
    await first

    expect(onNamed).toHaveBeenCalledWith({ accessKeyId: 'ARKCANCEL', name: 'Cancelled' })
    expect(JSON.stringify(onNamed.mock.calls)).not.toContain('cancel-secret')
    expect(onCreated).not.toHaveBeenCalled()
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
