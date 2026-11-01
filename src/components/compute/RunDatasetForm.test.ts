import { defineComponent, h } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as RunDataset from '@/lib/runDataset'
import { button, click, compileClientComponent, content, element, flush, mountApp, moduleDefault, typeValue } from '@/test/clientRender'

const aruna = vi.hoisted(() => ({ createMetadata: vi.fn(), sessionEpoch: { value: 1 } }))

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const Field = (tag: string) => defineComponent({
  inheritAttrs: false,
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h(tag, { ...attrs, value: props.modelValue, onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value) }),
})

const component = compileClientComponent(new URL('./RunDatasetForm.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/metadata/editor/ValueInput.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Input.vue': moduleDefault(Field('input')),
  '@/components/ui/Textarea.vue': moduleDefault(Field('textarea')),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/Switch.vue': moduleDefault(Slotted('span')),
  '@/composables/useAruna': { useAruna: () => aruna },
  '@/lib/api': { apiErrorMessage: (cause: unknown) => (cause as Error).message },
  '@/lib/crate/editor': { LICENSE_PRESETS: [] },
  '@/lib/runDataset': RunDataset,
})

const run = { inputs: [{ id: 'genome', name: 'genome.fna.gz' }], outputs: [{ id: 'gff', name: 'genome.gff3' }] }
const props = { run, recordId: '01RECORD', taskId: '01TASK', groupId: 'g1', runName: 'Bakta K-12' }

describe('create a results dataset from a run', () => {
  it('creates the dataset in the run\'s group from the run record and opens it', async () => {
    aruna.createMetadata.mockResolvedValue({ document_id: '01DATASET' })
    const onCreated = vi.fn()
    const { root } = await mountApp(component, { props: { ...props, onCreated } })

    expect(element(root, (node) => node.props.id === 'results-title').props.value).toBe('Results of Bakta K-12')
    expect(content(root)).toContain('1 result as its files, based on 1 input')
    await click(button(root, 'Create the dataset'))
    await flush()

    const [request] = aruna.createMetadata.mock.calls[0]!
    expect(request).toMatchObject({ group_id: 'g1', path: 'datasets/results/01TASK', public: false })
    expect(request.rocrate['@graph'][1]).toMatchObject({
      name: 'Results of Bakta K-12',
      hasPart: [{ '@id': 'gff' }],
      isBasedOn: [{ '@id': 'genome' }],
      mentions: { '@id': 'https://w3id.org/aruna/01RECORD' },
    })
    expect(onCreated).toHaveBeenCalledWith('01DATASET')
  })

  it('needs a title and names a refusal', async () => {
    aruna.createMetadata.mockReset().mockRejectedValue(new Error('path already exists'))
    const onCreated = vi.fn()
    const { root } = await mountApp(component, { props: { ...props, onCreated } })

    await typeValue(element(root, (node) => node.props.id === 'results-title'), ' ')
    expect(button(root, 'Create the dataset').props.disabled).toBe(true)
    await typeValue(element(root, (node) => node.props.id === 'results-title'), 'Results')
    await click(button(root, 'Create the dataset'))
    await flush()

    expect(content(root)).toContain('path already exists')
    expect(onCreated).not.toHaveBeenCalled()
  })
})
