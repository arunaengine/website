import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, element, flush, moduleDefault, mountApp, typeValue } from '@/test/clientRender'
import * as BucketNaming from '@/lib/bucketNaming'
import * as StorageRules from '@/lib/storageRules'
import * as Utils from '@/lib/utils'

const putGroupRouting = vi.fn()
const Slot = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const InputStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', { ...attrs, value: props.modelValue, onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value) }),
})
const SelectStub = defineComponent({
  props: { modelValue: { type: String, default: '' }, ariaLabel: String },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h('select', { 'aria-label': props.ariaLabel, value: props.modelValue, onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value) }),
})

const Dialog = compileClientComponent(new URL('./NewBucketsDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Dialog.vue': moduleDefault(Slot),
  '@/components/ui/DialogClose.vue': moduleDefault(Slot),
  '@/components/ui/DialogContent.vue': moduleDefault(Slot),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slot),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slot),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slot),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slot),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(Slot),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/composables/useAruna': { useAruna: () => ({ putGroupRouting, sessionEpoch: ref(0) }) },
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled: ref(false) }) },
  '@/lib/bucketNaming': BucketNaming,
  '@/lib/storageRules': StorageRules,
  '@/lib/utils': Utils,
})

const SPIRE = { backend_id: 's1', group_id: 'g1', kind: 's3', name: 'spire', public_config: { endpoint: 'https://s3' } }
type Root = Parameters<typeof content>[0]
const field = (root: Root, label: string) => element(root, (node) => node.props['aria-label'] === label)
const save = (root: Root) => element(root, (node) => node.tag === 'button' && node.props.type === 'submit')

async function mount(routing: Record<string, unknown>) {
  const open = ref(false)
  const mounted = await mountApp(
    defineComponent(() => () =>
      h(Dialog, { open: open.value, groupId: 'g1', groupName: 'spire', backends: [SPIRE], routing: { group_id: 'g1', warnings: [], ...routing }, links: [] }),
    ),
  )
  open.value = true
  await flush()
  return mounted
}

async function submit(root: Root) {
  const form = element(root, (node) => node.tag === 'form')
  await (form.props.onSubmit as (event: { preventDefault(): void }) => Promise<void>)({ preventDefault() {} })
  await flush()
}

beforeEach(() => {
  putGroupRouting.mockReset().mockResolvedValue({})
})

describe('NewBucketsDialog', () => {
  it('saves a changed template without keys and checks it first', async () => {
    const { root } = await mount({ default_target: { backend_id: 's1' }, bucket_template: 'aruna-spire-{bucket}' })
    expect(content(root)).toContain('Example: new bucket samples → aruna-spire-samples')
    expect(save(root).props.disabled).toBe(true)

    await typeValue(field(root, 'S3 bucket template'), 'aruna-{group}')
    expect(content(root)).toContain('Needs {bucket}, so each bucket gets its own S3 bucket.')
    expect(save(root).props.disabled).toBe(true)

    await typeValue(field(root, 'S3 bucket template'), 'lab-{group}-{bucket}')
    expect(content(root)).toContain('After saving: new bucket samples → lab-spire-samples')
    await submit(root)
    expect(putGroupRouting).toHaveBeenCalledWith('g1', { backend_id: 's1' }, undefined, 'lab-{group}-{bucket}')
  })

  it('clears the template when one shared bucket is saved', async () => {
    const { root } = await mount({ default_target: { backend_id: 's1' }, bucket: 'aruna-spire-default' })
    await typeValue(field(root, 'Shared S3 bucket'), 'aruna-spire-shared')
    await submit(root)
    expect(putGroupRouting).toHaveBeenCalledWith('g1', { backend_id: 's1' }, 'aruna-spire-shared', '')
  })

  it('sends new buckets back to Aruna storage', async () => {
    const { root } = await mount({ default_target: { backend_id: 's1' } })
    await typeValue(field(root, 'Storage'), 'aruna')
    expect(content(root)).toContain('After saving: new bucket samples → Aruna storage')
    await submit(root)
    expect(putGroupRouting).toHaveBeenCalledWith('g1', null)
  })
})
