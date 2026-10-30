import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Licenses from '@/lib/licenses'
import { PROCESS_RUN_PROFILE_URI } from '@/lib/profiles/builtinProfiles'
import { compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes } from '@/test/clientRender'

const metadata = ref<unknown[]>([])
const listRecentMetadata = vi.fn()
const LinkStub = defineComponent({ props: { to: Object }, setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()) })
const Pass = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const HeadingStub = defineComponent({ props: { title: String }, setup: (props, { slots }) => () => h('div', [h('h2', props.title), slots.actions?.()]) })
const RecentDatasetsCard = compileClientComponent(new URL('./RecentDatasetsCard.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub },
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => null) }),
  '@/components/ui/Button.vue': moduleDefault(Pass),
  '@/components/ui/SectionHeading.vue': moduleDefault(HeadingStub),
  '@/components/ui/StatusMark.vue': moduleDefault(defineComponent(() => () => null)),
  '@/composables/useAruna': { useAruna: () => ({ metadata, myGroups: ref([{ id: 'g1', name: 'demo' }]), listRecentMetadata, sessionEpoch: ref(1) }) },
  '@/lib/licenses': Licenses,
  '@/lib/utils': { relativeTime: (value: string) => `at ${value}` },
})

const doc = (ulid: string, title: string, updatedAt: string) => ({ ulid, title, updatedAt, type: 'Dataset', conformsToIds: [] as string[], linkedObjects: [] as string[], license: '', realmId: '' })
const run = (ulid: string, title: string) => ({ ...doc(ulid, title, '2026-10-29'), conformsToIds: [PROCESS_RUN_PROFILE_URI] })

describe('recent datasets', () => {
  it('lists the newest datasets from the registry, each opening the dataset', async () => {
    listRecentMetadata.mockResolvedValueOnce({ documents: [doc('d2', 'Reef census', '2026-10-29'), doc('d1', 'Coral survey', '2026-10-28')], complete: true })
    const mounted = await mountApp(RecentDatasetsCard)
    await flush()

    expect(nodes(mounted.root).filter((node) => node.tag === 'a' && node.props['data-to']?.toString().includes('dataset"')).map((node) => content(node).trim())).toEqual([
      'Reef census',
      'Coral survey',
    ])
    expect(JSON.parse(String(element(mounted.root, (node) => node.tag === 'a' && content(node).trim() === 'Reef census').props['data-to']))).toEqual({ name: 'dataset', params: { id: 'd2' } })
    expect(content(mounted.root)).toContain('Updated at 2026-10-29')
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

  it('lists run records too, with their files, group and license, and offers to create a dataset when none exist', async () => {
    listRecentMetadata.mockClear().mockResolvedValueOnce({
      documents: [{ ...run('r1', 'Annotate my genome with Bakta'), linkedObjects: ['a', 'b'], realmId: 'g1', license: 'https://creativecommons.org/licenses/by/4.0/' }, doc('d1', 'Reef census', '2026-10-28')],
      complete: true,
    })
    const mixed = await mountApp(RecentDatasetsCard)
    await flush()
    expect(listRecentMetadata).toHaveBeenCalledWith(5)
    const text = content(mixed.root).replace(/\s+/g, ' ')
    expect(text).toContain('Annotate my genome with Bakta2 filesdemoCC BY 4.0Updated at 2026-10-29')
    expect(text).toContain('Reef censusUpdated at 2026-10-28')
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
    metadata.value = []
    const window = await mountApp(RecentDatasetsCard)
    await flush()
    expect(content(window.root)).toContain('No recent datasets.')
    window.app.unmount()
  })
})
