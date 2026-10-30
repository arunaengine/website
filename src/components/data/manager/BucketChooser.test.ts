import { createSSRApp, defineComponent, h, ref } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it, vi } from 'vitest'

const ensure = vi.fn()
vi.mock('vue-router', () => ({
  RouterLink: defineComponent({
    props: { to: { type: Object, required: true } },
    setup: (props, { slots }) => () => h('a', { href: JSON.stringify(props.to) }, slots.default?.()),
  }),
}))
vi.mock('@/composables/useDatabases', () => ({
  useDatabases: () => ({ ensure: vi.fn(), find: (bucket: string) => (bucket === 'refseq' ? { title: 'NCBI RefSeq genomes' } : undefined) }),
}))
vi.mock('@/composables/useBucketUsage', () => ({
  useListedUsage: () => ({ ensure, textOf: (bucket: string) => (bucket === 'laptop' ? '16 files, 69.7 MB' : null) }),
}))

const BucketChooser = (await import('./BucketChooser.vue')).default

function manager(choice: string | null) {
  return {
    allBuckets: {
      needsName: ref(false),
      hits: ref([
        { arn: 'a1', bucket: 'laptop', node_id: 'n2', group_id: 'g1', created_at: '', nodes: [] },
        { arn: 'a2', bucket: 'refseq', node_id: 'n2', group_id: 'g1', created_at: '', set_id: 's1', nodes: ['n2', 'n3'] },
      ]),
    },
    sidebarBuckets: ref([{ bucket: 'only-here', nodeId: null, pinned: false }]),
    bucketNodeChoice: ref(choice),
    selectedGroupId: ref('g1'),
    realmNodes: { isLocalNode: (id: string | null) => !id || id === 'home', displayName: (id: string) => `name-${id}`, localNodeId: ref('home') },
  }
}

describe('bucket chooser', () => {
  it('links every listed bucket to the Data view with its node and group', async () => {
    const html = await renderToString(createSSRApp(BucketChooser, { manager: manager(null) }))
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

    expect(text).toContain('laptop 16 files, 69.7 MB, on name-n2')
    // A database leads with its title, then the same facts as any bucket.
    expect(text).toContain('refseq NCBI RefSeq genomes, spread over 2 nodes')
    expect(html).toContain(JSON.stringify({ name: 'bucket', params: { bucketId: 'laptop' }, query: { node: 'n2', group: 'g1' } }).replaceAll('"', '&quot;'))
    expect(ensure).toHaveBeenCalledWith([{ bucket: 'laptop', nodeId: 'n2' }, { bucket: 'refseq', nodeId: 'n2' }])
  })

  it('lists the one shown node without a size it does not know', async () => {
    const html = await renderToString(createSSRApp(BucketChooser, { manager: manager('home') }))
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

    expect(text).toContain('only-here on name-home')
    expect(text).not.toContain('laptop')
  })
})
