import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Resolve from '@/lib/api/resolve'
import * as Utils from '@/lib/utils'
import { bubbleClick, compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes } from '@/test/clientRender'

const resolveVersion = vi.fn()
const Slot = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', { 'data-label': attrs.label, onClick: attrs.onClick }, slots.default?.()),
})
const ImageStub = defineComponent({ props: { url: String }, setup: (props) => () => h('img', { src: props.url }) })
const classifyObject = (target: { key: string }) => ({ kind: target.key.endsWith('.png') ? 'image' : target.key.endsWith('.csv') ? 'table' : 'text' })

const component = compileClientComponent(new URL('./VersionActions.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/preview/ImagePreview.vue': moduleDefault(ImageStub),
  '@/components/ui/DetailDialog.vue': moduleDefault(Slot),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slot),
  '@/components/ui/IconButton.vue': moduleDefault(ButtonStub),
  '@/components/ui/Notice.vue': moduleDefault(Slot),
  '@/components/ui/Spinner.vue': moduleDefault(Slot),
  '@/composables/useAruna': { useAruna: () => ({ resolveVersion }) },
  '@/composables/useObjectPreview': { classifyObject },
  '@/lib/api/resolve': Resolve,
  '@/lib/utils': Utils,
  '@lucide/vue': new Proxy({}, { get: () => Slot }),
})

// What the node answers: the bytes as a stream, as `resolveVersion` hands them back.
const answer = (data: BlobPart, size: number | null = null, type = '') =>
  ({ body: new Blob([data]).stream(), size, type })

const ids = { realmId: 'k3V9xQ2m', versionId: '01K8Y2B6D8F0H2K4M6P8R0T2V4' }
const labels = (root: Parameters<typeof nodes>[0]) => nodes(root).filter((node) => node.tag === 'button').map((node) => node.props['data-label'])

afterEach(() => {
  vi.unstubAllGlobals()
  resolveVersion.mockReset()
})

describe('version actions', () => {
  it('offers a preview only for a small file of a shown kind', async () => {
    const small = await mountApp(component, { props: { ...ids, name: 'a.txt', size: 1024 } })
    expect(labels(small.root)).toEqual(['Download a.txt', 'Preview'])
    const unknown = await mountApp(component, { props: { ...ids, name: 'a.txt' } })
    expect(labels(unknown.root)).toEqual(['Download a.txt'])
    const large = await mountApp(component, { props: { ...ids, name: 'a.txt', size: 3 * 1024 * 1024 } })
    expect(labels(large.root)).toEqual(['Download a.txt'])
    const table = await mountApp(component, { props: { ...ids, name: 'a.csv', size: 10 } })
    expect(labels(table.root)).toEqual(['Download a.csv'])
  })

  it('previews an image from the resolved bytes', async () => {
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:image', revokeObjectURL: vi.fn() })
    resolveVersion.mockResolvedValue(answer('png', 3, 'image/png'))
    const mounted = await mountApp(component, { props: { ...ids, name: 'a.png', size: 3 } })

    await bubbleClick(element(mounted.root, (node) => node.props['data-label'] === 'Preview'))

    expect(resolveVersion).toHaveBeenCalledWith(ids.realmId, ids.versionId)
    expect(element(mounted.root, (node) => node.tag === 'img').props.src).toBe('blob:image')
  })

  it('sends a file above the limit to download', async () => {
    resolveVersion.mockResolvedValue(answer(new Uint8Array(2 * 1024 * 1024 + 1)))
    const mounted = await mountApp(component, { props: { ...ids, name: 'a.txt', size: 100 } })

    await bubbleClick(element(mounted.root, (node) => node.props['data-label'] === 'Preview'))
    await flush()

    expect(content(mounted.root)).toContain('above the 2 MB preview limit. Download it instead.')
  })

  it('shows a refused download in the row', async () => {
    resolveVersion.mockRejectedValue(new Error('No holder answered'))
    const mounted = await mountApp(component, { props: { ...ids, name: 'a.txt' } })

    await bubbleClick(element(mounted.root, (node) => node.props['data-label'] === 'Download a.txt'))

    expect(content(mounted.root)).toContain('No holder answered')
  })

  it('stops reading a preview once the limit is passed', async () => {
    let pulled = 0
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++
        controller.enqueue(new Uint8Array(1024 * 1024))
      },
      cancel() {
        cancelled = true
      },
    })
    resolveVersion.mockResolvedValue({ body, size: null, type: '' })
    const mounted = await mountApp(component, { props: { ...ids, name: 'a.txt', size: 100 } })

    await bubbleClick(element(mounted.root, (node) => node.props['data-label'] === 'Preview'))
    await flush()

    expect(content(mounted.root)).toContain('Download it instead.')
    expect([cancelled, pulled < 6]).toEqual([true, true])
  })

  it('writes a download straight to the chosen file', async () => {
    const written: Uint8Array[] = []
    const writable = new WritableStream<Uint8Array>({ write: (chunk) => void written.push(chunk) })
    const pick = vi.fn(async () => ({ createWritable: async () => writable }))
    vi.stubGlobal('showSaveFilePicker', pick)
    const createObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() })
    resolveVersion.mockResolvedValue(answer('bytes', 5))
    const mounted = await mountApp(component, { props: { ...ids, name: 'a.txt' } })

    await bubbleClick(element(mounted.root, (node) => node.props['data-label'] === 'Download a.txt'))
    await flush()

    expect(pick).toHaveBeenCalledWith({ suggestedName: 'a.txt' })
    expect(new TextDecoder().decode(written[0])).toBe('bytes')
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('collects a download when the browser cannot write a file', async () => {
    const anchor = { click: vi.fn(), remove: vi.fn(), href: '', download: '', rel: '' }
    vi.stubGlobal('document', { createElement: () => anchor, body: { append: vi.fn() } })
    const createObjectURL = vi.fn(() => 'blob:file')
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() })
    resolveVersion.mockResolvedValue(answer('bytes', 5))
    const mounted = await mountApp(component, { props: { ...ids, name: 'a.txt' } })

    await bubbleClick(element(mounted.root, (node) => node.props['data-label'] === 'Download a.txt'))
    await flush()

    expect([anchor.click.mock.calls.length, anchor.href, anchor.download]).toEqual([1, 'blob:file', 'a.txt'])
  })
})
