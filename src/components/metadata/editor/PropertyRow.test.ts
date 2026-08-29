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
  nodes,
  type HostNode,
} from '@/test/clientRender'
import * as Editor from '@/lib/crate/editor'
import * as Uri from '@/lib/profiles/uri'
import * as Utils from '@/lib/utils'
import * as Grid from './grid'
import { loadVocabIndex, type VocabIndex } from '@/lib/profiles/vocabulary'

let vocab: VocabIndex
beforeAll(async () => {
  vocab = await loadVocabIndex()
})

const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const EmptyStub = defineComponent(() => () => null)
const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const BadgeStub = defineComponent((_, { attrs, slots }) => () => h('span', attrs, slots.default?.()))
const MenuItemStub = defineComponent({
  emits: ['select'],
  setup: (_, { attrs, emit, slots }) => () =>
    h('button', { ...attrs, onClick: () => emit('select') }, slots.default?.()),
})
const IssueMarkStub = defineComponent({
  props: { issues: { type: Array, default: () => [] } },
  setup: (props) => () => h('i', `issues:${(props.issues as unknown[]).length}`),
})
const FieldStub = (tag: string) => defineComponent({
  props: { modelValue: { type: [String, Number], default: '' } },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () => h(tag, {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    })
  },
})
const SelectStub = defineComponent({
  props: { modelValue: { type: String, default: '' }, options: { type: Array, default: () => [] } },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () => h('select', {
      ...attrs,
      value: props.modelValue,
      onChange: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }, (props.options as Array<{ value: string; label: string }>).map((option) =>
      h('option', { value: option.value }, option.label)))
  },
})

const ValueInput = compileClientComponent(new URL('./ValueInput.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Input.vue': moduleDefault(FieldStub('input')),
  '@/components/ui/Textarea.vue': moduleDefault(FieldStub('textarea')),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
})

const ReferenceValue = compileClientComponent(new URL('./ReferenceValue.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  './icons': { entityIcon: () => EmptyStub },
  '@/lib/crate/editor': Editor,
  '@/lib/profiles/uri': Uri,
  '@/lib/utils': Utils,
})

const PropertyRow = compileClientComponent(new URL('./PropertyRow.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Tooltip.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenu.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuTrigger.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuItem.vue': moduleDefault(MenuItemStub),
  '@/components/ui/DropdownMenuSub.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuSubTrigger.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuSubContent.vue': moduleDefault(Passthrough),
  './ValueInput.vue': moduleDefault(ValueInput),
  './ReferenceValue.vue': moduleDefault(ReferenceValue),
  './LinkEntityPopover.vue': moduleDefault(EmptyStub),
  './AddEntityDialog.vue': moduleDefault(EmptyStub),
  './IssueMark.vue': moduleDefault(IssueMarkStub),
  './grid': Grid,
  '@/lib/crate/editor': Editor,
})

function seeded() {
  return Editor.updateValue(Editor.newDraft(), './', 'name', 0, 'Example dataset')
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

function labels(root: HostNode): string[] {
  return nodes(root)
    .filter((node) => node.tag === 'button')
    .map((node) => content(node).trim())
}

describe('PropertyRow', () => {
  it('lays the row out on the shared grid', async () => {
    const mounted = await mount('name', [])

    expect(element(mounted.root, (node) => node.props.class === Grid.ROW_GRID)).toBeDefined()
    expect(element(mounted.root, (node) => node.props.class === Grid.ROW_ACTIONS)).toBeDefined()
    mounted.app.unmount()
  })

  it('offers Create and Link while a reference is empty', async () => {
    const draft = Editor.addValue(seeded(), './', 'author', { kind: 'reference', value: '' })
    const mounted = await mount('author', [], draft)

    expect(labels(mounted.root)).toEqual(expect.arrayContaining(['Create', 'Link']))
    mounted.app.unmount()
  })

  it('does not link unsafe absolute reference IRIs', async () => {
    const draft = Editor.addValue(seeded(), './', 'author', { kind: 'reference', value: 'javascript:alert(1)' })
    const mounted = await mount('author', [], draft)

    expect(nodes(mounted.root).some((node) => node.tag === 'a')).toBe(false)
    mounted.app.unmount()
  })

  it('limits the change-type submenu to the kinds the property allows', async () => {
    const narrow = await mount('author', [], Editor.addValue(seeded(), './', 'author', {
      kind: 'reference',
      value: '#someone',
    }))
    expect(labels(narrow.root)).toContain('Reference')
    expect(labels(narrow.root)).not.toContain('Text')
    narrow.app.unmount()

    const open = await mount('somethingInvented', [], Editor.addValue(seeded(), './', 'somethingInvented', {
      kind: 'text',
      value: 'anything',
    }))
    expect(labels(open.root)).toEqual(expect.arrayContaining(['Text', 'Reference']))
    open.app.unmount()
  })

  it('deletes the property when its last value goes', async () => {
    const updates: Editor.CrateDraft[] = []
    const mounted = await mount('name', updates)

    await click(button(mounted.root, 'Remove entry'))

    expect(updates[0].entities[0].properties.name).toBeUndefined()
    mounted.app.unmount()
  })

  it('clears a value without dropping the row', async () => {
    const updates: Editor.CrateDraft[] = []
    const mounted = await mount('name', updates)

    await click(button(mounted.root, 'Clear'))

    expect(updates[0].entities[0].properties.name).toEqual([{ kind: 'text', value: '' }])
    mounted.app.unmount()
  })

  it('adds another entry of the only kind the property takes', async () => {
    const updates: Editor.CrateDraft[] = []
    const mounted = await mount('name', updates)

    await click(button(mounted.root, 'Add entry'))

    expect(updates[0].entities[0].properties.name).toEqual([
      { kind: 'text', value: 'Example dataset' },
      { kind: 'text', value: '' },
    ])
    mounted.app.unmount()
  })

  it('grows into a textarea past a hundred characters', async () => {
    const long = 'x'.repeat(120)
    const mounted = await mount('name', [], Editor.updateValue(seeded(), './', 'name', 0, long))

    expect(element(mounted.root, (node) => node.tag === 'textarea').props['aria-label']).toBe('Name')
    mounted.app.unmount()
  })

  it('offers the license presets beside the free URL field', async () => {
    const updates: Editor.CrateDraft[] = []
    const mounted = await mount('license', updates)
    const select = element(mounted.root, (node) => node.props['aria-label'] === 'License preset')

    expect(content(select)).toContain('CC BY 4.0')
    expect(content(select)).toContain('Other URL')

    select.value = 'https://creativecommons.org/publicdomain/zero/1.0/'
    await (select.props.onChange as (event: { target: HostNode }) => Promise<void>)({ target: select })

    expect(updates[0].entities[0].properties.license).toEqual([
      { kind: 'url', value: 'https://creativecommons.org/publicdomain/zero/1.0/' },
    ])
    mounted.app.unmount()
  })

  it('marks the row that has problems', async () => {
    const draft = Editor.newDraft()
    const issues = Editor.liveIssues(draft).filter((issue) => issue.property === 'name')
    const mounted = await mountApp(PropertyRow, {
      props: { draft, entity: draft.entities[0], property: 'name', vocab, issues },
    })

    expect(content(mounted.root)).toContain('issues:1')
    mounted.app.unmount()
  })
})
