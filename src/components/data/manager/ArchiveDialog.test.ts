import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/client'
import * as ObjectListing from '@/lib/objectListing'
import { button, click, compileClientComponent, content, flush, mountApp, moduleDefault } from '@/test/clientRender'

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { disabled: Boolean },
  setup: (props, { attrs, slots }) => () => h('button', { ...attrs, disabled: props.disabled }, slots.default?.()),
})
const DetailListStub = defineComponent({
  props: { items: Array },
  setup: (props) => () => h('dl', (props.items as { label: string; value: string }[]).map((item) => `${item.label}: ${item.value};`)),
})

const archiveLink = vi.fn<(...args: unknown[]) => Promise<string>>()

const dialog = compileClientComponent(new URL('./ArchiveDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Slotted('i') }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/DetailList.vue': moduleDefault(DetailListStub),
  '@/components/ui/Dialog.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogClose.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogContent.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slotted('p')),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slotted('h2')),
  '@/components/ui/ListPager.vue': moduleDefault(Slotted('nav')),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/Spinner.vue': moduleDefault(Slotted('i')),
  '@/components/data/ObjectIcon.vue': moduleDefault(Slotted('i')),
  '@/composables/aruna/storage': { archiveLink },
  '@/lib/api': { ApiError, apiErrorMessage: (error: Error) => error.message },
  '@/lib/objectListing': ObjectListing,
  '@/lib/utils': { formatBytes: (bytes: number) => `${bytes} B` },
})

const files = [
  { key: 'runs/kraken2_report.txt', name: 'kraken2_report.txt', size: 7000 },
  { key: 'runs/sample_sheet.tsv', name: 'sample_sheet.tsv', size: 19000 },
]
const folders = [{ prefix: 'runs/reads/', name: 'reads' }]

// The node env has no window; the tab the dialog opens is a recorded handle, null when blocked.
let tab: { opener: unknown; location: { href: string }; close: ReturnType<typeof vi.fn> } | null
const windowOpen = vi.fn((..._args: unknown[]) => tab)
beforeEach(() => {
  tab = { opener: { portal: true }, location: { href: '' }, close: vi.fn() }
  windowOpen.mockClear()
  archiveLink.mockReset()
  vi.stubGlobal('window', { open: windowOpen })
})
afterEach(() => vi.unstubAllGlobals())

async function open(props: Record<string, unknown> = {}) {
  return mountApp(dialog, {
    props: { open: true, bucket: 'lab-data', prefix: 'runs/', nodeId: 'node-2', nodeName: 'giessen-2', files, folders, distributed: false, ...props },
  })
}

describe('ZIP download dialog', () => {
  it('names the selection, the file, its versions and format, and each ticked entry with its size', async () => {
    const text = content((await open()).root)

    expect(text).toContain('Download as ZIP')
    expect(text).toContain('lab-data/runs/ on giessen-2.')
    expect(text).toContain('Selected: 2 files, 1 folder;')
    expect(text).toContain('File name: selection.zip;')
    expect(text).toContain('Versions: The current version of each file;')
    expect(text).toContain('Format: ZIP, files not compressed;')
    expect(text).toContain('reads/Whole folder')
    expect(text).toContain('kraken2_report.txt7000 B')
    expect(text).toContain('_report.json')
  })

  it('says older copies are reported only for a distributed bucket', async () => {
    const line = 'Files read from an older copy are listed there too.'

    expect(content((await open()).root)).not.toContain(line)
    expect(content((await open({ distributed: true })).root)).toContain(line)
  })

  it('opens the node link for the folders and files, then closes and reports the start', async () => {
    archiveLink.mockResolvedValue('https://node-2.example/api/v1/data/archives/download?ticket=t1')
    const onUpdateOpen = vi.fn()
    // The start is reported only once the tab is on its way to the link.
    const onStarted = vi.fn(() => expect(tab!.location.href).toContain('ticket=t1'))
    const { root } = await open({ 'onUpdate:open': onUpdateOpen, onStarted })

    await click(button(root, 'Download'))

    expect(windowOpen).toHaveBeenCalledWith('about:blank', '_blank')
    expect(archiveLink).toHaveBeenCalledWith(
      [
        { bucket: 'lab-data', prefix: 'runs/reads/' },
        { bucket: 'lab-data', key: 'runs/kraken2_report.txt' },
        { bucket: 'lab-data', key: 'runs/sample_sheet.tsv' },
      ],
      'node-2',
    )
    // Its own tab, cut off from the portal: a download the node refuses shows there.
    expect(tab).toMatchObject({ opener: null, location: { href: 'https://node-2.example/api/v1/data/archives/download?ticket=t1' } })
    expect(tab!.close).not.toHaveBeenCalled()
    expect(onUpdateOpen).toHaveBeenCalledWith(false)
    expect(onStarted).toHaveBeenCalled()
  })

  it('asks for no link when the browser blocks the download tab, and says how to allow it', async () => {
    tab = null
    const onUpdateOpen = vi.fn()
    const onStarted = vi.fn()
    const { root } = await open({ 'onUpdate:open': onUpdateOpen, onStarted })

    await click(button(root, 'Download'))

    expect(archiveLink).not.toHaveBeenCalled()
    expect(content(root)).toContain('Your browser blocked the download window. Allow pop-ups for this site, then try again.')
    expect(onUpdateOpen).not.toHaveBeenCalled()
    expect(onStarted).not.toHaveBeenCalled()
  })

  it('shows a refused link in the dialog and keeps it open', async () => {
    archiveLink.mockRejectedValue(new ApiError(503, 'download_capacity'))
    const onUpdateOpen = vi.fn()
    const { root } = await open({ 'onUpdate:open': onUpdateOpen })

    await click(button(root, 'Download'))

    expect(content(root)).toContain('The node is busy with other downloads. Try again in a moment.')
    expect(tab!.close).toHaveBeenCalled()
    expect(tab!.location.href).toBe('')
    expect(onUpdateOpen).not.toHaveBeenCalled()

    archiveLink.mockRejectedValue(new ApiError(400, 'an entry names either a key or a prefix'))
    await click(button(root, 'Download'))
    expect(content(root)).toContain('an entry names either a key or a prefix')
  })

  it('never opens a link that answers after the dialog closed', async () => {
    let answer: (url: string) => void = () => undefined
    archiveLink.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const onStarted = vi.fn()
    const shown = ref(true)
    const host = defineComponent({
      setup: () => () =>
        h(dialog, { open: shown.value, bucket: 'lab-data', prefix: '', nodeId: null, nodeName: 'giessen-1', files, folders: [], distributed: false, onStarted }),
    })
    const { root } = await mountApp(host)

    // The click waits for the link, so it is not awaited here.
    void click(button(root, 'Download'))
    await flush()
    shown.value = false
    await flush()
    answer('https://node-1.example/api/v1/data/archives/download?ticket=late')
    await flush()

    expect(tab!.close).toHaveBeenCalled()
    expect(tab!.location.href).toBe('')
    expect(onStarted).not.toHaveBeenCalled()
  })

  it('never opens a link that answers after the page left the dialog', async () => {
    let answer: (url: string) => void = () => undefined
    archiveLink.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const onStarted = vi.fn()
    const { app, root } = await open({ onStarted })

    // The click waits for the link, so it is not awaited here.
    void click(button(root, 'Download'))
    await flush()
    app.unmount()
    answer('https://node-2.example/api/v1/data/archives/download?ticket=late')
    await flush()

    expect(tab!.close).toHaveBeenCalled()
    expect(tab!.location.href).toBe('')
    expect(onStarted).not.toHaveBeenCalled()
  })
})
