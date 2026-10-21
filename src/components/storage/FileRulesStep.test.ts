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

const offline = ref(false)

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

const FileRulesStep = compileClientComponent(new URL('./FileRulesStep.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(Slot),
  '@/components/ui/Spinner.vue': moduleDefault(Slot),
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled: offline }) },
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
  const state = reactive({ groupId: 'g1', link: { import_id: 'i1' } })
  const mounted = await mountApp(defineComponent(() => () => h(FileRulesStep, state)))
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
  offline.value = false
  getFileRules.mockReset()
  previewFileRules.mockReset()
  saveFileRules.mockReset()
  getFileRules.mockResolvedValue({ rules: [{ ...RULE }] })
})

describe('FileRulesStep', () => {
  it('ignores a preview of rules edited while it ran', async () => {
    const answer = deferred()
    previewFileRules.mockReturnValueOnce(answer.promise)
    const { root } = await mount()
    const pending = click(button(root, 'Show where files go'))
    await typeValue(pattern(root), '*.fna.gz')
    answer.resolve(PAGE)
    await pending

    expect(content(root)).not.toContain('proteins/a.faa.gz')
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

  it('can preview again after another link opens during a request', async () => {
    previewFileRules.mockReturnValueOnce(new Promise(() => {}))
    const { root, state } = await mount()
    void click(button(root, 'Show where files go'))
    await flush()
    state.link = { import_id: 'i2' }
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

  it('shows one page at a time and goes back by the kept cursor', async () => {
    previewFileRules.mockResolvedValueOnce({ ...PAGE, next: 'n1' })
    const { root } = await mount()
    await click(button(root, 'Show where files go'))
    expect(content(root)).toContain('On this page: 1 sorted')
    expect(button(root, 'Previous').props.disabled).toBe(true)

    previewFileRules.mockResolvedValueOnce({ files: [{ path: 'raw/b.faa.gz', key: 'proteins/b.faa.gz', outcome: 'matched' }], next: null })
    await click(button(root, 'Next'))
    expect(previewFileRules).toHaveBeenLastCalledWith('g1', 'i1', [RULE], 'n1', expect.anything())
    expect(content(root)).toContain('raw/b.faa.gz')
    expect(content(root)).not.toContain('raw/a.faa.gz')

    previewFileRules.mockResolvedValueOnce({ ...PAGE, next: 'n1' })
    await click(button(root, 'Previous'))
    expect(previewFileRules).toHaveBeenLastCalledWith('g1', 'i1', [RULE], null, expect.anything())
    expect(content(root)).toContain('raw/a.faa.gz')
  })

  it('saves valid rules without a preview', async () => {
    saveFileRules.mockResolvedValue({ rules: [RULE] })
    const { root } = await mount()
    expect(button(root, 'Save').props.disabled).toBe(false)
    await click(button(root, 'Save'))
    expect(saveFileRules).toHaveBeenCalledWith('g1', 'i1', [RULE], expect.anything())
    expect(content(root)).toContain('Saved.')
  })

  it('does not save while offline', async () => {
    previewFileRules.mockResolvedValue(PAGE)
    const { root } = await mount()
    await click(button(root, 'Show where files go'))
    offline.value = true
    await flush()

    expect(button(root, 'Save').props.disabled).toBe(true)
    await click(button(root, 'Save'))
    expect(saveFileRules).not.toHaveBeenCalled()
  })

  it('explains the name patterns', async () => {
    const { root } = await mount()

    expect(content(root)).toContain('* any text, ? one character, [0-9] one of, {4} times, {fna,fa} either')
    expect(content(root)).toContain('Other files go to the top of the bucket.')
  })
})
