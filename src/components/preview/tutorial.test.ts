// The tutorial's artifacts go through the portal's real preview stack: the
// same classification, the same viewers, only the bytes come from fixtures.
import * as VueRuntime from 'vue'
import { defineComponent, h, provide, type Component } from 'vue'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, element, flush, moduleDefault, mountApp } from '@/test/clientRender'
import * as ObjectPreview from '@/composables/useObjectPreview'
import * as S3 from '@/composables/useS3'
import * as Utils from '@/lib/utils'
import * as References from '@/lib/references'
import * as ChunkRecovery from '@/lib/chunk-recovery'
import { RESULT_BUCKET, RESULT_ARTIFACTS, SUMMARY_JSON, RUN_LOG_TEXT } from '@/lib/tutorial/fixtures/data'
import { tutorialS3 } from '@/lib/tutorial/services/tutorialS3'

const GenericStub = defineComponent(() => () => h('div'))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const ImageStub = defineComponent({
  props: { url: String, name: String },
  setup: (props) => () => h('img', { src: props.url, alt: props.name }),
})
const TextStub = defineComponent({
  props: { text: String, language: String },
  setup: (props) => () => h('pre', { 'data-language': props.language }, props.text),
})
const DownloadStub = defineComponent({
  props: { name: String, note: String },
  setup: (props) => () => h('div', `download ${props.name}`),
})
const icons = new Proxy({}, { get: () => GenericStub })

let PreviewBody: Component
const createObjectURL = vi.fn((_blob: Blob) => 'blob:tutorial-plot')

beforeAll(() => {
  Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() })
  PreviewBody = compileClientComponent(new URL('./PreviewBody.vue', import.meta.url), {
    vue: VueRuntime,
    'vue-router': { RouterLink: GenericStub },
    '@lucide/vue': icons,
    '@/lib/chunk-recovery': ChunkRecovery,
    '@/lib/utils': Utils,
    '@/lib/references': References,
    '@/components/ui/Button.vue': moduleDefault(ButtonStub),
    '@/components/ui/ErrorPanel.vue': moduleDefault(GenericStub),
    '@/components/ui/Notice.vue': moduleDefault(GenericStub),
    '@/components/ui/Spinner.vue': moduleDefault(GenericStub),
    '@/composables/useObjectPreview': ObjectPreview,
    '@/composables/useS3': S3,
    './TextPreview.vue': moduleDefault(TextStub),
    './MarkdownPreview.vue': moduleDefault(GenericStub),
    './CsvPreview.vue': moduleDefault(GenericStub),
    './ImagePreview.vue': moduleDefault(ImageStub),
    './MediaPreview.vue': moduleDefault(GenericStub),
    './PdfPreview.vue': moduleDefault(GenericStub),
    './DownloadCard.vue': moduleDefault(DownloadStub),
  })
})

afterAll(() => {
  vi.restoreAllMocks()
})

// The tutorial provides its storage the way its view does, one level above.
async function previewArtifact(name: string) {
  const artifact = RESULT_ARTIFACTS.find((entry) => entry.name === name)!
  const Harness = defineComponent(() => {
    provide(S3.S3_SOURCE, tutorialS3('user-id'))
    return () =>
      h(PreviewBody, {
        active: true,
        bucket: RESULT_BUCKET,
        objectKey: artifact.key,
        name: artifact.name,
        size: artifact.size,
      })
  })
  const mounted = await mountApp(Harness)
  await flush()
  await flush()
  return mounted
}

describe('tutorial artifacts in the preview stack', () => {
  it('renders the image fixture through the image viewer', async () => {
    const mounted = await previewArtifact('plot.png')

    const image = element(mounted.root, (node) => node.tag === 'img')
    expect(image.props.src).toBe('blob:tutorial-plot')
    expect(createObjectURL).toHaveBeenCalled()
    const blob = createObjectURL.mock.calls[0][0]
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBe(115)
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('renders the JSON fixture as highlighted text', async () => {
    const mounted = await previewArtifact('summary.json')

    const viewer = element(mounted.root, (node) => node.tag === 'pre')
    expect(viewer.props['data-language']).toBe('json')
    expect(content(viewer)).toContain(SUMMARY_JSON)
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('renders the log fixture as plain text', async () => {
    const mounted = await previewArtifact('run.log')

    const viewer = element(mounted.root, (node) => node.tag === 'pre')
    expect(viewer.props['data-language']).toBe('text')
    expect(content(viewer)).toContain(RUN_LOG_TEXT)
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('offers anything else as a download', async () => {
    const mounted = await previewArtifact('model.bin')

    expect(content(mounted.root)).toContain('download model.bin')
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('classifies every artifact the tutorial ships', () => {
    const kinds = RESULT_ARTIFACTS.map((artifact) => ObjectPreview.classifyObject({ key: artifact.key }).kind)

    expect(kinds).toEqual(['image', 'text', 'text', 'download'])
  })
})
