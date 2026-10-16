import * as VueRuntime from 'vue'
import { defineComponent, h, reactive, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp, typeValue } from '@/test/clientRender'
import * as StorageRules from '@/lib/storageRules'
import * as Utils from '@/lib/utils'

const putGroupRouting = vi.fn()
// The shared live check runs for real; only its request is a stand-in.
const { checkProviderBucket } = vi.hoisted(() => ({ checkProviderBucket: vi.fn() }))
vi.mock('@/lib/api', async (original) => ({ ...(await original<object>()), checkProviderBucket }))
vi.mock('@/composables/useAruna', async () => {
  const { ref } = await import('vue')
  return { useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('bearer') }) }
})
const BucketCheck = await import('@/composables/useBucketCheck')
const { ApiError } = await import('@/lib/api')
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
  '@/composables/useBucketCheck': BucketCheck,
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
  checkProviderBucket.mockReset().mockRejectedValue(new ApiError(404, 'Not Found'))
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

  it('offers to move files only when the group has buckets', async () => {
    putGroupRouting.mockResolvedValue({ group_id: 'g1', warnings: [] })
    const none = await mount()
    expect(content(none.root)).not.toContain('Move files already stored')
    none.app.unmount()

    const mounted = await mount({ hasBuckets: true })
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

  describe('bucket check', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    async function typed(name: string) {
      const mounted = await mount()
      await typeValue(bucketInput(mounted.root), name)
      await vi.advanceTimersByTimeAsync(400)
      await flush()
      return mounted
    }

    it('names an existing bucket the keys can write to', async () => {
      checkProviderBucket.mockResolvedValue({ bucket: 'lab-main', exists: true, writable: true })
      const mounted = await typed('lab-main')

      expect(checkProviderBucket).toHaveBeenLastCalledWith('g1', 's1', 'lab-main', expect.anything())
      expect(content(mounted.root)).toContain('Existing bucket. Aruna can write here.')
      expect(content(mounted.root)).toContain('Aruna keeps its own layout there and never reads it back.')
      mounted.app.unmount()
    })

    it('warns about an existing bucket the keys cannot write to and still saves', async () => {
      checkProviderBucket.mockResolvedValue({ bucket: 'lab-main', exists: true, writable: false })
      const mounted = await typed('lab-main')
      const note = element(mounted.root, (node) => node.tag === 'span' && content(node).includes('cannot write'))

      expect(content(note)).toBe('Existing bucket. These keys cannot write here.')
      expect(String(note.props.class)).toContain('text-amber-700')
      expect(button(mounted.root, 'Use as default').props.disabled).toBe(false)
      mounted.app.unmount()
    })

    it('names a bucket Aruna will create', async () => {
      checkProviderBucket.mockResolvedValue({ bucket: 'lab-new', exists: false, writable: null })
      const mounted = await typed('lab-new')

      expect(content(mounted.root)).toContain('New bucket. Aruna creates it.')
      mounted.app.unmount()
    })

    it('keeps the neutral text when the node cannot check', async () => {
      const mounted = await typed('lab-main')

      expect(checkProviderBucket).toHaveBeenCalled()
      expect(content(mounted.root)).toContain('Aruna creates the bucket if it is missing.')
      expect(content(mounted.root)).not.toContain('Existing bucket')
      mounted.app.unmount()
    })
  })
})
