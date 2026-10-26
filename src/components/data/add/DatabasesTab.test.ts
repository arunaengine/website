import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it } from 'vitest'
import * as Databases from '@/lib/databases'
import { button, compileClientComponent, content, mountApp, moduleDefault } from '@/test/clientRender'

const rows = ref<Databases.DatabaseRow[]>([])
const state = ref('ready')
const distribution = { state: ref('loading'), view: ref<{ live?: { setId: string } } | null>(null) }

const component = compileClientComponent(new URL('./DatabasesTab.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) })),
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent(() => () => h('i'))),
  '@/composables/useDatabases': {
    useDatabases: () => ({
      rows, state, error: ref('node busy'), complete: ref(true), ensure: () => undefined,
      locate: async (item: Databases.DatabaseRow) => Databases.placeOf(item, null, 'n1'),
    }),
  },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ localNodeId: ref('n1') }) },
  '@/composables/useBucketDistribution': { useBucketDistribution: () => distribution },
  '@/lib/databases': Databases,
  '@/lib/utils': { errorMessage: (cause: unknown) => String(cause) },
})

function row(bucket: string, target: Databases.DatabaseRow['target']): Databases.DatabaseRow {
  return { entryId: `e-${bucket}`, datasetId: 'd', bucket, ownerGroup: 'g', title: `${bucket} title`, documentPath: null, state: 'active', public: false, target }
}

describe('databases in Add data', () => {
  it('offers the databases but not the open bucket, and hands the node of the chosen one on', async () => {
    rows.value = [
      row('self', { kind: 'ordinary', node_id: 'n1', bucket: 'self' }),
      row('far', { kind: 'ordinary', node_id: 'n2', bucket: 'far' }),
      row('spire', { kind: 'distributed', set_id: 's1' }),
    ]
    const chosen: unknown[][] = []
    const { root } = await mountApp(component, { props: { bucket: 'self', onChoose: (...args: unknown[]) => chosen.push(args) } })

    expect(content(root)).not.toContain('self title')
    await (button(root, 'Add from this database').props.onClick as () => void)()
    expect(chosen).toEqual([['far', 'n2', 'g']])
  })

  it('shows a failed read instead of an empty list', async () => {
    rows.value = []
    state.value = 'failed'
    const { root } = await mountApp(component, { props: { bucket: 'self' } })

    expect(content(root)).toContain('node busy')
    expect(content(root)).not.toContain('No database is listed')
    state.value = 'ready'
  })

  it('leaves out only the open bucket by its identity once its set is known', async () => {
    rows.value = [
      row('self', { kind: 'ordinary', node_id: 'n2', bucket: 'self' }),
      row('self-set', { kind: 'distributed', set_id: 's1' }),
      row('other-set', { kind: 'distributed', set_id: 's2' }),
    ]
    rows.value[1].bucket = 'self'
    distribution.state.value = 'ready'
    distribution.view.value = { live: { setId: 's1' } }
    const text = content((await mountApp(component, { props: { bucket: 'self' } })).root)

    expect(text).toContain('self title')
    expect(text).not.toContain('self-set title')
    expect(text).toContain('other-set title')
    distribution.state.value = 'loading'
    distribution.view.value = null
  })
})
