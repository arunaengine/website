import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it } from 'vitest'
import type { FileSource } from '@/lib/api'
import * as Sources from '@/lib/bucketSources'
import { compileClientComponent, content, mountApp, moduleDefault } from '@/test/clientRender'

const state = ref('ready')
const sources = ref<FileSource[]>([])
const complete = ref(true)
const Empty = defineComponent(() => () => h('i'))

const component = compileClientComponent(new URL('./BucketSources.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/distributed/RowList.vue': moduleDefault(defineComponent({ props: { rows: Array }, setup: (props) => () => h('ul', `${props.rows?.length} rows`) })),
  '@/components/distributed/StorageFeatureLink.vue': moduleDefault(Empty),
  '@/components/ui/Skeleton.vue': moduleDefault(Empty),
  '@/composables/useAruna': { useAruna: () => ({ listGroupBackends: async () => ({ backends: [] }) }) },
  '@/composables/useBucketSources': { useBucketSources: () => ({ sources, complete, state, error: ref('node busy') }) },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: (id: string) => id }) },
  '@/lib/bucketSources': Sources,
  '@/lib/utils': { truncateMiddle: (id: string) => id },
})

async function text(nodeId: string | null = null) {
  return content((await mountApp(component, { props: { bucket: 'lab', nodeId } })).root)
}

describe('bucket sources', () => {
  it('claims no sources only for a complete answer, and says what it never covers', async () => {
    state.value = 'ready'
    sources.value = []
    complete.value = true
    expect(await text()).toContain('No sync or storage folder feeds this bucket')
    expect(await text()).toContain('show it in their origin')

    complete.value = false
    expect(await text()).not.toContain('No sync or storage folder')
    expect(await text()).toContain('More sources exist than are listed')
    complete.value = true
  })

  it('keeps a node without the list, a failure and another node apart from no sources', async () => {
    sources.value = []
    state.value = 'missing'
    expect(await text()).toContain('This node does not list the sources')
    state.value = 'failed'
    expect(await text()).toContain('The sources could not be read: node busy')
    state.value = 'ready'
    expect(await text('n2')).toContain('on another node')
    for (const value of ['missing', 'failed']) {
      state.value = value
      expect(await text()).not.toContain('No sync or storage folder')
    }
  })
})
