import { defineComponent, h } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it } from 'vitest'
import { compileClientComponent, content, moduleDefault, mountApp } from '@/test/clientRender'

const Pass = defineComponent((_, { slots }) => () => h('div', [slots.header?.(), slots.default?.(), slots.actions?.()]))
const Rows = defineComponent({
  props: { rows: Array },
  setup: (props) => () => h('dl', (props.rows as Array<{ label: string; value: string }>).map((row) => `${row.label}: ${row.value};`)),
})

const component = compileClientComponent(new URL('./VisitorFileDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/distributed/RowList.vue': moduleDefault(Rows),
  '@/components/ui/Button.vue': moduleDefault(Pass),
  '@/components/ui/DetailDialog.vue': moduleDefault(Pass),
  '@/components/ui/DialogTitle.vue': moduleDefault(Pass),
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: (id: string) => `node ${id}` }) },
  '@/lib/utils': { formatBytes: String, formatDate: String },
  '@lucide/vue': { Download: Pass },
})

describe('VisitorFileDialog', () => {
  it('names the bucket nodes without claiming the file is stored on each', async () => {
    const file = { key: 'a.txt', name: 'a.txt', size: 3, lastModified: null, contentType: null, versionId: 'v1' }
    const { root } = await mountApp(component, { props: { file, bucket: 'refseq', download: null, nodes: ['n2', 'n3'] } })
    expect(content(root)).toContain('Bucket nodes: node n2, node n3;')
    expect(content(root)).not.toContain('Stored on')
  })
})
