import * as VueRuntime from 'vue'
import { defineComponent, h, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp, typeValue } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as FileRules from '@/lib/fileRules'
import * as Utils from '@/lib/utils'

const previewRename = vi.fn()
const renameKeys = vi.fn()
const onRenamed = vi.fn()

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

const RenameFolderDialog = compileClientComponent(new URL('./RenameFolderDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Dialog.vue': moduleDefault(Slot),
  '@/components/ui/DialogContent.vue': moduleDefault(Slot),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slot),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slot),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slot),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slot),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(Slot),
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled: offline }) },
  '@/composables/useAruna': {
    useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('bearer'), sessionEpoch: ref(0) }),
  },
  '@/lib/api': { ...Api, previewRename, renameKeys },
  '@/lib/fileRules': FileRules,
  '@/lib/utils': Utils,
})

const ITEM = { from: 'x.csv', to: 'archive/x.csv', versions: ['v1', 'v2'], deleted: false, files: ['raw/x.csv'] }

async function mount() {
  const state = reactive({ open: true, bucket: 'lab', from: '', onRenamed })
  const mounted = await mountApp(defineComponent(() => () => h(RenameFolderDialog, state)))
  await flush()
  if (mounted.errors.length) throw mounted.errors[0]
  return mounted
}

function field(root: Parameters<typeof content>[0], id: string) {
  return element(root, (node) => node.tag === 'input' && node.props.id === id)
}

beforeEach(() => {
  offline.value = false
  previewRename.mockReset()
  renameKeys.mockReset()
  onRenamed.mockReset()
})

describe('RenameFolderDialog', () => {
  it('renames exactly the previewed files', async () => {
    previewRename.mockResolvedValue({ bucket: 'lab', items: [ITEM], truncated: false })
    renameKeys.mockResolvedValue({ bucket: 'lab', items: [ITEM], truncated: false })
    const { root } = await mount()
    await typeValue(field(root, 'rename-to'), 'archive')
    expect(button(root, 'Rename').props.disabled).toBe(true)
    await click(button(root, 'Show changes'))

    expect(previewRename).toHaveBeenCalledWith('lab', '', 'archive/', expect.anything())
    expect(content(root)).toContain('archive/x.csv')
    expect(content(root)).toContain('2 versions')
    expect(content(root)).toContain('Links by path stop working.')
    await click(button(root, 'Rename'))

    expect(renameKeys).toHaveBeenCalledWith('lab', '', 'archive/', ['x.csv'], expect.anything())
    expect(content(root)).toContain('Renamed 1 file.')
    expect(onRenamed).toHaveBeenCalledOnce()
  })

  it('blocks a rename with a conflict', async () => {
    const taken = { ...ITEM, conflict: 'the key `archive/x.csv` already exists' }
    previewRename.mockResolvedValue({ bucket: 'lab', items: [taken], truncated: false })
    const { root } = await mount()
    await typeValue(field(root, 'rename-to'), 'archive/')
    await click(button(root, 'Show changes'))

    expect(content(root)).toContain('1 cannot move')
    expect(button(root, 'Rename').props.disabled).toBe(true)
    await click(button(root, 'Rename'))
    expect(renameKeys).not.toHaveBeenCalled()
  })

  it('drops a preview for folders changed while it ran', async () => {
    let answer: (plan: unknown) => void = () => {}
    previewRename.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    previewRename.mockResolvedValue({ bucket: 'lab', items: [{ ...ITEM, to: 'other/x.csv' }], truncated: false })
    renameKeys.mockResolvedValue({ bucket: 'lab', items: [ITEM], truncated: false })
    const { root } = await mount()
    await typeValue(field(root, 'rename-to'), 'archive/')
    const pending = click(button(root, 'Show changes'))
    await typeValue(field(root, 'rename-to'), 'other/')
    answer({ bucket: 'lab', items: [ITEM], truncated: false })
    await pending

    expect(content(root)).not.toContain('archive/x.csv')
    expect(button(root, 'Rename').props.disabled).toBe(true)
    await click(button(root, 'Show changes'))
    await click(button(root, 'Rename'))
    expect(renameKeys).toHaveBeenCalledWith('lab', '', 'other/', ['x.csv'], expect.anything())
  })

  it('needs a new preview after the folders change', async () => {
    previewRename.mockResolvedValue({ bucket: 'lab', items: [ITEM], truncated: false })
    const { root } = await mount()
    await typeValue(field(root, 'rename-to'), 'archive/')
    await click(button(root, 'Show changes'))
    await typeValue(field(root, 'rename-to'), 'other/')

    expect(content(root)).not.toContain('archive/x.csv')
    expect(button(root, 'Rename').props.disabled).toBe(true)
  })

  it('does not rename while offline', async () => {
    previewRename.mockResolvedValue({ bucket: 'lab', items: [ITEM], truncated: false })
    const { root } = await mount()
    await typeValue(field(root, 'rename-to'), 'archive/')
    await click(button(root, 'Show changes'))
    offline.value = true
    await flush()

    expect(button(root, 'Rename').props.disabled).toBe(true)
    await click(button(root, 'Rename'))
    expect(renameKeys).not.toHaveBeenCalled()
  })
})
