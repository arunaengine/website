import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
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
import * as Grid from './grid'
import { loadVocabIndex, type VocabIndex } from '@/lib/profiles/vocabulary'

let vocab: VocabIndex
beforeAll(async () => {
  vocab = await loadVocabIndex()
})

const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const EmptyStub = defineComponent(() => () => null)
const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const MenuItemStub = defineComponent({
  emits: ['select'],
  setup: (_, { attrs, emit, slots }) => () =>
    h('button', { ...attrs, onClick: () => emit('select') }, slots.default?.()),
})
const IssueMarkStub = defineComponent({
  props: { issues: { type: Array, default: () => [] } },
  setup: (props) => () => h('i', `issues:${(props.issues as unknown[]).length}`),
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

const MODULES = {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Tooltip.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenu.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuTrigger.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuItem.vue': moduleDefault(MenuItemStub),
  './ValueInput.vue': moduleDefault(ValueInputStub),
  './ReferenceValue.vue': moduleDefault(EmptyStub),
  './LinkEntityPopover.vue': moduleDefault(EmptyStub),
  './AddEntityDialog.vue': moduleDefault(EmptyStub),
  './IssueMark.vue': moduleDefault(IssueMarkStub),
  './grid': Grid,
  '@/lib/crate/editor': Editor,
}

const PropertyRow = compileClientComponent(new URL('./PropertyRow.vue', import.meta.url), MODULES)

function seeded() {
  return Editor.updateValue(Editor.newDraft(), './', 'name', 0, 'Example dataset')
}

function mount(property: string, updates: Editor.CrateDraft[], props: Record<string, unknown> = {}) {
  const draft = (props.draft as Editor.CrateDraft) ?? seeded()
  return mountApp(PropertyRow, {
    props: {
      draft,
      entity: draft.entities[0],
      property,
      vocab,
      onUpdate: (next: Editor.CrateDraft) => updates.push(next),
      ...props,
    },
  })
}

describe('PropertyRow', () => {
  it('lays the row out on the shared grid', async () => {
    const mounted = await mount('name', [])

    expect(element(mounted.root, (node) => node.props.class === Grid.ROW_GRID)).toBeDefined()
    expect(element(mounted.root, (node) => node.props.class === Grid.ROW_ACTIONS)).toBeDefined()
    mounted.app.unmount()
  })

  it('adds another value of the same kind', async () => {
    const updates: Editor.CrateDraft[] = []
    const mounted = await mount('name', updates)

    await click(button(mounted.root, 'Add another'))

    expect(updates[0].entities[0].properties.name).toEqual([
      { kind: 'text', value: 'Example dataset' },
      { kind: 'text', value: '' },
    ])
    mounted.app.unmount()
  })

  it('offers the reference actions a mixed range allows', async () => {
    const mounted = await mount('license', [])
    const text = content(mounted.root)

    expect(text).toContain('Choose existing')
    expect(text).toContain('External URL')
    expect(text).toContain('Add another')
    mounted.app.unmount()
  })

  it('changes the type of every value in the row', async () => {
    const updates: Editor.CrateDraft[] = []
    const draft = Editor.updateValue(seeded(), './', 'license', 0, 'https://spdx.org/licenses/MIT')
    const mounted = await mount('license', updates, { draft, entity: draft.entities[0] })

    await click(button(mounted.root, 'Change type to reference'))

    expect(updates[0].entities[0].properties.license).toEqual([
      { kind: 'reference', value: 'https://spdx.org/licenses/MIT' },
    ])
    mounted.app.unmount()
  })

  it('removes the whole property from the row menu', async () => {
    const updates: Editor.CrateDraft[] = []
    const mounted = await mount('name', updates)

    await click(button(mounted.root, 'Remove Name'))

    expect(updates[0].entities[0].properties.name).toBeUndefined()
    mounted.app.unmount()
  })

  it('removes one value while others remain', async () => {
    const updates: Editor.CrateDraft[] = []
    const draft = Editor.addValue(seeded(), './', 'name', { kind: 'text', value: 'Second' })
    const mounted = await mount('name', updates, { draft, entity: draft.entities[0] })

    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Remove this Name value'))

    expect(updates[0].entities[0].properties.name).toEqual([{ kind: 'text', value: 'Second' }])
    mounted.app.unmount()
  })

  it('marks the row that has problems', async () => {
    const issues = Editor.liveIssues(Editor.newDraft()).filter((issue) => issue.property === 'name')
    const mounted = await mount('name', [], { draft: Editor.newDraft(), entity: Editor.newDraft().entities[0], issues })

    expect(content(mounted.root)).toContain('issues:1')
    mounted.app.unmount()
  })
})
