import { defineComponent, h, reactive, ref } from 'vue'
import * as VueRuntime from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, element, flush, mountApp, moduleDefault } from '@/test/clientRender'

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })

const load = vi.fn()
const urlFor = vi.fn()
const checkAccess = vi.fn()
const downloadUrl = vi.fn()
let token = 1
const preview = {
  status: ref('idle'),
  kind: ref('download'),
  language: ref(undefined),
  mediaKind: ref('video'),
  delimiter: ref(','),
  text: ref(null),
  objectUrl: ref(null),
  directUrl: ref<string | null>(null),
  errorMessage: ref(null),
  downloadError: ref<string | null>(null),
  corsBlocked: ref(false),
  sizeNote: ref(null),
  referenced: ref(false),
  lockCheck: ref('idle'),
  lockedLink: ref(null),
  sessionKey: ref('session-1'),
  load,
  reset: vi.fn(),
  probeReferenced: vi.fn(),
  recheck: vi.fn(),
  markLocked: vi.fn(),
  checkAccess,
  urlFor,
  loadToken: () => token,
  isCurrent: (id: number) => id === token,
}

const body = compileClientComponent(new URL('./PreviewBody.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: Slotted('a') },
  '@lucide/vue': new Proxy({}, { get: () => Slotted('i') }),
  '@/lib/chunk-recovery': { asyncChunkError: () => undefined },
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/ErrorPanel.vue': moduleDefault(Slotted('div')),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/Spinner.vue': moduleDefault(Slotted('span')),
  '@/composables/useObjectPreview': { useObjectPreview: () => preview },
  '@/composables/useS3': { useS3: () => ({ downloadUrl }), s3ErrorMessage: (error: unknown) => String(error) },
  './TextPreview.vue': moduleDefault(Slotted('div')),
  './HtmlPreview.vue': moduleDefault(Slotted('div')),
  './MarkdownPreview.vue': moduleDefault(Slotted('div')),
  './CsvPreview.vue': moduleDefault(Slotted('div')),
  './ImagePreview.vue': moduleDefault(Slotted('div')),
  './MediaPreview.vue': moduleDefault(Slotted('video')),
  './PdfPreview.vue': moduleDefault(Slotted('object')),
  './DownloadCard.vue': moduleDefault(Slotted('div')),
})

const shown = reactive({ active: true, bucket: 'reef', objectKey: 'a.txt', name: 'a.txt', nodeId: null as string | null | undefined })
const Host = defineComponent(() => () => h(body, { ...shown }))
const anchor = { href: '', download: '', rel: '', click: vi.fn(), remove: vi.fn() }

beforeEach(() => {
  Object.assign(shown, { active: true, bucket: 'reef', objectKey: 'a.txt', name: 'a.txt', nodeId: null })
  preview.sessionKey.value = 'session-1'
  preview.status.value = 'idle'
  preview.kind.value = 'download'
  preview.directUrl.value = null
  preview.downloadError.value = null
  preview.markLocked.mockReset()
  token = 1
  load.mockReset()
  urlFor.mockReset().mockReturnValue(null)
  checkAccess.mockReset().mockResolvedValue(true)
  downloadUrl.mockReset().mockResolvedValue('https://signed/fresh')
  anchor.click.mockReset()
  vi.stubGlobal('document', { createElement: () => anchor, body: { append: vi.fn() } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('preview body', () => {
  it('reads the object again when its bucket, node or session changes', async () => {
    await mountApp(Host)

    shown.bucket = 'other'
    await flush()
    shown.nodeId = 'node-b'
    await flush()
    preview.sessionKey.value = 'session-2'
    await flush()
    // Null is the connected node, an omitted node the active S3 session's node.
    shown.nodeId = null
    await flush()
    shown.nodeId = undefined
    await flush()

    expect(load.mock.calls.map(([target]) => [target.bucket, target.nodeId])).toEqual([
      ['reef', null],
      ['other', null],
      ['other', 'node-b'],
      ['other', 'node-b'],
      ['other', null],
      ['other', undefined],
    ])
  })

  it('downloads only a URL signed for the object it shows', async () => {
    const { root } = await mountApp(Host)
    shown.bucket = 'other'
    await flush()

    await click(button(root, 'Download'))

    expect(urlFor).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'other', key: 'a.txt' }))
    expect(downloadUrl.mock.calls[0].slice(0, 2)).toEqual(['other', 'a.txt'])
    expect(anchor.href).toBe('https://signed/fresh')
    expect(anchor.click).toHaveBeenCalledOnce()
  })

  it('drops a download whose preview changed while its URL was signed', async () => {
    let sign!: (url: string) => void
    downloadUrl.mockReturnValueOnce(new Promise((resolve) => (sign = resolve)))
    const { root } = await mountApp(Host)

    const started = click(button(root, 'Download'))
    token = 2
    sign('https://signed/old')
    await started

    expect(checkAccess).not.toHaveBeenCalled()
    expect(anchor.click).not.toHaveBeenCalled()
  })

  it('reports a failed download beside a locked or ready preview instead of replacing it', async () => {
    downloadUrl.mockRejectedValue(new Error('signing failed'))
    preview.status.value = 'locked'
    const { root } = await mountApp(Host)

    await click(button(root, 'Download'))
    expect(preview.status.value).toBe('locked')
    expect(preview.downloadError.value).toBe('Error: signing failed')

    preview.status.value = 'ready'
    await click(button(root, 'Download'))
    await flush()
    expect(preview.status.value).toBe('ready')
    expect(content(element(root, (node) => node.tag === 'aside'))).toContain('signing failed')
  })

  it('acts on viewer reports only for the file it still shows', async () => {
    preview.status.value = 'ready'
    preview.kind.value = 'media'
    preview.directUrl.value = 'https://signed/current'
    const { root } = await mountApp(Host)
    await vi.waitFor(() => element(root, (node) => node.tag === 'video'))
    const player = element(root, (node) => node.tag === 'video')

    await (player.props.onFailed as (url: string) => Promise<void>)('https://signed/old')
    expect(checkAccess).not.toHaveBeenCalled()
    await (player.props.onFailed as (url: string) => Promise<void>)('https://signed/current')
    expect(checkAccess).toHaveBeenCalledWith('https://signed/current', 1)

    preview.kind.value = 'pdf'
    await vi.waitFor(() => element(root, (node) => node.tag === 'object'))
    const pdf = element(root, (node) => node.tag === 'object')
    ;(pdf.props.onLocked as (url: string) => void)('https://signed/old')
    expect(preview.markLocked).not.toHaveBeenCalled()
    ;(pdf.props.onLocked as (url: string) => void)('https://signed/current')
    expect(preview.markLocked).toHaveBeenCalledOnce()
  })
})
