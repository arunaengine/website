import { defineComponent, h } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, input, mountApp, moduleDefault, nodes, typeValue } from '@/test/clientRender'

const listBucketObjects = vi.fn()

const component = compileClientComponent(new URL('./RemoteObjectPicker.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => h('i')) }),
  '@/components/ui/Button.vue': moduleDefault(defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) })),
  '@/components/ui/Input.vue': moduleDefault(defineComponent({
    inheritAttrs: false,
    props: { modelValue: String },
    emits: ['update:modelValue'],
    setup: (props, { attrs, emit }) => () =>
      h('input', { ...attrs, value: props.modelValue, onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value) }),
  })),
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent(() => () => h('i'))),
  '@/composables/useAruna': { useAruna: () => ({ listBucketObjects }) },
  '@/lib/utils': { errorMessage: (cause: unknown) => (cause as Error).message },
})

describe('remote object picker', () => {
  it('drops the rows and cursor of the folder before when a folder fails to load', async () => {
    listBucketObjects.mockResolvedValueOnce({ bucket: 'db', objects: [{ key: 'top.tsv', version_id: 'v' }], prefixes: ['sub/'], next_cursor: 'c1' })
    listBucketObjects.mockRejectedValueOnce(new Error('node busy'))
    const { root } = await mountApp(component, { props: { bucket: 'db', nodeId: 'n2' } })
    await flush()
    expect(content(root)).toContain('top.tsv')
    expect(content(root)).toContain('Show more')

    await click(button(root, 'sub/'))
    await flush()
    expect(content(root)).toContain('node busy')
    expect(content(root)).not.toContain('top.tsv')
    expect(content(root)).not.toContain('Show more')
  })

  it('finds the names that start with the typed text in the open folder', async () => {
    listBucketObjects.mockReset()
      .mockResolvedValueOnce({ bucket: 'ncbi-refseq', objects: [], prefixes: ['GCF_000001/'], next_cursor: 'c1' })
      .mockResolvedValueOnce({ bucket: 'ncbi-refseq', objects: [], prefixes: ['GCF_000005845.2_ASM584v2/'] })
      .mockResolvedValueOnce({ bucket: 'ncbi-refseq', objects: [], prefixes: [] })
    const { root } = await mountApp(component, { props: { bucket: 'ncbi-refseq', nodeId: 'n2' } })
    await flush()
    const box = input(root, 'aria-label', 'Find a name in this folder')

    await typeValue(box, 'GCF_0000058')
    ;(box.props.onKeydown as (event: { key: string }) => void)({ key: 'Enter' })
    await flush()
    expect(listBucketObjects).toHaveBeenLastCalledWith('ncbi-refseq', { prefix: 'GCF_0000058', delimiter: '/', cursor: undefined }, 'n2')
    expect(content(root)).toContain('GCF_000005845.2_ASM584v2/')
    expect(content(root)).not.toContain('Show more')

    await typeValue(box, 'nothing')
    ;(box.props.onKeydown as (event: { key: string }) => void)({ key: 'Enter' })
    await flush()
    expect(content(root)).toContain('No name here starts with that.')
  })

  it('lists no folder marker as a file of its folder', async () => {
    listBucketObjects.mockResolvedValueOnce({ bucket: 'db', objects: [{ key: 'db/', version_id: 'm' }, { key: 'db/version.json', version_id: 'v' }], prefixes: [] })
    const { root } = await mountApp(component, { props: { bucket: 'db', nodeId: 'n2' } })
    await flush()

    const files = nodes(root).filter((node) => node.tag === 'label').map(content)
    expect(files).toEqual(['version.json'])
  })

  it('selects a file by its name and says how to enable Add', async () => {
    listBucketObjects.mockResolvedValueOnce({ bucket: 'laptop', objects: [{ key: 'genome.fasta', version_id: 'v' }], prefixes: [] })
    const { root } = await mountApp(component, { props: { bucket: 'laptop', nodeId: 'n2' } })
    await flush()
    expect(content(root)).toContain('Select files or folders to add them')

    const label = nodes(root).find((node) => node.tag === 'label' && content(node).includes('genome.fasta'))!
    const box = nodes(label).find((node) => node.tag === 'input')!
    ;(box.props.onChange as () => void)()
    await flush()
    expect(content(root)).toContain('Add 1 selected')
    expect(content(root)).not.toContain('Select files or folders to add them')
  })
})
