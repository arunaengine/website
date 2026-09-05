import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, element, flush, mountApp, moduleDefault } from '@/test/clientRender'
import type { DatasetViewState } from '@/composables/useDatasetView'

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const GraphStub = defineComponent({
  props: { source: null, mode: String, height: String },
  emits: ['open'],
  setup: (props, { emit }) => () =>
    h('div', { class: 'graph', 'data-mode': props.mode, onClick: () => emit('open', 'images/a.png') }, [
      `entities:${((props.source as { '@graph'?: unknown[] })['@graph'] ?? []).length}`,
    ]),
})

const DatasetGraph = compileClientComponent(new URL('./DatasetGraph.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Skeleton.vue': moduleDefault(defineComponent(() => () => h('div', 'waiting'))),
  '@/components/metadata/CrateGraph.vue': moduleDefault(GraphStub),
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
})

const crate = {
  '@graph': [
    { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
    { '@id': './', '@type': 'Dataset', name: 'Pictures', hasPart: { '@id': 'images/a.png' } },
    { '@id': 'images/a.png', '@type': 'File' },
  ],
}

function state(options: { entities: boolean; loading?: boolean }): DatasetViewState {
  return {
    currentCrate: ref(options.entities ? crate : {}),
    crateHasEntities: ref(options.entities),
    loadingCrate: ref(options.loading ?? false),
  } as unknown as DatasetViewState
}

describe('DatasetGraph', () => {
  it('draws the loaded crate read-only and hands an opened node to the page', async () => {
    const open = vi.fn()
    const { root } = await mountApp(DatasetGraph, { props: { state: state({ entities: true }), onOpen: open } })
    await flush()
    const graph = element(root, (node) => String(node.props.class).includes('graph'))

    expect(graph.props['data-mode']).toBe('view')
    expect(content(graph)).toBe('entities:3')
    expect(content(root)).toContain('double-click to open it')

    ;(graph.props.onClick as () => void)()
    expect(open).toHaveBeenCalledWith('images/a.png')
  })

  it('waits while the crate loads and says so when there is nothing', async () => {
    const loading = await mountApp(DatasetGraph, { props: { state: state({ entities: false, loading: true }) } })
    const empty = await mountApp(DatasetGraph, { props: { state: state({ entities: false }) } })

    expect(content(loading.root)).toContain('waiting')
    expect(content(empty.root)).toContain('nothing to draw')
  })
})
