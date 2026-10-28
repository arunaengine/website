import { defineComponent, h } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as TableImport from '@/lib/tableImport'
import { compileClientComponent, content, element, flush, mountApp, moduleDefault } from '@/test/clientRender'

const searchObjects = vi.fn(async () => ({ hits: [{ key: 'GCF_000005845.2_ASM584v2/' }], next_cursor: null, coverage: { complete: true } }))

const component = compileClientComponent(new URL('./MetadataSearch.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => h('i')) }),
  '@/components/ui/Button.vue': moduleDefault(defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) })),
  '@/composables/useAruna': { useAruna: () => ({ searchObjects }) },
  '@/lib/tableImport': TableImport,
  '@/lib/utils': { errorMessage: (cause: unknown) => String(cause) },
})

describe('bucket metadata search', () => {
  it('turns column=value into a chip and searches the bucket metadata', async () => {
    const opened: string[] = []
    const { root } = await mountApp(component, { props: { bucket: 'ncbi', onOpen: (key: string) => opened.push(key) } })
    const box = element(root, (node) => node.tag === 'input')
    ;(box.props['onUpdate:modelValue'] as (value: string) => void)('coli species_taxid=562')
    await flush()
    ;(element(root, (node) => node.tag === 'form').props.onSubmit as (event: Event) => void)({ preventDefault: () => {} } as Event)
    await flush()

    expect(searchObjects).toHaveBeenCalledWith('coli species_taxid=562', { bucket: 'ncbi', match: 'metadata', limit: 50, cursor: undefined })
    expect(content(root)).toContain('species_taxid = 562')
    ;(element(root, (node) => node.tag === 'button' && content(node).includes('GCF_')).props.onClick as () => void)()
    expect(opened).toEqual(['GCF_000005845.2_ASM584v2/'])
  })
})
