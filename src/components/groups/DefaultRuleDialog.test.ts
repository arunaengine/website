import * as VueRuntime from 'vue'
import { defineComponent, h, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp, typeValue } from '@/test/clientRender'
import * as StorageRules from '@/lib/storageRules'
import * as Utils from '@/lib/utils'

const putGroupRouting = vi.fn()
const onSaved = vi.fn()

const Slot = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const SwitchStub = defineComponent({
  props: { checked: Boolean },
  emits: ['update:checked'],
  setup: (props, { attrs, emit }) => () => h('button', { ...attrs, onClick: () => emit('update:checked', !props.checked) }),
})
const InputStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }),
})

const DefaultRuleDialog = compileClientComponent(new URL('./DefaultRuleDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Dialog.vue': moduleDefault(Slot),
  '@/components/ui/DialogContent.vue': moduleDefault(Slot),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slot),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slot),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slot),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slot),
  '@/components/ui/DialogClose.vue': moduleDefault(Slot),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(Slot),
  '@/components/ui/Switch.vue': moduleDefault(SwitchStub),
  '@/composables/useAruna': { useAruna: () => ({ putGroupRouting, saving: ref(false), sessionEpoch: ref(0) }) },
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled: ref(false) }) },
  '@/lib/storageRules': StorageRules,
  '@/lib/utils': Utils,
})

const STORAGE = {
  backend_id: 's1',
  group_id: 'g1',
  kind: 's3',
  name: 'lab-object-store',
  public_config: { endpoint: 'https://s3.lab.example' },
}
const LINK = {
  import_id: 'i1', backend_id: 's1', backend_prefix: 'lab-raw/', bucket: 'sequencing', key_prefix: '', created_at: '',
}

const onOpen = vi.fn()

async function mount(extra: Record<string, unknown> = {}) {
  const state = reactive({
    open: false, groupId: 'g1', groupName: 'Lab Group', backend: STORAGE, links: [LINK], onSaved,
    'onUpdate:open': onOpen, ...extra,
  })
  const mounted = await mountApp(defineComponent(() => () => h(DefaultRuleDialog, state)))
  state.open = true
  await flush()
  return { ...mounted, state }
}

function bucketInput(root: Parameters<typeof content>[0]) {
  return element(root, (node) => node.tag === 'input' && String(node.props.id).endsWith('-bucket'))
}

beforeEach(() => {
  putGroupRouting.mockReset()
  onSaved.mockReset()
  onOpen.mockReset()
})

describe('DefaultRuleDialog', () => {
  it('suggests a bucket and saves it with the storage as default', async () => {
    putGroupRouting.mockResolvedValue({ group_id: 'g1', warnings: [] })
    const mounted = await mount()
    expect(bucketInput(mounted.root).props.value).toBe('aruna-lab-group-default')
    const form = element(mounted.root, (node) => node.tag === 'form')
    await (form.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {} })
    await flush()

    expect(putGroupRouting).toHaveBeenCalledWith('g1', { backend_id: 's1' }, 'aruna-lab-group-default')
    expect(onSaved).toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('offers to move files only when some are misplaced', async () => {
    putGroupRouting.mockResolvedValue({ group_id: 'g1', warnings: [] })
    const none = await mount()
    expect(content(none.root)).not.toContain('Move files already stored')
    none.app.unmount()

    const mounted = await mount({ misplaced: 4 })
    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Move files already stored'))
    const form = element(mounted.root, (node) => node.tag === 'form')
    await (form.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {} })
    await flush()
    expect(onSaved).toHaveBeenCalledWith(true)
    mounted.app.unmount()
  })

  it('refuses a linked bucket and a bad name', async () => {
    const mounted = await mount()
    await typeValue(bucketInput(mounted.root), 'lab-raw')
    expect(content(mounted.root)).toContain('Bucket lab-raw is linked to sequencing (whole bucket).')
    expect(button(mounted.root, 'Use as default').props.disabled).toBe(true)
    await typeValue(bucketInput(mounted.root), 'Lab_Raw')
    expect(content(mounted.root)).toContain('Use lowercase letters')
    expect(button(mounted.root, 'Use as default').props.disabled).toBe(true)
    mounted.app.unmount()
  })

  it('keeps a newer draft when an earlier save answers late', async () => {
    let fail: (err: unknown) => void = () => {}
    putGroupRouting.mockReturnValueOnce(new Promise((_, reject) => (fail = reject)))
    const mounted = await mount()
    const form = element(mounted.root, (node) => node.tag === 'form')
    void (form.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {} })
    await flush()
    mounted.state.open = false
    await flush()
    mounted.state.open = true
    await flush()
    await typeValue(bucketInput(mounted.root), 'lab-second')
    fail(new Error('No access to bucket'))
    await flush()

    expect(content(mounted.root)).not.toContain('No access to bucket')
    expect(onOpen).not.toHaveBeenCalledWith(false)
    expect(bucketInput(mounted.root).props.value).toBe('lab-second')
    mounted.app.unmount()
  })
})
