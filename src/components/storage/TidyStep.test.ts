import * as VueRuntime from 'vue'
import { defineComponent, h, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, mountApp, moduleDefault } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as CursorPage from '@/composables/useCursorPage'
import * as Organize from '@/lib/organize'
import * as Utils from '@/lib/utils'

const previewDuplicates = vi.fn()
const startDuplicates = vi.fn()
const startImportRenames = vi.fn()
const getImportRenames = vi.fn()
const offline = ref(false)
const sessionEpoch = ref(0)

const Slot = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const ListStub = defineComponent({
  props: { total: Number, shown: Number, offset: Number, filter: String, hasNext: Boolean, hasPrev: Boolean, complete: Boolean, busy: Boolean, summary: String },
  emits: ['filter'],
  setup: (props, { slots, emit }) => () =>
    h('div', [h('ul', slots.default?.()), h('span', props.summary ?? `list ${props.shown} of ${props.total}`), h('button', { onClick: () => emit('filter', 'x') }, 'filter x')]),
})

const TidyStep = compileClientComponent(new URL('./TidyStep.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/storage/PagedList.vue': moduleDefault(ListStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Notice.vue': moduleDefault(Slot),
  '@/composables/useCursorPage': CursorPage,
  '@/composables/useAruna': {
    isUnsupportedEndpoint: (err: { status?: number }) => err?.status === 404,
    useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('t'), sessionEpoch }),
  },
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled: offline }) },
  '@/lib/api': { PAGE_SIZE: 100, previewDuplicates, startDuplicates, startImportRenames, getImportRenames, ApiError: Api.ApiError },
  '@/lib/organize': Organize,
  '@/lib/storageRules': { moveRefusal: () => null },
  '@/lib/utils': Utils,
})

const FILES = [{ from: 'raw/01JA7Q3K_b.fastq', to: 'raw/b.fastq~01JA7Q3K' }]
const COPIES = {
  total: 842,
  bytes: 1.2e12,
  complete: true,
  items: [{ key: 'P1.faa.gz', kept: { path: 'P1.faa.gz', bytes: 1 }, removed: [{ path: '01JA_P1.faa.gz', bytes: 1 }] }],
}

async function mount(renames: object | null = { count: 12034, complete: true, files: FILES }, blocked = false) {
  const events: string[] = []
  const mounted = await mountApp(TidyStep, {
    props: { groupId: 'g1', link: { import_id: 'i1' }, renames, blocked, onStarted: () => events.push('started') },
  })
  await flush()
  if (mounted.errors.length) throw mounted.errors[0]
  return { ...mounted, events }
}

beforeEach(() => {
  offline.value = false
  previewDuplicates.mockReset().mockResolvedValue(COPIES)
  startDuplicates.mockReset().mockResolvedValue({})
  startImportRenames.mockReset().mockResolvedValue({})
  getImportRenames.mockReset().mockResolvedValue({ count: 12034, complete: true, files: FILES })
})

describe('TidyStep', () => {
  it('renames the files with the old name without a preview', async () => {
    const { root, events } = await mount()
    expect(content(root)).toContain('12,034 files still have the old name')
    await click(button(root, 'Rename 12,034 files'))
    expect(startImportRenames).toHaveBeenCalledWith('g1', 'i1', expect.anything())
    expect(events).toEqual(['started'])
  })

  it('previews the new names', async () => {
    const { root } = await mount()
    expect(content(root)).not.toContain('raw/b.fastq~01JA7Q3K')
    await click(button(root, 'Preview'))
    expect(getImportRenames).toHaveBeenCalledWith('g1', 'i1', expect.anything(), { filter: '', limit: 100, after: null })
    expect(content(root)).toContain('raw/01JA7Q3K_b.fastq')
    expect(content(root)).toContain('raw/b.fastq~01JA7Q3K')
  })

  it('removes stored copies and shows size and kept file', async () => {
    const { root, events } = await mount(null)
    expect(content(root)).toContain('842 files are stored twice · 1.1 TB')
    await click(button(root, 'Preview'))
    expect(content(root)).toContain('keeps')
    expect(content(root)).toContain('removes 01JA_P1.faa.gz')
    await click(button(root, 'Remove copies of 842 files'))
    expect(startDuplicates).toHaveBeenCalledWith('g1', 'i1', expect.anything())
    expect(events).toEqual(['started'])
  })

  it('calls an uncounted number of copies a lower bound', async () => {
    previewDuplicates.mockResolvedValue({ ...COPIES, complete: false })
    const { root } = await mount(null)
    expect(content(root)).toContain('At least 842 files are stored twice')
  })

  it('does not call a partial count of zero nothing to tidy', async () => {
    previewDuplicates.mockResolvedValue({ ...COPIES, total: 0, bytes: 0, complete: false, items: [], next: 'c1' })
    const { root } = await mount({ count: 0, complete: true, files: [] })
    const text = content(root)
    expect(text).toContain('Some files may be stored twice')
    expect(text).not.toContain('Nothing to tidy.')
    expect(button(root, 'Remove copies')).toBeTruthy()
  })

  it('says nothing to tidy only once the checks are settled and empty', async () => {
    previewDuplicates.mockResolvedValue({ ...COPIES, total: 0, bytes: 0, items: [] })
    const { root } = await mount({ count: 0, complete: true, files: [] })
    expect(content(root)).toContain('Nothing to tidy.')
    previewDuplicates.mockReset().mockReturnValue(new Promise(() => {}))
    const waiting = await mount({ count: 0, complete: true, files: [] })
    expect(content(waiting.root)).not.toContain('Nothing to tidy.')
  })

  it('keeps the whole count on the button while a filter is used', async () => {
    const { root } = await mount(null)
    previewDuplicates.mockResolvedValue({ ...COPIES, total: 2 })
    await click(button(root, 'Preview'))
    await click(button(root, 'filter x'))
    expect(button(root, 'Remove copies of 842 files')).toBeTruthy()
  })

  it('ignores a failed unfiltered reload and keeps the whole count', async () => {
    const props = reactive({ groupId: 'g1', link: { import_id: 'i1' }, renames: null, blocked: false, finished: 0 })
    const mounted = await mountApp(defineComponent(() => () => h(TidyStep, props)))
    await flush()
    previewDuplicates.mockResolvedValue({ ...COPIES, total: 2 })
    await click(button(mounted.root, 'Preview'))
    await click(button(mounted.root, 'filter x'))
    previewDuplicates.mockRejectedValue(new Error('offline'))
    props.finished = 1
    await flush()
    expect(button(mounted.root, 'Remove copies of 842 files')).toBeTruthy()
    mounted.app.unmount()
  })

  it('ignores an older whole-scope answer that arrives after a session reset', async () => {
    let old: (value: unknown) => void = () => {}
    previewDuplicates.mockReset().mockReturnValueOnce(new Promise((resolve) => (old = resolve)))
    const props = reactive({ groupId: 'g1', link: { import_id: 'i1' }, renames: null, blocked: false, finished: 0 })
    const mounted = await mountApp(defineComponent(() => () => h(TidyStep, props)))
    previewDuplicates.mockResolvedValue({ ...COPIES, total: 7 })
    sessionEpoch.value++
    await flush()
    expect(button(mounted.root, 'Remove copies of 7 files')).toBeTruthy()
    old({ ...COPIES, total: 99 })
    await flush()
    expect(button(mounted.root, 'Remove copies of 7 files')).toBeTruthy()
    mounted.app.unmount()
  })

  it('counts files with copies, not rows, when one file has several contents', async () => {
    const two = [COPIES.items[0], { ...COPIES.items[0], kept: { path: 'P1.v2', bytes: 1 } }]
    previewDuplicates.mockResolvedValue({ ...COPIES, total: 1, items: two })
    const { root } = await mount(null)
    await click(button(root, 'Preview'))
    const text = content(root)
    expect(text).toContain('1 file is stored twice')
    expect(text).toContain('Showing 2 · 1 file with copies')
    expect(button(root, 'Remove copies of 1 file')).toBeTruthy()
  })

  it('looks again when a step ends, even one nobody saw run', async () => {
    const props = reactive({ groupId: 'g1', link: { import_id: 'i1' }, renames: null, blocked: false, finished: 0 })
    const mounted = await mountApp(defineComponent(() => () => h(TidyStep, props)))
    await flush()
    expect(previewDuplicates).toHaveBeenCalledTimes(1)
    props.finished = 1
    await flush()
    expect(previewDuplicates).toHaveBeenCalledTimes(2)
    mounted.app.unmount()
  })

  it('pages with the filtered totals and keeps the whole count on the action', async () => {
    const { root } = await mount(null)
    await click(button(root, 'Preview'))
    previewDuplicates.mockResolvedValue({ ...COPIES, total: 2 })
    await click(button(root, 'filter x'))
    expect(content(root)).toContain('Showing 1 · 2 files with copies')
    expect(button(root, 'Remove copies of 842 files')).toBeTruthy()
  })

  it('hides the copies on an older node and says nothing is left', async () => {
    previewDuplicates.mockRejectedValue({ status: 404 })
    const { root } = await mount({ count: 0, complete: true, files: [] })
    expect(content(root)).toContain('Nothing to tidy.')
    expect(content(root)).not.toContain('stored twice')
  })

  it('starts nothing while a step runs or offline', async () => {
    const running = await mount(undefined, true)
    expect(button(running.root, 'Rename 12,034 files').props.disabled).toBe(true)
    expect(button(running.root, 'Remove copies of 842 files').props.disabled).toBe(true)
    offline.value = true
    const off = await mount()
    expect(button(off.root, 'Remove copies of 842 files').props.disabled).toBe(true)
  })
})
