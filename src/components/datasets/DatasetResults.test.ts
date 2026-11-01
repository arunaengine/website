import { createSSRApp, defineComponent, h, ref } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const currentUser = ref<{ id: string } | null>(null)
const Empty = defineComponent(() => () => null)
const state = {
  partial: ref(false),
  nodesQueried: ref(0),
  nodesFailed: ref(0),
  textQuery: ref('bakta'),
  kindFilter: ref('all'),
  groupMatches: ref([]),
  bucketResults: ref([]),
  bucketNodesQueried: ref(0),
  bucketNodesFailed: ref(0),
  bucketsSearching: ref(false),
  bucketsError: ref(null),
  bucketsPartial: ref(false),
  peopleResults: ref([]),
  peopleSearching: ref(false),
  retrySearch: vi.fn(),
  showKind: () => false,
}

let DatasetResults: ReturnType<typeof defineComponent>

beforeAll(async () => {
  vi.doMock('vue-router', () => ({ RouterLink: defineComponent((_, { slots }) => () => h('a', slots.default?.())) }))
  vi.doMock('@/composables/useAruna', () => ({ useAruna: () => ({ realm: ref({ name: 'Realm' }), currentUser }) }))
  vi.doMock('@/composables/useRealmNodes', () => ({ useRealmNodes: () => ({ displayName: (id: string) => id, isLocalNode: () => true }) }))
  vi.doMock('@/components/datasets/DatasetHits.vue', () => ({ default: Empty }))
  vi.doMock('@/components/datasets/DatasetObjectResults.vue', () => ({ default: Empty }))
  DatasetResults = (await import('./DatasetResults.vue')).default
})

const render = () => renderToString(createSSRApp(DatasetResults, { state }))

describe('dataset search results', () => {
  it('offers no result types a visitor cannot search', async () => {
    currentUser.value = null
    const html = await render()
    for (const label of ['Data objects', 'Buckets', 'Groups', 'Users']) expect(html).not.toContain(label)
  })

  it('offers every result type with a session', async () => {
    currentUser.value = { id: 'u1' }
    const html = await render()
    for (const label of ['Datasets', 'Data objects', 'Buckets', 'Groups', 'Users']) expect(html).toContain(label)
  })
})
