import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as DatasetPurpose from '@/lib/datasetPurpose'
import { PROCESS_RUN_PROFILE_URI } from '@/lib/profiles/builtinProfiles'
import { compileClientComponent, content, element, flush, mountApp, nodes } from '@/test/clientRender'

const metadata = ref<unknown[]>([])
const listRecentMetadata = vi.fn()
const LinkStub = defineComponent({ props: { to: Object }, setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()) })
const RecentDatasetsCard = compileClientComponent(new URL('./RecentDatasetsCard.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub },
  '@/composables/useAruna': { useAruna: () => ({ metadata, listRecentMetadata, sessionEpoch: ref(1) }) },
  '@/lib/utils': { relativeTime: (value: string) => `at ${value}` },
  '@/lib/datasetPurpose': DatasetPurpose,
})

const doc = (ulid: string, title: string, updatedAt: string) => ({ ulid, title, updatedAt, type: 'Dataset', conformsToIds: [] as string[] })
const run = (ulid: string, title: string) => ({ ...doc(ulid, title, '2026-10-29'), conformsToIds: [PROCESS_RUN_PROFILE_URI] })

describe('recent datasets', () => {
  it('lists the newest datasets from the registry, each opening the dataset', async () => {
    listRecentMetadata.mockResolvedValueOnce({ documents: [doc('d2', 'Reef census', '2026-10-29'), doc('d1', 'Coral survey', '2026-10-28')], complete: true })
    const mounted = await mountApp(RecentDatasetsCard)
    await flush()

    expect(nodes(mounted.root).filter((node) => node.tag === 'a' && node.props['data-to']?.toString().includes('dataset"')).map((node) => content(node))).toEqual([
      'Reef censusat 2026-10-29',
      'Coral surveyat 2026-10-28',
    ])
    expect(JSON.parse(String(element(mounted.root, (node) => node.tag === 'a' && content(node) === 'Reef censusat 2026-10-29').props['data-to']))).toEqual({ name: 'dataset', params: { id: 'd2' } })
    expect(content(mounted.root)).toContain('All datasets')
    mounted.app.unmount()
  })

  it('falls back to the loaded catalog when the node cannot order by recency', async () => {
    listRecentMetadata.mockResolvedValueOnce(null)
    metadata.value = [doc('old', 'Old one', '2026-01-01'), doc('new', 'New one', '2026-10-01')]
    const mounted = await mountApp(RecentDatasetsCard)
    await flush()
    expect(content(mounted.root).indexOf('New one')).toBeLessThan(content(mounted.root).indexOf('Old one'))
    mounted.app.unmount()
    metadata.value = []
  })

  it('leaves run records to the runs card and offers to create a dataset when none remain', async () => {
    listRecentMetadata.mockClear().mockResolvedValueOnce({ documents: [run('r1', 'Annotate my genome with Bakta'), doc('d1', 'Reef census', '2026-10-28')], complete: true })
    const mixed = await mountApp(RecentDatasetsCard)
    await flush()
    expect(listRecentMetadata).toHaveBeenCalledWith(5, { skipRuns: true })
    expect(content(mixed.root)).toContain('Reef census')
    expect(content(mixed.root)).not.toContain('Annotate my genome')
    mixed.app.unmount()

    // The registry was read to its end and holds no dataset.
    listRecentMetadata.mockResolvedValueOnce({ documents: [], complete: true })
    const none = await mountApp(RecentDatasetsCard)
    await flush()
    expect(content(none.root)).toContain('No datasets you can see yet.')
    const create = element(none.root, (node) => node.tag === 'a' && content(node) === 'Create dataset')
    expect(JSON.parse(String(create.props['data-to']))).toEqual({ name: 'dataset-new' })
    none.app.unmount()
  })

  it('never claims there are none when the walk stopped early or only the loaded window was read', async () => {
    listRecentMetadata.mockResolvedValueOnce({ documents: [], complete: false })
    const cut = await mountApp(RecentDatasetsCard)
    await flush()
    expect(content(cut.root)).toContain('No recent datasets.')
    expect(content(cut.root)).not.toContain('No datasets you can see yet.')
    expect(content(cut.root)).not.toContain('Create dataset')
    cut.app.unmount()

    listRecentMetadata.mockResolvedValueOnce(null)
    metadata.value = [run('r1', 'Annotate my genome with Bakta')]
    const window = await mountApp(RecentDatasetsCard)
    await flush()
    expect(content(window.root)).toContain('No recent datasets.')
    window.app.unmount()
    metadata.value = []
  })
})
