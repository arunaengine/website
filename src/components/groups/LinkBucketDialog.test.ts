import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, element, flush, moduleDefault, mountApp, typeValue } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as BucketNaming from '@/lib/bucketNaming'
import * as LinkedFolders from '@/lib/linkedFolders'
import * as StorageRules from '@/lib/storageRules'
import * as Utils from '@/lib/utils'

const createBackendImport = vi.fn()
const runBackendImport = vi.fn()
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

const Dialog = compileClientComponent(new URL('./LinkBucketDialog.vue', import.meta.url), {
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
  '@/composables/useAruna': { useAruna: () => ({ apiBaseUrl: ref('https://api'), authToken: ref('t'), sessionEpoch: ref(0) }) },
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled: ref(false) }) },
  '@/lib/api': { ...Api, createBackendImport, runBackendImport },
  '@/lib/bucketNaming': BucketNaming,
  '@/lib/linkedFolders': LinkedFolders,
  '@/lib/storageRules': StorageRules,
  '@/lib/utils': Utils,
})

const SPIRE = { backend_id: 's1', group_id: 'g1', kind: 's3', name: 'spire', public_config: { endpoint: 'https://s3' } }
const LINKED = { import_id: 'i1', backend_id: 's1', backend_prefix: 'lab-old/', bucket: 'old', key_prefix: '', created_at: '' }
type Root = Parameters<typeof content>[0]
const byId = (root: Root, suffix: string) =>
  element(root, (node) => node.tag === 'input' && String(node.props.id ?? '').endsWith(suffix))
const save = (root: Root) => element(root, (node) => node.tag === 'button' && node.props.type === 'submit')

async function mount() {
  const open = ref(false)
  const events: unknown[] = []
  const mounted = await mountApp(
    defineComponent(() => () =>
      h(Dialog, { open: open.value, groupId: 'g1', backend: SPIRE, links: [LINKED], onSaved: (error?: string) => events.push(error) }),
    ),
  )
  open.value = true
  await flush()
  return { ...mounted, events }
}

async function submit(root: Root) {
  const form = element(root, (node) => node.tag === 'form')
  await (form.props.onSubmit as (event: { preventDefault(): void }) => Promise<void>)({ preventDefault() {} })
  await flush()
}

beforeEach(() => {
  createBackendImport.mockReset().mockResolvedValue({ import_id: 'i2' })
  runBackendImport.mockReset().mockResolvedValue({ job_id: 'j' })
})

describe('LinkBucketDialog', () => {
  it('links the S3 bucket to an Aruna bucket of the same name and starts the first sync', async () => {
    const { root, events } = await mount()
    expect(save(root).props.disabled).toBe(true)
    await typeValue(byId(root, '-s3'), 'lab-raw')
    await typeValue(byId(root, '-folder'), 'runs')
    expect(content(root)).toContain('After linking: lab-raw/runs/ ⇆ Aruna bucket lab-raw')
    await submit(root)
    expect(createBackendImport).toHaveBeenCalledWith(
      'g1',
      { backend_id: 's1', backend_prefix: 'lab-raw/runs/', bucket: 'lab-raw', key_prefix: '', write_pattern: '{dir}{name}' },
      expect.anything(),
    )
    expect(runBackendImport).toHaveBeenCalledWith('g1', 'i2', expect.anything())
    expect(events).toEqual([undefined])
  })

  it('refuses an Aruna bucket another link uses', async () => {
    const { root } = await mount()
    await typeValue(byId(root, '-s3'), 'lab-new')
    await typeValue(byId(root, '-aruna'), 'old')
    expect(content(root)).toContain('overlaps')
    expect(save(root).props.disabled).toBe(true)
  })

  it('keeps the link when the first sync does not start', async () => {
    runBackendImport.mockRejectedValue(new Error('busy node'))
    const { root, events } = await mount()
    await typeValue(byId(root, '-s3'), 'lab-raw')
    await submit(root)
    expect(String(events[0])).toContain('Linked, but the first sync did not start')
  })
})
