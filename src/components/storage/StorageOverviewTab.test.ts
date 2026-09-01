import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import * as Storage from '@/lib/storage'
import { compileClientComponent, content, flush, mountApp, moduleDefault } from '@/test/clientRender'
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
  '@/components/data/BucketDangerZone.vue': moduleDefault(
    defineComponent({ setup: () => () => h('div', 'Delete bucket permanently…') }),
  ),
  '@/composables/useAruna': {
    useAruna: () => ({ getBucketRouting, getGroupRouting, listGroupBackends }),
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

    expect(text).toContain('None: copies of this bucket are not governed')
    expect(text).toContain('Node default')
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

    expect(text).toContain('Policy')
    expect(text).toContain('Observed on this node')
    expect(text).toContain('Class cold')
    expect(text).toContain('Copies inside the EU')
    expect(text).toContain('1 out, 1 in')
    expect(text).toContain('Only syncs you created are counted.')
  })

  it('says who may read a refused fact instead of showing nothing', async () => {
    getBucketRouting.mockRejectedValue(new Api.ApiError(403, 'Forbidden'))
    getBucketPlacement.mockRejectedValue(new Api.ApiError(403, 'Forbidden'))
    getGroupRouting.mockResolvedValue({ group_id: 'g-1', warnings: [] })
    listGroupBackends.mockResolvedValue({ backends: [] })
    syncRows.value = []

    const text = await render()

    expect(text).toContain('Only admins of the group that owns this bucket may read it.')
    expect(text).toContain('Only group admins of this bucket and realm admins may read it.')
  })

  it('carries the danger zone with the bucket deletion control', async () => {
    getBucketRouting.mockResolvedValue({ bucket: 'reef-survey', rules: [], warnings: [] })
    getGroupRouting.mockResolvedValue({ group_id: 'g-1', warnings: [] })
    listGroupBackends.mockResolvedValue({ backends: [] })
    getBucketPlacement.mockResolvedValue({ bucket: 'reef-survey', policies: [], generation: 1 })
    syncRows.value = []

    const text = await render()

    expect(text).toContain('Danger zone')
    expect(text).toContain('nothing brings them back')
    expect(text).toContain('Delete bucket permanently…')
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
