import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  compileClientComponent,
  content,
  element,
  flush,
  moduleDefault,
  mountApp,
  typeValue,
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
const MenuItemStub = defineComponent({
  emits: ['select'],
  setup: (_, { attrs, emit, slots }) => () =>
    h('button', { ...attrs, onClick: () => emit('select') }, slots.default?.()),
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
  './ReferenceValue.vue': moduleDefault(EmptyStub),
  './LinkEntityPopover.vue': moduleDefault(EmptyStub),
  './AddEntityDialog.vue': moduleDefault(EmptyStub),
  './IssueMark.vue': moduleDefault(EmptyStub),
  './grid': Grid,
  '@/lib/crate/editor': Editor,
})

const RootForm = compileClientComponent(new URL('./RootForm.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Input.vue': moduleDefault(FieldStub('input')),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Textarea.vue': moduleDefault(FieldStub('textarea')),
  './PropertyEditor.vue': moduleDefault(EmptyStub),
  './PropertyRow.vue': moduleDefault(PropertyRow),
  './IssueMark.vue': moduleDefault(EmptyStub),
  './grid': Grid,
  '@/lib/crate/editor': Editor,
  '@/lib/profiles/uri': Uri,
  '@/lib/utils': Utils,
})

function mount(updates: Editor.CrateDraft[], draft = Editor.newDraft(), picked: string[] = []) {
  return mountApp(RootForm, {
    props: {
      draft,
      vocab,
      issues: [],
      profiles: [{ value: 'profile-1', label: 'Genomics' }],
      profileId: '',
      onUpdate: (next: Editor.CrateDraft) => updates.push(next),
      onProfile: (id: string) => picked.push(id),
    },
  })
}

function field(root: HostNode, label: string): HostNode {
  return element(root, (node) => node.props['aria-label'] === label)
}

async function choose(node: HostNode, value: string) {
  node.value = value
  await (node.props.onChange as (event: { target: HostNode }) => Promise<void>)({ target: node })
  await flush()
}

describe('RootForm', () => {
  it('keeps five fields and nothing that has to be promoted', async () => {
    const mounted = await mount([])
    const text = content(mounted.root)

    expect(text).toContain('Name')
    expect(text).toContain('Description')
    expect(text).toContain('Date published')
    expect(text).toContain('License')
    expect(text).toContain('Keywords')
    expect(text).not.toContain('More details')
    expect(text).not.toContain('Publisher')
    expect(text).not.toContain('Contact')
    expect(text).not.toContain('Funder')
    mounted.app.unmount()
  })

  it('offers the license presets on the ordinary license row', async () => {
    const updates: Editor.CrateDraft[] = []
    const mounted = await mount(updates)
    const select = field(mounted.root, 'License preset')

    expect(content(select)).toContain('CC BY 4.0')
    expect(content(select)).toContain('CC0 1.0')
    expect(content(select)).toContain('Other URL')

    await choose(select, 'https://creativecommons.org/licenses/by/4.0/')
    expect(updates[0].entities[0].properties.license).toEqual([
      { kind: 'url', value: 'https://creativecommons.org/licenses/by/4.0/' },
    ])
    mounted.app.unmount()
  })

  it('asks for a URL when the license is not a preset', async () => {
    const mounted = await mount([])

    await choose(field(mounted.root, 'License preset'), 'other')
    expect(field(mounted.root, 'License')).toBeDefined()
    mounted.app.unmount()
  })

  it('adds a keyword chip on Enter and removes it again', async () => {
    const updates: Editor.CrateDraft[] = []
    const mounted = await mount(updates)
    const input = field(mounted.root, 'Add a keyword')

    await typeValue(input, 'genomics')
    await (input.props.onKeydown as (event: { key: string }) => void)({ key: 'Enter' })
    await flush()

    expect(updates[0].entities[0].properties.keywords).toEqual([{ kind: 'text', value: 'genomics' }])

    const chipped = await mount([], updates[0])
    expect(content(chipped.root)).toContain('genomics')
    chipped.app.unmount()
    mounted.app.unmount()
  })

  it('reports the profile a reader picked', async () => {
    const picked: string[] = []
    const mounted = await mount([], Editor.newDraft(), picked)

    await choose(field(mounted.root, 'Profile'), 'profile-1')
    expect(picked).toEqual(['profile-1'])
    mounted.app.unmount()
  })
})
