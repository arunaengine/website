import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, element, flush, moduleDefault, mountApp } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as DataIdentity from '@/lib/crate/dataIdentity'

const sessionEpoch = ref(0)
const getGitRepository = vi.fn()
const Empty = defineComponent(() => () => null)
const BadgeStub = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const DocsLinkStub = defineComponent({
  props: { topic: String, label: String },
  setup: (props) => () => h('a', { 'data-topic': props.topic }, props.label),
})

const NoticeStub = defineComponent({
  props: { tone: String, title: String },
  setup: (props, { slots }) => () => h('div', { 'data-tone': props.tone }, [props.title, ' ', slots.default?.()]),
})
const SpinnerStub = defineComponent({ props: { label: String }, setup: (props) => () => h('span', props.label) })

const LinkStub = defineComponent({
  props: { to: { type: Object, required: true } },
  setup: (props, { slots }) => () => h('a', { to: props.to }, slots.default?.()),
})

const DatasetGitRow = compileClientComponent(new URL('./DatasetGitRow.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
  '@/components/ui/CopyButton.vue': moduleDefault(Empty),
  '@/components/ui/DocsLink.vue': moduleDefault(DocsLinkStub),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/components/ui/Spinner.vue': moduleDefault(SpinnerStub),
  '@/composables/useAruna': {
    useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('bearer'), sessionEpoch }),
  },
  '@/lib/api': { ...Api, getGitRepository },
  '@/lib/crate/dataIdentity': DataIdentity,
  'vue-router': { RouterLink: LinkStub },
})

const CLONE = 'https://api.test/git/d1.git'

function repository(documentId = 'd1') {
  return { document_id: documentId, clone_url: `https://api.test/git/${documentId}.git`, lfs_url: '', bucket: 'b', refs: {} }
}

beforeEach(() => {
  // A fresh session per test keeps the row's shared answer cache apart.
  sessionEpoch.value += 100
  getGitRepository.mockReset()
})

describe('DatasetGitRow', () => {
  it('shows the clone URL with the docs link', async () => {
    getGitRepository.mockResolvedValue(repository())
    const mounted = await mountApp(DatasetGitRow, { props: { documentId: 'd1' } })
    await flush()
    const text = content(mounted.root)

    expect(getGitRepository).toHaveBeenCalledWith('d1', { baseUrl: 'https://api.test', token: 'bearer' })
    expect(text).toContain('Git repository')
    expect(text).toContain(CLONE)
    expect(text).toContain('How to use Git with a dataset')
    mounted.app.unmount()
  })

  it.each([
    ['rocrate', 'RO-Crate'],
    ['arc', 'ARC'],
  ])('labels a %s repository', async (layout, label) => {
    getGitRepository.mockResolvedValue({ ...repository(), layout })
    const mounted = await mountApp(DatasetGitRow, { props: { documentId: 'd1' } })
    await flush()

    expect(content(mounted.root)).toContain(`Git repository ${label}`)
    mounted.app.unmount()
  })

  it('shows no layout when the node sends none', async () => {
    getGitRepository.mockResolvedValue(repository())
    const mounted = await mountApp(DatasetGitRow, { props: { documentId: 'd1' } })
    await flush()

    expect(content(mounted.root)).not.toMatch(/Git repository (ARC|RO-Crate)/)
    mounted.app.unmount()
  })

  it('says where pushed files are stored', async () => {
    getGitRepository.mockResolvedValue({
      ...repository(),
      storage_location: { bucket: 'datasets-g1', prefix: 'd1/', default: true },
    })
    const mounted = await mountApp(DatasetGitRow, { props: { documentId: 'd1', groupId: 'G1' } })
    await flush()

    expect(content(mounted.root)).toContain('Files you push are stored in datasets-g1/d1/.')
    expect(element(mounted.root, (node) => node.tag === 'a' && Boolean(node.props.to)).props.to).toEqual({
      name: 'bucket',
      params: { bucketId: 'datasets-g1' },
      query: { prefix: 'd1', group: 'G1' },
    })
    mounted.app.unmount()
  })

  it('shows a location changed on the page over the cached one', async () => {
    getGitRepository.mockResolvedValue({
      ...repository(),
      storage_location: { bucket: 'datasets-g1', prefix: 'd1/', default: true },
    })
    const mounted = await mountApp(DatasetGitRow, {
      props: { documentId: 'd1', changed: { bucket: 'raw', prefix: 'reads/' } },
    })
    await flush()

    expect(content(mounted.root)).toContain('Files you push are stored in raw/reads/.')
    mounted.app.unmount()
  })

  it('leaves out the storage sentence for an older node', async () => {
    getGitRepository.mockResolvedValue(repository())
    const mounted = await mountApp(DatasetGitRow, { props: { documentId: 'd1' } })
    await flush()

    expect(content(mounted.root)).not.toContain('Files you push')
    mounted.app.unmount()
  })

  it('reuses the answer when the row mounts again', async () => {
    getGitRepository.mockResolvedValue(repository())
    const first = await mountApp(DatasetGitRow, { props: { documentId: 'd1' } })
    await flush()
    first.app.unmount()
    const second = await mountApp(DatasetGitRow, { props: { documentId: 'd1' } })
    await flush()

    expect(content(second.root)).toContain(CLONE)
    expect(getGitRepository).toHaveBeenCalledTimes(1)
    second.app.unmount()
  })

  it('notes that data files use Git LFS and the push limit', async () => {
    getGitRepository.mockResolvedValue(repository())
    const mounted = await mountApp(DatasetGitRow, { props: { documentId: 'd1' } })
    await flush()
    const text = content(mounted.root)

    expect(text).toContain('Data files use Git LFS')
    expect(text).toContain('git-lfs must be installed')
    expect(text).toContain('at most 4 MiB of new Git objects')
    expect(text).not.toContain('Updating snapshot')
    mounted.app.unmount()
  })

  it('shows a failed conversion as a warning', async () => {
    getGitRepository.mockResolvedValue({ ...repository(), error: 'assays/seq is missing isa.assay.xlsx' })
    const mounted = await mountApp(DatasetGitRow, { props: { documentId: 'd1' } })
    await flush()
    const warning = element(mounted.root, (node) => node.props['data-tone'] === 'warning')

    expect(content(warning)).toContain('The last change could not be turned into a new version')
    expect(content(warning)).toContain('assays/seq is missing isa.assay.xlsx')
    mounted.app.unmount()
  })

  it('marks a pending snapshot and asks again on the next mount', async () => {
    getGitRepository.mockResolvedValueOnce({ ...repository(), pending: true }).mockResolvedValue(repository())
    const first = await mountApp(DatasetGitRow, { props: { documentId: 'd1' } })
    await flush()
    expect(content(first.root)).toContain('Updating snapshot')
    first.app.unmount()

    const second = await mountApp(DatasetGitRow, { props: { documentId: 'd1' } })
    await flush()
    expect(getGitRepository).toHaveBeenCalledTimes(2)
    expect(content(second.root)).not.toContain('Updating snapshot')
    second.app.unmount()
  })

  it('asks again while the snapshot is pending and stops once it is finished', async () => {
    vi.useFakeTimers()
    try {
      getGitRepository.mockResolvedValueOnce({ ...repository(), pending: true }).mockResolvedValue(repository())
      const mounted = await mountApp(DatasetGitRow, { props: { documentId: 'd1' } })
      await flush()
      expect(content(mounted.root)).toContain('Updating snapshot')

      await vi.advanceTimersByTimeAsync(2_000)
      await flush()
      expect(getGitRepository).toHaveBeenCalledTimes(2)
      expect(content(mounted.root)).not.toContain('Updating snapshot')

      await vi.advanceTimersByTimeAsync(60_000)
      expect(getGitRepository).toHaveBeenCalledTimes(2)
      mounted.app.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([404, 403, 503])('stays hidden when the node answers %i', async (status) => {
    getGitRepository.mockRejectedValue(new Api.ApiError(status, 'no'))
    const mounted = await mountApp(DatasetGitRow, { props: { documentId: 'd1' } })
    await flush()

    expect(content(mounted.root)).toBe('')
    mounted.app.unmount()
  })

  it('drops an answer that arrives after the session changed', async () => {
    let answer!: (value: ReturnType<typeof repository>) => void
    getGitRepository
      .mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
      .mockRejectedValueOnce(new Api.ApiError(403, 'no'))
    const mounted = await mountApp(DatasetGitRow, { props: { documentId: 'd1' } })
    sessionEpoch.value++
    await flush()
    answer(repository())
    await flush()

    expect(content(mounted.root)).toBe('')
    mounted.app.unmount()
  })
})
