import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
  '@/lib/utils': Utils,
  '@lucide/vue': new Proxy({}, { get: () => Slot }),
})

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
    resolveVersion.mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    const mounted = await mountApp(component, { props: { ...ids, name: 'a.png', size: 3 } })

    await bubbleClick(element(mounted.root, (node) => node.props['data-label'] === 'Preview'))

    expect(resolveVersion).toHaveBeenCalledWith(ids.realmId, ids.versionId)
    expect(element(mounted.root, (node) => node.tag === 'img').props.src).toBe('blob:image')
  })

  it('sends a file above the limit to download', async () => {
    resolveVersion.mockResolvedValue(new Blob([new Uint8Array(2 * 1024 * 1024 + 1)]))
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
})
