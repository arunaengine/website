import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as TableImport from '@/lib/tableImport'
import { compileClientComponent, content, element, flush, mountApp, moduleDefault } from '@/test/clientRender'

const hit = { key: 'GCF_000005845.2_ASM584v2/', bucket: 'ncbi', issuer_node_id: 'n2', group_id: 'g1' }
const searchObjects = vi.fn(async () => ({ hits: [hit], next_cursor: null, coverage: { complete: true } }))

const component = compileClientComponent(new URL('./MetadataSearch.vue', import.meta.url), {
  vue: VueRuntime,
  // Searching while typing waits for a pause; here the pause is over at once.
  '@vueuse/core': { watchDebounced: (source: never, callback: never) => VueRuntime.watch(source, callback) },
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

  it('keeps a quoted value with a space whole', async () => {
    searchObjects.mockClear()
    const { root } = await mountApp(component, { props: { bucket: 'ncbi', nodeId: null } })
    const input = () => element(root, (node) => node.tag === 'input')
    ;(input().props['onUpdate:modelValue'] as (value: string) => void)('assembly_level="Complete')
    await flush()
    ;(input().props.onKeydown as (event: KeyboardEvent) => void)({ key: ' ' } as KeyboardEvent)
    await flush()
    expect(content(root)).not.toContain('assembly_level =')

    ;(input().props['onUpdate:modelValue'] as (value: string) => void)('assembly_level="Complete Genome"')
    await flush()
    ;(element(root, (node) => node.tag === 'form').props.onSubmit as (event: Event) => void)({ preventDefault: () => {} } as Event)
    await flush()
    expect(content(root)).toContain('assembly_level = Complete Genome')
    expect(searchObjects).toHaveBeenLastCalledWith('assembly_level="Complete Genome"', expect.objectContaining({ match: 'metadata' }))
  })

  it('finds file names while typing and keeps one hit per file', async () => {
    const file = { key: 'reads/ui-hello.txt', bucket: 'ncbi', issuer_node_id: 'n1', group_id: 'g1' }
    searchObjects.mockReset()
    searchObjects.mockImplementation(async (_q: string, options: { match: string }) =>
      ({ hits: options.match === 'substring' ? [file] : [file, hit], next_cursor: null, coverage: { complete: true } }) as never)
    const { root } = await mountApp(component, { props: { bucket: 'ncbi', nodeId: null } })
    ;(element(root, (node) => node.tag === 'input').props['onUpdate:modelValue'] as (value: string) => void)('hello')
    await flush()

    expect(searchObjects).toHaveBeenCalledWith('hello', { bucket: 'ncbi', match: 'substring', limit: 50 })
    expect(searchObjects).toHaveBeenCalledWith('hello', expect.objectContaining({ match: 'metadata' }))
    expect(content(root).split('reads/ui-hello.txt')).toHaveLength(2)
    expect(content(root)).toContain('GCF_')
  })
})
