import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  click,
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
import * as Grid from './grid'

const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const EmptyStub = defineComponent(() => () => null)
const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
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

const RootForm = compileClientComponent(new URL('./RootForm.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Badge.vue': moduleDefault(Passthrough),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Textarea.vue': moduleDefault(InputStub),
  './PropertyEditor.vue': moduleDefault(EmptyStub),
  './IssueMark.vue': moduleDefault(EmptyStub),
  './grid': Grid,
  '@/lib/crate/editor': Editor,
})

function mount(updates: Editor.CrateDraft[], selections: string[] = [], draft = Editor.newDraft()) {
  return mountApp(RootForm, {
    props: {
      draft,
      vocab: null,
      issues: [],
      profiles: [{ value: 'profile-1', label: 'Genomics' }],
      profileId: '',
      onUpdate: (next: Editor.CrateDraft) => updates.push(next),
      onSelect: (id: string) => selections.push(id),
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
  it('offers the license presets and an Other URL field', async () => {
    const updates: Editor.CrateDraft[] = []
    const mounted = await mount(updates)
    const select = field(mounted.root, 'License')

    expect(content(select)).toContain('CC BY 4.0')
    expect(content(select)).toContain('CC0 1.0')
    expect(content(select)).toContain('Apache 2.0')

    await choose(select, 'https://creativecommons.org/licenses/by/4.0/')
    expect(updates[0].entities[0].properties.license).toEqual([
      { kind: 'url', value: 'https://creativecommons.org/licenses/by/4.0/' },
    ])
    mounted.app.unmount()
  })

  it('asks for a URL when the license is not a preset', async () => {
    const mounted = await mount([])

    await choose(field(mounted.root, 'License'), 'other')
    expect(element(mounted.root, (node) => node.props['aria-label'] === 'License URL')).toBeDefined()
    mounted.app.unmount()
  })

  it('promotes the publisher into a linked Organization', async () => {
    const updates: Editor.CrateDraft[] = []
    const selections: string[] = []
    const draft = Editor.addValue(Editor.newDraft(), './', 'publisher', {
      kind: 'text',
      value: 'Example Institute',
    })
    const mounted = await mount(updates, selections, draft)

    await click(field(mounted.root, 'More details for Publisher'))

    const created = Editor.findEntity(updates[0], '#example-institute')
    expect(created?.types).toEqual(['Organization'])
    expect(created?.properties.name).toEqual([{ kind: 'text', value: 'Example Institute' }])
    expect(updates[0].entities[0].properties.publisher).toEqual([
      { kind: 'reference', value: '#example-institute' },
    ])
    expect(selections).toEqual(['#example-institute'])
    mounted.app.unmount()
  })

  it('shows a promoted field as its entity, with the link removable', async () => {
    const updates: Editor.CrateDraft[] = []
    const promoted = Editor.promoteField(
      Editor.addValue(Editor.newDraft(), './', 'funder', { kind: 'text', value: 'Some Funder' }),
      'funder',
    )
    const mounted = await mount(updates, [], promoted.draft)

    expect(content(mounted.root)).toContain('Some Funder')
    await click(field(mounted.root, 'Unlink the funder'))

    expect(updates[0].entities[0].properties.funder).toBeUndefined()
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

    const chipped = await mount([], [], updates[0])
    expect(content(chipped.root)).toContain('genomics')
    chipped.app.unmount()
    mounted.app.unmount()
  })

  it('reports the profile a reader picked', async () => {
    const picked: string[] = []
    const mounted = await mountApp(RootForm, {
      props: {
        draft: Editor.newDraft(),
        vocab: null,
        issues: [],
        profiles: [{ value: 'profile-1', label: 'Genomics' }],
        profileId: '',
        onProfile: (id: string) => picked.push(id),
      },
    })

    await choose(field(mounted.root, 'Profile'), 'profile-1')
    expect(picked).toEqual(['profile-1'])
    mounted.app.unmount()
  })
})
