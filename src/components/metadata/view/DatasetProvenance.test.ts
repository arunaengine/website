import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it } from 'vitest'
import type { DatasetViewState } from '@/composables/useDatasetView'
import { compileClientComponent, content, mountApp, moduleDefault } from '@/test/clientRender'

const ViewStub = defineComponent({
  props: { start: Object },
  setup: (props) => () => {
    const start = props.start as { kind: string; documentId: string; title: string }
    return h('section', `provenance ${start.kind} ${start.documentId} ${start.title}`)
  },
})

const component = compileClientComponent(new URL('./DatasetProvenance.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/data/ProvenanceView.vue': moduleDefault(ViewStub),
  '@/components/ui/Skeleton.vue': moduleDefault(defineComponent(() => () => h('div', 'waiting'))),
  '@/components/ui/SectionHeading.vue': moduleDefault(defineComponent({ props: { title: String }, setup: (props) => () => h('h2', props.title) })),
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => null) }),
})

function state(entities: boolean, loading = false): DatasetViewState {
  return { currentCrate: ref({ '@graph': [] }), crateHasEntities: ref(entities), loadingCrate: ref(loading) } as unknown as DatasetViewState
}

describe('dataset provenance', () => {
  it('starts the provenance view at the dataset', async () => {
    const { root } = await mountApp(component, { props: { state: state(true), documentId: 'd1', title: 'Gut isolates' } })
    expect(content(root)).toContain('provenance dataset d1 Gut isolates')
  })

  it('waits for the crate before following anything', async () => {
    const { root } = await mountApp(component, { props: { state: state(false, true), documentId: 'd1', title: 'x' } })
    expect(content(root)).toContain('waiting')
    const { root: empty } = await mountApp(component, { props: { state: state(false), documentId: 'd1', title: 'x' } })
    expect(content(empty)).toContain('nothing to follow')
  })
})
