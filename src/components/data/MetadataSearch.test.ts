import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as TableImport from '@/lib/tableImport'
import { compileClientComponent, content, element, flush, mountApp, moduleDefault } from '@/test/clientRender'

const hit = { key: 'GCF_000005845.2_ASM584v2/', bucket: 'ncbi', issuer_node_id: 'n2', group_id: 'g1' }
const searchObjects = vi.fn(async () => ({ hits: [hit], next_cursor: null, coverage: { complete: true } }))

const component = compileClientComponent(new URL('./MetadataSearch.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => h('i')) }),
  '@/components/ui/Button.vue': moduleDefault(defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) })),
  '@/composables/useAruna': { useAruna: () => ({ searchObjects, sessionEpoch: ref(1) }) },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: (id: string) => `node ${id}`, isLocalNode: (id: string) => id === 'n1' }) },
  '@/lib/tableImport': TableImport,
  '@/lib/utils': { errorMessage: (cause: unknown) => String(cause) },
})

describe('bucket metadata search', () => {
  it('turns column=value into a chip and searches the bucket metadata', async () => {
    const opened: unknown[] = []
    const { root } = await mountApp(component, { props: { bucket: 'ncbi', nodeId: null, onOpen: (found: unknown) => opened.push(found) } })
    const box = element(root, (node) => node.tag === 'input')
    ;(box.props['onUpdate:modelValue'] as (value: string) => void)('coli species_taxid=562')
    await flush()
    ;(element(root, (node) => node.tag === 'form').props.onSubmit as (event: Event) => void)({ preventDefault: () => {} } as Event)
    await flush()

    expect(searchObjects).toHaveBeenCalledWith('coli species_taxid=562', { bucket: 'ncbi', match: 'metadata', limit: 50, cursor: undefined })
    expect(content(root)).toContain('species_taxid = 562')
    ;(element(root, (node) => node.tag === 'button' && content(node).includes('GCF_')).props.onClick as () => void)()
    expect(content(root)).toContain('on node n2')
    expect(opened).toEqual([hit])
  })

  it('drops an answer that arrives after the bucket changed', async () => {
    let answer: (value: unknown) => void = () => {}
    searchObjects.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)) as never)
    const { root, app } = await mountApp(component, { props: { bucket: 'ncbi', nodeId: null } })
    ;(element(root, (node) => node.tag === 'input').props['onUpdate:modelValue'] as (value: string) => void)('coli')
    await flush()
    ;(element(root, (node) => node.tag === 'form').props.onSubmit as (event: Event) => void)({ preventDefault: () => {} } as Event)
    await flush()

    const vm = app._instance!
    ;(vm.props as { bucket: string }).bucket = 'other'
    await flush()
    answer({ hits: [hit], next_cursor: 'c2', coverage: { complete: true } })
    await flush()
    expect(content(root)).not.toContain('GCF_')
    expect(content(root)).not.toContain('Show more')
  })
})
