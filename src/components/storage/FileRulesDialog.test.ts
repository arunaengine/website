import * as VueRuntime from 'vue'
import { defineComponent, h, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp, typeValue } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as FileRules from '@/lib/fileRules'
import * as Utils from '@/lib/utils'

const getFileRules = vi.fn()
const previewFileRules = vi.fn()
const saveFileRules = vi.fn()

const Slot = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
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
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const FileRulesDialog = compileClientComponent(new URL('./FileRulesDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/components/ui/Dialog.vue': moduleDefault(Slot),
  '@/components/ui/DialogContent.vue': moduleDefault(Slot),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slot),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slot),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slot),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slot),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(Slot),
  '@/components/ui/Spinner.vue': moduleDefault(Slot),
  '@/composables/useAruna': {
    isUnsupportedEndpoint: () => false,
    useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('bearer'), sessionEpoch: ref(0) }),
  },
  '@/lib/api': { ...Api, getFileRules, previewFileRules, saveFileRules },
  '@/lib/fileRules': FileRules,
  '@/lib/utils': Utils,
})

const RULE = { pattern: '*.faa.gz', folder: 'proteins/' }
const PAGE = { files: [{ path: 'raw/a.faa.gz', key: 'proteins/a.faa.gz', outcome: 'matched' }] }

async function mount() {
  const state = reactive({ open: true, groupId: 'g1', link: { import_id: 'i1' } })
  const mounted = await mountApp(defineComponent(() => () => h(FileRulesDialog, state)))
  await flush()
  if (mounted.errors.length) throw mounted.errors[0]
  return { ...mounted, state }
}

function pattern(root: Parameters<typeof content>[0]) {
  return element(root, (node) => node.tag === 'input' && node.props['aria-label'] === 'File name')
}

function deferred() {
  let resolve: (value: unknown) => void = () => {}
  const promise = new Promise((done) => (resolve = done))
  return { promise, resolve }
}

beforeEach(() => {
  getFileRules.mockReset()
  previewFileRules.mockReset()
  saveFileRules.mockReset()
  getFileRules.mockResolvedValue({ rules: [{ ...RULE }] })
})

describe('FileRulesDialog', () => {
  it('ignores a preview of rules edited while it ran', async () => {
    const answer = deferred()
    previewFileRules.mockReturnValueOnce(answer.promise)
    const { root } = await mount()
    const pending = click(button(root, 'Show where files go'))
    await typeValue(pattern(root), '*.fna.gz')
    answer.resolve(PAGE)
    await pending

    expect(content(root)).not.toContain('proteins/a.faa.gz')
    expect(button(root, 'Save').props.disabled).toBe(true)
  })

  it('reports no save for rules edited while saving', async () => {
    const answer = deferred()
    previewFileRules.mockResolvedValue(PAGE)
    saveFileRules.mockReturnValueOnce(answer.promise)
    const { root } = await mount()
    await click(button(root, 'Show where files go'))
    const pending = click(button(root, 'Save'))
    await typeValue(pattern(root), '*.fna.gz')
    answer.resolve(undefined)
    await pending

    expect(content(root)).not.toContain('Saved.')
  })

  it('can preview again after reopening during a request', async () => {
    previewFileRules.mockReturnValueOnce(new Promise(() => {}))
    const { root, state } = await mount()
    void click(button(root, 'Show where files go'))
    await flush()
    state.open = false
    await flush()
    state.open = true
    await flush()

    expect(button(root, 'Show where files go').props.disabled).toBe(false)
  })

  it('needs the stored rules before a save', async () => {
    getFileRules.mockRejectedValueOnce(new Error('offline'))
    const { root } = await mount()

    expect(button(root, 'Show where files go').props.disabled).toBe(true)
    expect(button(root, 'Save').props.disabled).toBe(true)
    await click(button(root, 'Try again'))
    expect(getFileRules).toHaveBeenCalledTimes(2)
    expect(button(root, 'Show where files go').props.disabled).toBe(false)
    expect(content(root)).not.toContain('Try again')
  })

  it('blocks preview and save for a half filled rule', async () => {
    previewFileRules.mockResolvedValue(PAGE)
    const { root } = await mount()
    await click(button(root, 'Show where files go'))
    await click(button(root, 'Add a name'))
    await typeValue(
      element(root, (node) => node.tag === 'input' && node.props['aria-label'] === 'File name' && node.props.value === ''),
      '*.txt',
    )

    expect(content(root)).toContain('Add a folder.')
    expect(button(root, 'Show where files go').props.disabled).toBe(true)
    expect(button(root, 'Save').props.disabled).toBe(true)
  })

  it('calls counts partial while more files wait', async () => {
    previewFileRules.mockResolvedValueOnce({ ...PAGE, next: 'n1' })
    const { root } = await mount()
    await click(button(root, 'Show where files go'))
    expect(content(root)).toContain('Shown so far: 1 sorted')

    previewFileRules.mockResolvedValueOnce({ files: [], next: null })
    await click(button(root, 'Show more'))
    expect(content(root)).not.toContain('Shown so far')
  })
})
