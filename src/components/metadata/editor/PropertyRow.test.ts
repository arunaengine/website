import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  element,
  moduleDefault,
  mountApp,
  type HostNode,
} from '@/test/clientRender'
import * as Editor from '@/lib/crate/editor'
import { loadVocabIndex, type VocabIndex } from '@/lib/profiles/vocabulary'

let vocab: VocabIndex
beforeAll(async () => {
  vocab = await loadVocabIndex()
})

const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const EmptyStub = defineComponent(() => () => null)
const SelectStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () => h('select', {
      ...attrs,
      value: props.modelValue,
      onChange: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    })
  },
})
const ValueInputStub = defineComponent({
  props: { modelValue: { type: Object, default: () => ({}) }, label: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('input', {
      'aria-label': props.label,
      value: (props.modelValue as Editor.DraftValue).value,
      onInput: (event: { target: { value: string } }) =>
        emit('update:modelValue', { ...props.modelValue, value: event.target.value }),
    })
  },
})

const PropertyRow = compileClientComponent(new URL('./PropertyRow.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  './ValueInput.vue': moduleDefault(ValueInputStub),
  './ReferenceValue.vue': moduleDefault(EmptyStub),
  './LinkEntityPopover.vue': moduleDefault(EmptyStub),
  './AddEntityDialog.vue': moduleDefault(EmptyStub),
  '@/lib/crate/editor': Editor,
})

function seeded() {
  const draft = Editor.newDraft()
  return Editor.updateValue(draft, './', 'name', 0, 'Example dataset')
}

function mount(property: string, updates: Editor.CrateDraft[], draft = seeded()) {
  return mountApp(PropertyRow, {
    props: {
      draft,
      entity: draft.entities[0],
      property,
      vocab,
      onUpdate: (next: Editor.CrateDraft) => updates.push(next),
    },
  })
}

function select(root: HostNode): HostNode {
  return element(root, (node) => node.tag === 'select')
}

describe('PropertyRow', () => {
  it('adds another value of the same kind', async () => {
    const updates: Editor.CrateDraft[] = []
    const mounted = await mount('name', updates)

    await click(button(mounted.root, 'Add another entry'))

    expect(updates[0].entities[0].properties.name).toEqual([
      { kind: 'text', value: 'Example dataset' },
      { kind: 'text', value: '' },
    ])
    mounted.app.unmount()
  })

  it('offers one action per kind a mixed range allows', async () => {
    const updates: Editor.CrateDraft[] = []
    const mounted = await mount('license', updates)

    await click(button(mounted.root, 'Add url'))

    expect(updates[0].entities[0].properties.license).toEqual([
      { kind: 'url', value: '' },
      { kind: 'url', value: '' },
    ])
    mounted.app.unmount()
  })

  it('changes the kind of a value without losing it', async () => {
    const updates: Editor.CrateDraft[] = []
    const mounted = await mount('license', updates, Editor.updateValue(seeded(), './', 'license', 0, 'https://spdx.org/licenses/MIT'))
    const control = select(mounted.root)

    control.value = 'reference'
    await (control.props.onChange as (event: { target: HostNode }) => void)({ target: control })

    expect(updates[0].entities[0].properties.license).toEqual([
      { kind: 'reference', value: 'https://spdx.org/licenses/MIT' },
    ])
    mounted.app.unmount()
  })

  it('drops the property when its last value is removed', async () => {
    const updates: Editor.CrateDraft[] = []
    const mounted = await mount('name', updates)

    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Remove this Name value'))

    expect(updates[0].entities[0].properties.name).toBeUndefined()
    mounted.app.unmount()
  })
})
