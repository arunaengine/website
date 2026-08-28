import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  compileClientComponent,
  content,
  element,
  moduleDefault,
  mountApp,
  typeValue,
} from '@/test/clientRender'
import * as Editor from '@/lib/crate/editor'

const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const EmptyStub = defineComponent(() => () => null)
const InputStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: '' } },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () => h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    })
  },
})
const EntityCardStub = defineComponent({
  props: { entity: { type: Object, required: true } },
  setup: (props) => () => h('p', Editor.displayName(props.entity as Editor.DraftEntity)),
})

const EntityList = compileClientComponent(new URL('./EntityList.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/KBD.vue': moduleDefault(EmptyStub),
  './EntityCard.vue': moduleDefault(EntityCardStub),
  './AddEntityDialog.vue': moduleDefault(EmptyStub),
  '@/lib/crate/editor': Editor,
})

function seeded() {
  const named = Editor.updateValue(Editor.newDraft(), './', 'name', 0, 'Example dataset')
  const person = Editor.addEntity(named, { type: 'Person', name: 'Ada Lovelace' })
  return Editor.addFilePart(person.draft, { id: 's3://bucket/reads.csv', name: 'reads.csv' })
}

describe('EntityList', () => {
  it('lists the root, then the parts, then the rest', async () => {
    const mounted = await mountApp(EntityList, { props: { draft: seeded(), vocab: null } })
    const text = content(mounted.root)

    expect(text.indexOf('Example dataset')).toBeLessThan(text.indexOf('reads.csv'))
    expect(text.indexOf('reads.csv')).toBeLessThan(text.indexOf('Ada Lovelace'))
    mounted.app.unmount()
  })

  it('filters the cards by name, id or type', async () => {
    const mounted = await mountApp(EntityList, { props: { draft: seeded(), vocab: null } })
    const search = element(mounted.root, (node) => node.props['aria-label'] === 'Search entities')

    await typeValue(search, 'ada')
    expect(content(mounted.root)).toContain('Ada Lovelace')
    expect(content(mounted.root)).not.toContain('reads.csv')

    await typeValue(search, 'nothing here')
    expect(content(mounted.root)).toContain('Nothing here matches that search.')
    mounted.app.unmount()
  })
})
