import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import * as Storage from '@/lib/storage'
import * as Utils from '@/lib/utils'
import { compileClientComponent, content, flush, mountApp, moduleDefault, nodes } from '@/test/clientRender'
import type { SyncRow } from '@/composables/useBucketSyncs'

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const FactListStub = defineComponent({
  props: { items: { type: Array, default: () => [] } },
  setup: (props, { slots }) => () =>
    h(
      'dl',
      (props.items as Array<{ key: string; label: string; value: string }>).flatMap((item) => [
        h('dt', item.label),
        h('dd', slots[item.key] ? slots[item.key]!({ item }) : item.value),
      ]),
    ),
})

const getBucketRouting = vi.fn()
const getBucketUsage = vi.fn()
const getGroupRouting = vi.fn()
const listGroupBackends = vi.fn()
const getBucketPlacement = vi.fn()
const syncRows = ref<SyncRow[]>([])
const syncsError = ref<string | null>(null)

const tab = compileClientComponent(new URL('./StorageOverviewTab.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: Slotted('a') },
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/DocsLink.vue': moduleDefault(Slotted('a')),
  '@/components/ui/FactList.vue': moduleDefault(FactListStub),
  '@/components/ui/Skeleton.vue': moduleDefault(Slotted('div')),
  '@/composables/useAruna': {
    useAruna: () => ({ getBucketRouting, getBucketUsage, getGroupRouting, listGroupBackends }),
  },
  '@/composables/useBucketSyncs': {
    useBucketSyncs: () => ({
      rows: syncRows,
      loading: ref(false),
      error: syncsError,
      load: () => Promise.resolve(0),
    }),
  },
  '@/composables/usePlacementPolicies': {
    usePlacementPolicies: () => ({
      getBucketPlacement,
      policyName: (policy: { name?: string | null; policy_id: string }) => policy.name ?? policy.policy_id,
    }),
  },
  '@/lib/api': Api,
  '@/lib/storage': Storage,
  '@/lib/utils': Utils,
})

function usageBody(overrides: Record<string, unknown> = {}) {
  return {
    bucket: 'reef-survey',
    objects: 12,
    versions: 20,
    delete_markers: 3,
    open_multipart_uploads: 1,
    logical_bytes: 5 * 1024 * 1024,
    complete: true,
    ...overrides,
  }
}

beforeEach(() => {
  getBucketUsage.mockReset()
  getBucketUsage.mockResolvedValue(usageBody())
})

async function render(props: Record<string, unknown> = {}) {
  const { root } = await mountApp(tab, {
    props: { bucket: 'reef-survey', groupId: 'g-1', nodeId: null, ...props },
  })
  await flush()
  return content(root)
}

describe('bucket storage overview', () => {
  it('states the none cases without inventing a copy count', async () => {
    getBucketRouting.mockResolvedValue({ bucket: 'reef-survey', rules: [], warnings: [] })
    getGroupRouting.mockResolvedValue({ group_id: 'g-1', warnings: [] })
    listGroupBackends.mockResolvedValue({ backends: [] })
    getBucketPlacement.mockResolvedValue({ bucket: 'reef-survey', policies: [], generation: 1 })
    syncRows.value = []

    const text = await render()

    expect(text).toContain('Copies of this bucket are not governed.')
    expect(text).toContain('Node default')
    expect(text).toContain('No bucket rule and no group default.')
    expect(text).toContain('Checked per file')
    expect(text).toMatch(/Syncs.*None/s)
    expect(text).not.toMatch(/\d+ copies/)
  })

  it('separates the rules from what this node observed', async () => {
    getBucketRouting.mockResolvedValue({
      bucket: 'reef-survey',
      rules: [{ key_prefix: '', exact: false, target: { class: 'cold' } }],
      warnings: [],
    })
    getGroupRouting.mockResolvedValue({ group_id: 'g-1', warnings: [] })
    listGroupBackends.mockResolvedValue({ backends: [] })
    getBucketPlacement.mockResolvedValue({
      bucket: 'reef-survey',
      policies: [{ policy_id: 'p-1', digest: 'a'.repeat(64), name: 'Copies inside the EU' }],
      generation: 4,
    })
    syncRows.value = [
      { relationship: { id: 's-1' }, direction: 'outgoing' },
      { relationship: { id: 's-2' }, direction: 'incoming' },
    ] as unknown as SyncRow[]

    const text = await render()

    expect(text).toContain('Rules this bucket carries')
    expect(text).toContain('Observed on this node')
    expect(text).not.toContain('What this node could see')
    expect(text).toContain('Class cold')
    expect(text).toContain('Set by the bucket rule.')
    expect(text).toContain('Copies inside the EU')
    expect(text).toContain('1 out, 1 in')
    expect(text).toContain('Only syncs you created are counted.')
  })

  it('leaves out a refused fact and names who may read the rest', async () => {
    getBucketRouting.mockRejectedValue(new Api.ApiError(403, 'Forbidden'))
    getBucketPlacement.mockRejectedValue(new Api.ApiError(403, 'Forbidden'))
    getGroupRouting.mockResolvedValue({ group_id: 'g-1', warnings: [] })
    listGroupBackends.mockResolvedValue({ backends: [] })
    syncRows.value = []

    const text = await render()

    expect(text).not.toContain('Storage backend')
    expect(text).toContain('Only group admins and realm admins may read it.')
  })

  it('points at the manual with an icon, not a labelled line', async () => {
    getBucketRouting.mockResolvedValue({ bucket: 'reef-survey', rules: [], warnings: [] })
    getGroupRouting.mockResolvedValue({ group_id: 'g-1', warnings: [] })
    listGroupBackends.mockResolvedValue({ backends: [] })
    getBucketPlacement.mockResolvedValue({ bucket: 'reef-survey', policies: [], generation: 1 })
    syncRows.value = []

    const { root } = await mountApp(tab, { props: { bucket: 'reef-survey', groupId: 'g-1', nodeId: null } })
    await flush()
    const links = nodes(root).filter((node) => node.tag === 'a' && node.props.topic === 'where-data-lives')

    expect(links.map((node) => node.props.section)).toEqual([
      'Storage backend',
      'Placement policies',
      'Storage locations',
      'Syncs',
    ])
    expect(links.every((node) => node.props.icon === '' || node.props.icon === true)).toBe(true)
    expect(content(root)).not.toContain('Learn about')
  })

  it('keeps destructive controls out of the settings view', async () => {
    getBucketRouting.mockResolvedValue({ bucket: 'reef-survey', rules: [], warnings: [] })
    getGroupRouting.mockResolvedValue({ group_id: 'g-1', warnings: [] })
    listGroupBackends.mockResolvedValue({ backends: [] })
    getBucketPlacement.mockResolvedValue({ bucket: 'reef-survey', policies: [], generation: 1 })
    syncRows.value = []

    const text = await render()

    expect(text).not.toContain('Danger zone')
    expect(text).not.toContain('Delete bucket')
  })

  it('counts what the bucket holds', async () => {
    const text = await render()

    expect(text).toContain('What this bucket holds')
    expect(text).toMatch(/Size.*5 MB/s)
    expect(text).toMatch(/Objects.*12/s)
    expect(text).toMatch(/Versions.*20/s)
    expect(text).toMatch(/Delete markers.*3/s)
    expect(text).toMatch(/Open multipart uploads.*1/s)
    expect(text).not.toContain('at least')
  })

  it('reports a capped scan as a lower bound', async () => {
    getBucketUsage.mockResolvedValue(usageBody({ complete: false }))

    const text = await render()

    expect(text).toContain('at least 5 MB')
    expect(text).toContain('at least 12')
    expect(text).toContain('every number here is a lower bound')
  })

  it('says a bucket is empty instead of listing zeros', async () => {
    getBucketUsage.mockResolvedValue(
      usageBody({ objects: 0, versions: 0, delete_markers: 0, open_multipart_uploads: 0, logical_bytes: 0 }),
    )

    const text = await render()

    expect(text).toContain('This bucket is empty')
    expect(text).not.toContain('Open multipart uploads')
  })

  it('hides the card on a node that does not serve the route', async () => {
    getBucketUsage.mockRejectedValue(new Api.ApiError(404, 'Not Found'))

    const text = await render()

    expect(text).not.toContain('What this bucket holds')
    expect(text).toContain('Rules this bucket carries')
  })

  it('reports a node that failed to count', async () => {
    getBucketUsage.mockRejectedValue(new Api.ApiError(500, 'Internal Server Error'))

    const text = await render()

    expect(text).toContain('This node did not answer, so the numbers are unknown right now.')
  })

  it('does not answer for a bucket hosted on another node', async () => {
    getBucketRouting.mockClear()
    getBucketPlacement.mockClear()
    syncRows.value = []

    const text = await render({ nodeId: 'node-far' })

    expect(text).toContain('Unknown here')
    expect(text).toContain('This bucket is hosted on another node.')
    expect(getBucketRouting).not.toHaveBeenCalled()
    expect(getBucketPlacement).not.toHaveBeenCalled()
  })
})
