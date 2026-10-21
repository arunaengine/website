import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, mountApp, moduleDefault } from '@/test/clientRender'
import * as Organize from '@/lib/organize'
import * as Utils from '@/lib/utils'

const previewDuplicates = vi.fn()
const startDuplicates = vi.fn()
const startImportRenames = vi.fn()
const offline = ref(false)

const Slot = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const ListStub = defineComponent({
  props: { total: Number, shown: Number },
  setup: (props, { slots }) => () => h('div', [h('ul', slots.default?.()), h('span', `list ${props.shown} of ${props.total}`)]),
})

const TidyStep = compileClientComponent(new URL('./TidyStep.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/storage/PagedList.vue': moduleDefault(ListStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Notice.vue': moduleDefault(Slot),
  '@/composables/useAruna': {
    isUnsupportedEndpoint: (err: { status?: number }) => err?.status === 404,
    useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('t'), sessionEpoch: ref(0) }),
  },
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled: offline }) },
  '@/lib/api': { PAGE_SIZE: 100, previewDuplicates, startDuplicates, startImportRenames },
  '@/lib/organize': Organize,
  '@/lib/storageRules': { moveRefusal: () => null },
  '@/lib/utils': Utils,
})

const FILES = [{ from: 'raw/01JA7Q3K_b.fastq', to: 'raw/b.fastq~01JA7Q3K' }]
const COPIES = { total: 842, bytes: 1.2e12, items: [{ kept: 'P1.faa.gz', removed: '01JA_P1.faa.gz' }] }

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
    expect(content(root)).toContain('raw/01JA7Q3K_b.fastq')
    expect(content(root)).toContain('raw/b.fastq~01JA7Q3K')
  })

  it('removes stored copies and shows size and kept file', async () => {
    const { root, events } = await mount(null)
    expect(content(root)).toContain('842 files are stored twice · 1.1 TB')
    await click(button(root, 'Preview'))
    expect(content(root)).toContain('keeps')
    expect(content(root)).toContain('removes 01JA_P1.faa.gz')
    await click(button(root, 'Remove 842 copies'))
    expect(startDuplicates).toHaveBeenCalledWith('g1', 'i1', expect.anything())
    expect(events).toEqual(['started'])
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
    expect(button(running.root, 'Remove 842 copies').props.disabled).toBe(true)
    offline.value = true
    const off = await mount()
    expect(button(off.root, 'Remove 842 copies').props.disabled).toBe(true)
  })
})
