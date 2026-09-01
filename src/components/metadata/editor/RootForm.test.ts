import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { beforeAll, describe, expect, it } from 'vitest'
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
import * as References from '@/lib/crate/references'
import * as Pickers from '@/lib/crate/pickers'
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
// The data picker, reduced to the target it is bound to.
const FilesStub = defineComponent({
  props: { target: { type: Object, required: true } },
  setup: (props) => () => h('p', `Picker ${(props.target as { entityId: string }).entityId} ${(props.target as { property: string }).property}`),
})
const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const BadgeStub = defineComponent((_, { attrs, slots }) => () => h('span', attrs, slots.default?.()))
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
  './LinkEntityDialog.vue': moduleDefault(EmptyStub),
  './AddEntityDialog.vue': moduleDefault(EmptyStub),
  './AddFilesDialog.vue': moduleDefault(FilesStub),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/lib/crate/references': References,
  '@/lib/crate/pickers': Pickers,
  './IssueMark.vue': moduleDefault(EmptyStub),
  './grid': Grid,
  '@/lib/crate/editor': Editor,
})

const PropertyEditor = compileClientComponent(new URL('./PropertyEditor.vue', import.meta.url), {
  vue: VueRuntime,
  './PropertyRow.vue': moduleDefault(PropertyRow),
  '@/lib/crate/editor': Editor,
})

const RootForm = compileClientComponent(new URL('./RootForm.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Input.vue': moduleDefault(FieldStub('input')),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Textarea.vue': moduleDefault(FieldStub('textarea')),
  './PropertyEditor.vue': moduleDefault(PropertyEditor),
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
  it('keeps the dedicated fields to what every dataset has', async () => {
    const mounted = await mount([])
    const text = content(mounted.root)

    for (const label of ['Name', 'Description', 'Date published', 'License', 'Keywords', 'Profile']) {
      expect(text).toContain(label)
    }
    for (const label of ['Publisher', 'Contact point', 'Funder']) {
      expect(text).not.toContain(label)
    }
    mounted.app.unmount()
  })

  it('shows an added publisher among the other properties', async () => {
    const draft = Editor.addValue(Editor.newDraft(), './', 'publisher', { kind: 'text', value: 'ACME Research' })
    const mounted = await mount([], draft)

    expect(content(mounted.root)).toContain('More properties')
    expect(field(mounted.root, 'Publisher').props.value).toBe('ACME Research')
    mounted.app.unmount()
  })

  it('lists the parts as an ordinary row with its own menu', async () => {
    const draft = References.addFilePart(Editor.newDraft(), { id: 's3://bucket/one.csv', name: 'one.csv' })
    const mounted = await mount([], draft)
    const text = content(mounted.root)

    expect(text).toContain('one.csv')
    for (const action of ['Unlink', 'Change type', 'Remove entry', 'Add entry']) {
      expect(text).toContain(action)
    }
    mounted.app.unmount()
  })

  it('promotes a license into a linked work', async () => {
    const updates: Editor.CrateDraft[] = []
    const selections: string[] = []
    const license = 'https://creativecommons.org/licenses/by/4.0/'
    const draft = Editor.setProperty(Editor.newDraft(), './', 'license', [{ kind: 'url', value: license }])
    const mounted = await mountApp(RootForm, {
      props: {
        draft,
        vocab,
        issues: [],
        profiles: [],
        profileId: '',
        onUpdate: (next: Editor.CrateDraft) => updates.push(next),
        onSelect: (id: string) => selections.push(id),
      },
    })

    await click(element(mounted.root, (node) => node.tag === 'button' && content(node).trim() === 'More details'))

    expect(updates[0].entities[0].properties.license).toEqual([{ kind: 'reference', value: license }])
    expect(Editor.findEntity(updates[0], license)).toMatchObject({
      types: ['CreativeWork'],
      properties: { name: [{ kind: 'text', value: 'CC BY 4.0' }] },
    })
    expect(selections).toEqual([license])
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

  it('offers no profile as an explicit choice', async () => {
    const picked: string[] = []
    const mounted = await mount([], Editor.newDraft(), picked)
    const select = field(mounted.root, 'Profile')

    expect(content(select)).toContain('No profile')
    await choose(select, '')
    expect(picked).toEqual([''])
    mounted.app.unmount()
  })

  it('says why private profiles are missing from the list', async () => {
    const mounted = await mount([])

    expect(content(mounted.root)).toContain("profiles of this dataset's group")
    mounted.app.unmount()
  })
})
