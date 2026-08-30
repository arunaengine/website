import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  flush,
  moduleDefault,
  mountApp,
  nodes,
  typeValue,
  type HostNode,
} from '@/test/clientRender'
import * as Editor from '@/lib/crate/editor'
import * as Utils from '@/lib/utils'

const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const EmptyStub = defineComponent(() => () => null)
const BadgeStub = defineComponent((_, { attrs, slots }) => () => h('span', attrs, slots.default?.()))
const PopoverStub = defineComponent((_, { slots }) => () => h('div', [slots.default?.(), slots.content?.()]))
const CopyStub = defineComponent({
  props: { value: String, label: String },
  setup: (props) => () => h('button', { 'aria-label': props.label }, props.value),
})
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

const EntityHeader = compileClientComponent(new URL('./EntityHeader.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/CopyButton.vue': moduleDefault(CopyStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(BadgeStub),
  '@/components/ui/Popover.vue': moduleDefault(PopoverStub),
  '@/components/ui/Separator.vue': moduleDefault(EmptyStub),
  './TypeDialog.vue': moduleDefault(EmptyStub),
  '@/lib/crate/editor': Editor,
  '@/lib/utils': Utils,
})

// A dataset whose author is a Person, so the Person is used once.
function seeded(): Editor.CrateDraft {
  const named = Editor.updateValue(Editor.newDraft(), './', 'name', 0, 'Example dataset')
  const person = Editor.addEntity(named, { type: 'Person', name: 'Ada Lovelace' })
  return Editor.addValue(person.draft, './', 'author', { kind: 'reference', value: person.entity.id })
}

function mount(entityId: string, updates: Editor.CrateDraft[] = [], selections: string[] = []) {
  const draft = seeded()
  return mountApp(EntityHeader, {
    props: {
      draft,
      entity: Editor.findEntity(draft, entityId),
      vocab: null,
      onUpdate: (next: Editor.CrateDraft) => updates.push(next),
      onSelect: (id: string) => selections.push(id),
    },
  })
}

function has(root: HostNode, label: string): boolean {
  return nodes(root).some((node) => node.props['aria-label'] === label)
}

function control(root: HostNode, label: string): HostNode {
  return element(root, (node) => node.props['aria-label'] === label)
}

describe('EntityHeader', () => {
  it('counts what points at this entity and opens the pick', async () => {
    const selections: string[] = []
    const mounted = await mount('#ada-lovelace', [], selections)

    expect(content(mounted.root)).toContain('Used by 1')
    await click(button(mounted.root, 'Example dataset · author'))

    expect(selections).toEqual(['./'])
    mounted.app.unmount()
  })

  it('says nothing about uses when there are none', async () => {
    const mounted = await mount('./')

    expect(content(mounted.root)).not.toContain('Used by')
    mounted.app.unmount()
  })

  it('keeps the identifier read-only until it is edited on purpose', async () => {
    const mounted = await mount('#ada-lovelace')

    expect(has(mounted.root, 'Identifier')).toBe(false)
    await click(control(mounted.root, 'Edit identifier'))

    expect(has(mounted.root, 'Identifier')).toBe(true)
    mounted.app.unmount()
  })

  it('offers no identifier for a dataset the node has not minted', async () => {
    const mounted = await mount('./')

    expect(has(mounted.root, 'Edit identifier')).toBe(false)
    expect(has(mounted.root, 'Copy the dataset id')).toBe(false)
    expect(content(mounted.root)).toContain('Dataset')
    mounted.app.unmount()
  })

  it('shows the stored dataset id with a way to copy it', async () => {
    const documentId = '01JD8ZK9YQ7X3F0ABCDEF'
    const draft = { ...seeded(), documentId }
    const mounted = await mountApp(EntityHeader, {
      props: { draft, entity: Editor.rootEntity(draft), vocab: null },
    })

    expect(content(mounted.root)).toContain(Utils.truncateMiddle(documentId, 12, 8))
    expect(control(mounted.root, 'Copy the dataset id').props['aria-label']).toBe('Copy the dataset id')
    mounted.app.unmount()
  })

  it('rewrites every reference when the identifier changes', async () => {
    const updates: Editor.CrateDraft[] = []
    const selections: string[] = []
    const mounted = await mount('#ada-lovelace', updates, selections)

    await click(control(mounted.root, 'Edit identifier'))
    const input = control(mounted.root, 'Identifier')
    await typeValue(input, 'https://orcid.org/0000-0002-1825-0097')
    await (input.props.onKeydown as (event: { key: string }) => void)({ key: 'Enter' })
    await flush()

    expect(Editor.findEntity(updates[0], 'https://orcid.org/0000-0002-1825-0097')).toBeDefined()
    expect(updates[0].entities[0].properties.author).toEqual([
      { kind: 'reference', value: 'https://orcid.org/0000-0002-1825-0097' },
    ])
    expect(selections).toEqual(['https://orcid.org/0000-0002-1825-0097'])
    mounted.app.unmount()
  })
})
