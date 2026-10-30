import { defineComponent, h } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Databases from '@/lib/databases'
import { button, click, compileClientComponent, content, element, flush, mountApp, moduleDefault, typeValue } from '@/test/clientRender'

const DATASET = '01M63099Q2000108CB51QQDB2P'
const aruna = vi.hoisted(() => ({ describeBucket: vi.fn(), putBucketMetadata: vi.fn() }))

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const Field = (tag: string) => defineComponent({
  inheritAttrs: false,
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h(tag, { ...attrs, value: props.modelValue, onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value) }),
})
const LicenseStub = defineComponent({
  props: { modelValue: Object },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h('select', { onChange: (event: { target: { value: string } }) => emit('update:modelValue', { ...(props.modelValue as object), value: event.target.value }) }),
})

const component = compileClientComponent(new URL('./BucketDatasetForm.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/metadata/editor/ValueInput.vue': moduleDefault(LicenseStub),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Input.vue': moduleDefault(Field('input')),
  '@/components/ui/Textarea.vue': moduleDefault(Field('textarea')),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/Switch.vue': moduleDefault(Slotted('span')),
  '@/composables/useAruna': { useAruna: () => aruna },
  '@/lib/api': { apiErrorMessage: (cause: unknown) => (cause as Error).message },
  '@/lib/crate/editor': { LICENSE_PRESETS: [] },
  '@/lib/databases': Databases,
})

const field = (root: Parameters<typeof element>[0], id: string) => element(root, (node) => node.props.id === id)

describe('describe or link a bucket dataset', () => {
  it('creates the dataset prefilled with the bucket name and refuses a DOI it cannot read', async () => {
    const created = { bucket: 'reads', dataset: DATASET, metadata: { database: false, dataset: DATASET }, description: { title: 'reads', identifiers: [] } }
    aruna.describeBucket.mockResolvedValue(created)
    const onLinked = vi.fn()
    const { root } = await mountApp(component, { props: { mode: 'describe', bucket: 'reads', nodeId: 'n2', metadata: { database: false }, onLinked } })

    expect(field(root, 'dataset-title').props.value).toBe('reads')
    expect(button(root, 'Create the dataset').props.disabled).toBe(true)
    await typeValue(field(root, 'dataset-description'), 'Sequencing reads of the lab')
    await typeValue(field(root, 'dataset-page'), 'not a doi')
    expect(content(root)).toContain('Enter a DOI such as')
    expect(button(root, 'Create the dataset').props.disabled).toBe(true)

    await typeValue(field(root, 'dataset-page'), '10.5281/zenodo.7')
    ;(element(root, (node) => node.tag === 'select').props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'https://creativecommons.org/licenses/by/4.0/' } })
    await click(button(root, 'Create the dataset'))
    await flush()

    expect(aruna.describeBucket).toHaveBeenCalledWith('reads', {
      title: 'reads',
      description: 'Sequencing reads of the lab',
      version: null,
      license: 'https://creativecommons.org/licenses/by/4.0/',
      identifiers: [{ name: 'DOI', value: '10.5281/zenodo.7', url: 'https://doi.org/10.5281/zenodo.7' }],
      public: false,
    }, 'n2')
    expect(onLinked).toHaveBeenCalledWith({ metadata: created.metadata, description: created.description, description_unavailable: null })
  })

  it('links a dataset named by its link and keeps the other metadata', async () => {
    aruna.putBucketMetadata.mockRejectedValueOnce(new Error('dataset does not exist or you may not read it'))
    const onLinked = vi.fn()
    const { root } = await mountApp(component, { props: { mode: 'link', bucket: 'reads', nodeId: null, metadata: { database: false, parser: null }, onLinked } })

    await typeValue(field(root, 'dataset-link'), 'no id here')
    expect(button(root, 'Link the dataset').props.disabled).toBe(true)
    await typeValue(field(root, 'dataset-link'), `https://w3id.org/aruna/${DATASET.toLowerCase()}`)
    await click(button(root, 'Link the dataset'))
    await flush()

    expect(aruna.putBucketMetadata).toHaveBeenCalledWith('reads', { database: false, parser: null, dataset: DATASET }, null)
    expect(content(root)).toContain('you may not read it')
    expect(onLinked).not.toHaveBeenCalled()
  })
})
