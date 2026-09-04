import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyObject } from '@/composables/useObjectPreview'
import * as Utils from '@/lib/utils'
import {
  compileClientComponent,
  content,
  element,
  flush,
  moduleDefault,
  mountApp,
  nodes,
  type HostNode,
} from '@/test/clientRender'
import { ARTIFACT_TEXT_CAP } from '@/lib/assistant/types'
import type { ArtifactView } from '@/lib/assistant/types'

const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })
const TextStub = defineComponent({
  props: { text: { type: String, default: '' } },
  setup: (props) => () => h('pre', {}, props.text),
})
const NoticeStub = defineComponent({ setup: (_, { slots }) => () => h('p', {}, slots.default?.()) })
const LinkStub = defineComponent({
  props: { bucket: { type: String, default: '' }, objectKey: { type: String, default: '' } },
  setup: (props, { slots }) => () => h('a', { 'data-object': `${props.bucket}/${props.objectKey}` }, slots.default?.()),
})
const BucketStub = defineComponent({
  props: { bucket: { type: String, default: '' } },
  setup: (props, { slots }) => () => h('a', { 'data-bucket': props.bucket }, slots.default?.()),
})
const SpinnerStub = defineComponent({
  props: { label: { type: String, default: '' } },
  setup: (props) => () => h('span', {}, props.label),
})

const ImagePreview = compileClientComponent(
  new URL('../../preview/ImagePreview.vue', import.meta.url),
  { vue: VueRuntime },
)

const ArtifactCard = compileClientComponent(new URL('./ArtifactCard.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/components/preview/ImagePreview.vue': moduleDefault(ImagePreview),
  '@/components/preview/TextPreview.vue': moduleDefault(TextStub),
  '@/components/preview/MarkdownPreview.vue': moduleDefault(TextStub),
  '@/components/preview/CsvPreview.vue': moduleDefault(TextStub),
  '@/components/assistant/ObjectLink.vue': moduleDefault(LinkStub),
  '@/components/assistant/BucketLink.vue': moduleDefault(BucketStub),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/components/ui/Spinner.vue': moduleDefault(SpinnerStub),
  '@/composables/useObjectPreview': { classifyObject },
  '@/lib/assistant/types': { ARTIFACT_TEXT_CAP },
  '@/lib/utils': Utils,
})

function artifact(overrides: Partial<ArtifactView> = {}): ArtifactView {
  return {
    url: 'blob:aruna/chart',
    contentType: 'image/png',
    previewKind: 'image',
    name: 'chart.png',
    size: 4096,
    bucket: 'work',
    key: 'results/run-1/chart.png',
    jobId: 'job-1',
    ...overrides,
  }
}

async function card(view: ArtifactView, caption?: string) {
  const mounted = await mountApp(ArtifactCard, {
    props: { title: view.name, artifact: view, ...(caption ? { caption } : {}) },
  })
  await flush()
  return mounted
}

function tag(root: HostNode, name: string): HostNode | undefined {
  return nodes(root).find((node) => node.tag === name)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ArtifactCard', () => {
  it('opens the file viewer from its title and from an Open control', async () => {
    const { root } = await card(artifact())
    const open = element(root, (node) => node.props.title === 'Open the file viewer')
    const heading = element(root, (node) => node.props.title === 'Open work/results/run-1/chart.png')

    expect(open.props['data-object']).toBe('work/results/run-1/chart.png')
    expect(heading.props['data-object']).toBe('work/results/run-1/chart.png')
    expect(content(root)).toContain('Open')
  })

  it('links the bucket beside the key', async () => {
    const { root } = await card(artifact())

    expect(element(root, (node) => node.props['data-bucket'] === 'work')).toBeTruthy()
  })

  it('shows an image under its own filename', async () => {
    const { root } = await card(artifact())
    const image = element(root, (node) => node.tag === 'img')

    expect(image.props.src).toBe('blob:aruna/chart')
    expect(image.props.alt).toBe('chart.png')
    expect(content(root)).toContain('work/results/run-1/chart.png')
    expect(content(root)).toContain('job-1')
    expect(content(root)).toContain('image/png')
  })

  it('shows the text it was given without fetching', async () => {
    // A blob URL cannot be fetched back under the node's connect-src policy.
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { root } = await card(artifact({
      url: 'blob:aruna/summary',
      contentType: 'application/json',
      previewKind: 'text',
      name: 'summary.json',
      key: 'out/summary.json',
      text: '{"reads": 12}',
    }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(content(root)).toContain('{"reads": 12}')
  })

  it('draws a restored card from its text alone', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { root } = await card(artifact({
      url: '',
      contentType: 'text/plain',
      previewKind: 'text',
      name: 'notes.txt',
      key: 'out/notes.txt',
      text: 'still here',
    }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(content(root)).toContain('still here')
    expect(content(root)).not.toContain('Reading the file')
  })

  it('reads a json output and shows its text', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => '{"reads": 12}' }))
    vi.stubGlobal('fetch', fetchMock)

    const { root } = await card(artifact({
      url: 'blob:aruna/summary',
      contentType: 'application/json',
      previewKind: 'text',
      name: 'summary.json',
      key: 'out/summary.json',
    }))

    expect(fetchMock).toHaveBeenCalledWith('blob:aruna/summary')
    expect(content(root)).toContain('{"reads": 12}')
    expect(tag(root, 'img')).toBeUndefined()
  })

  it('offers a download for bytes it cannot render', async () => {
    const { root } = await card(artifact({
      url: 'https://s3.node.test/work/run.bam?signature',
      contentType: 'application/octet-stream',
      previewKind: 'download',
      name: 'run.bam',
      key: 'results/run-1/run.bam',
      size: 60 * 1024 * 1024,
    }))
    const link = element(root, (node) => node.tag === 'a' && Boolean(node.props.download))

    expect(link.props.href).toBe('https://s3.node.test/work/run.bam?signature')
    expect(link.props.download).toBe('run.bam')
    expect(content(root)).toContain('Download')
    expect(content(root)).toContain('60 MB')
  })

  it('keeps an image above the cap as a download row', async () => {
    // The bytes were never fetched, so the classifier must not win here.
    const { root } = await card(artifact({
      url: 'https://s3.node.test/work/big.png?signature',
      previewKind: 'download',
      name: 'big.png',
      key: 'results/big.png',
    }))

    expect(tag(root, 'img')).toBeUndefined()
    expect(element(root, (node) => node.tag === 'a' && Boolean(node.props.download)).props.download).toBe('big.png')
  })

  it('says it is reading, then reports a failed read', async () => {
    let release = () => {}
    vi.stubGlobal('fetch', vi.fn(async () => {
      await new Promise<void>((resolve) => { release = resolve })
      throw new Error('The object could not be fetched (HTTP 403).')
    }))

    const { root } = await card(artifact({
      url: 'blob:aruna/notes',
      contentType: 'text/plain',
      previewKind: 'text',
      name: 'notes.txt',
      key: 'out/notes.txt',
    }))
    expect(content(root)).toContain('Reading the file')

    release()
    await flush()

    expect(content(root)).toContain('The object could not be fetched (HTTP 403).')
    expect(content(root)).not.toContain('Reading the file')
  })

  it('shows the caption the assistant wrote', async () => {
    const { root } = await card(artifact(), 'Reads per day across the run')

    expect(content(root)).toContain('Reads per day across the run')
  })
})
