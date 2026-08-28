import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  moduleDefault,
  mountApp,
} from '@/test/clientRender'
import * as Editor from '@/lib/crate/editor'
import * as Uri from '@/lib/profiles/uri'
import { loadVocabIndex, type VocabIndex } from '@/lib/profiles/vocabulary'

let vocab: VocabIndex
beforeAll(async () => {
  vocab = await loadVocabIndex()
})

const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const EmptyStub = defineComponent(() => () => null)
const InputStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: '' } },
  setup: (props, { attrs }) => () => h('input', { ...attrs, value: props.modelValue }),
})
const PropertyEditorStub = defineComponent({
  props: { entity: { type: Object, required: true }, skip: { type: Array, default: () => [] } },
  setup: (props) => () => h('div', Object.keys((props.entity as Editor.DraftEntity).properties)
    .filter((key) => !(props.skip as string[]).includes(key))
    .map((key) => h('p', key))),
})
const AddPropertyStub = defineComponent({
  emits: ['pick'],
  setup: (_, { emit }) => () =>
    h('button', { onClick: () => emit('pick', { key: 'keywords', kind: 'text' }) }, 'Pick keywords'),
})
const TypeBrowserStub = defineComponent({
  emits: ['update:modelValue'],
  setup: (_, { emit }) => () => h('button', { onClick: () => emit('update:modelValue', 'Collection') }, 'Pick Collection'),
})

const EntityCard = compileClientComponent(new URL('./EntityCard.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Badge.vue': moduleDefault(Passthrough),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/data/SelectDataDialog.vue': moduleDefault(EmptyStub),
  '@/components/metadata/SubcratePickerDialog.vue': moduleDefault(EmptyStub),
  './PropertyEditor.vue': moduleDefault(PropertyEditorStub),
  './AddPropertyPopover.vue': moduleDefault(AddPropertyStub),
  './TypeBrowser.vue': moduleDefault(TypeBrowserStub),
  '@/composables/useAruna': { useAruna: () => ({ apiBaseUrl: ref('https://api.example.test') }) },
  '@/lib/contentIdentity': { takeSelectedContentReference: () => undefined },
  '@/lib/profiles/uri': Uri,
  '@/lib/crate/editor': Editor,
})

function seeded() {
  const draft = Editor.updateValue(Editor.newDraft(), './', 'name', 0, 'Example dataset')
  const person = Editor.addEntity(draft, { type: 'Person', name: 'Ada Lovelace' })
  return Editor.addValue(person.draft, './', 'author', { kind: 'reference', value: person.entity.id })
}

function mount(entityId: string, updates: Editor.CrateDraft[], draft = seeded()) {
  return mountApp(EntityCard, {
    props: {
      draft,
      entity: Editor.findEntity(draft, entityId),
      vocab,
      onUpdate: (next: Editor.CrateDraft) => updates.push(next),
    },
  })
}

describe('EntityCard', () => {
  it('names the root card after the dataset and keeps its parts out of the rows', async () => {
    const draft = Editor.addFilePart(seeded(), { id: 's3://bucket/one.csv', name: 'one.csv' })
    const mounted = await mount('./', [], draft)
    const text = content(mounted.root)

    expect(text).toContain('This dataset')
    expect(text).toContain('Example dataset')
    expect(text).toContain('Parts')
    expect(text).toContain('one.csv')
    expect(text).not.toContain('hasPart')
    mounted.app.unmount()
  })

  it('adds the property a pick returns', async () => {
    const updates: Editor.CrateDraft[] = []
    const mounted = await mount('./', updates)

    await click(button(mounted.root, 'Add property'))
    await click(button(mounted.root, 'Pick keywords'))

    expect(updates[0].entities[0].properties.keywords).toEqual([{ kind: 'text', value: '' }])
    mounted.app.unmount()
  })

  it('adds a second type from the type browser', async () => {
    const updates: Editor.CrateDraft[] = []
    const mounted = await mount('./', updates)

    await click(button(mounted.root, 'Add type'))
    await click(button(mounted.root, 'Pick Collection'))
    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Add this type'))

    expect(updates[0].entities[0].types).toEqual(['Dataset', 'Collection'])
    mounted.app.unmount()
  })

  it('warns before removing something other entities point at', async () => {
    const updates: Editor.CrateDraft[] = []
    const mounted = await mount('#ada-lovelace', updates)

    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Remove Ada Lovelace'))
    expect(content(mounted.root)).toContain('drops 1 reference')
    expect(updates).toHaveLength(0)

    await click(button(mounted.root, 'Remove anyway'))
    expect(updates[0].entities).toHaveLength(1)
    mounted.app.unmount()
  })
})
