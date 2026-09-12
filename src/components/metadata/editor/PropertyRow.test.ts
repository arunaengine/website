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

const RuleBadge = compileClientComponent(new URL('./RuleBadge.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
})
const PropertyRow = compileClientComponent(new URL('./PropertyRow.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Tooltip.vue': moduleDefault(Passthrough),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
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
  './IssueMark.vue': moduleDefault(IssueMarkStub),
  './RuleBadge.vue': moduleDefault(RuleBadge),
  './grid': Grid,
  '@/lib/crate/editor': Editor,
})

function seeded() {
  return Editor.updateValue(Editor.newDraft(), './', 'name', 0, 'Example dataset')
}

function mount(
  property: string,
  updates: Editor.CrateDraft[],
  draft = seeded(),
  extra: Record<string, unknown> = {},
) {
  return mountApp(PropertyRow, {
    props: {
      draft,
      entity: draft.entities[0],
      property,
      vocab,
      ...extra,
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
  it('renders one-of entries as dropdowns and updates only the selected entry', async () => {
    const updates: Editor.CrateDraft[] = []
    let draft = Editor.addValue(seeded(), './', 'measurementTechnique', { kind: 'text', value: 'LC-MS' })
    draft = Editor.addValue(draft, './', 'measurementTechnique', { kind: 'text', value: '' })
    const mounted = await mount('measurementTechnique', updates, draft, {
      rule: {
        id: 'technique', label: 'Technique', description: '', kind: 'enum',
        propertyUri: 'http://schema.org/measurementTechnique', valueName: 'measurementTechnique',
        obligation: 'MUST', enumOptions: ['LC-MS', 'MALDI-TOF'], multipleValues: true,
      },
    })
    const selects = nodes(mounted.root).filter((node) => node.tag === 'select')
    expect(selects).toHaveLength(2)
    expect(nodes(mounted.root).filter((node) => node.tag === 'input')).toHaveLength(0)
    expect(content(selects[1])).toBe('LC-MSMALDI-TOF')
    expect(selects[0].props.value).toBe('LC-MS')
    selects[1].value = 'MALDI-TOF'
    await (selects[1].props.onChange as (event: { target: HostNode }) => Promise<void>)({ target: selects[1] })
    expect(updates[0].entities[0].properties.measurementTechnique).toEqual([
      { kind: 'text', value: 'LC-MS' }, { kind: 'text', value: 'MALDI-TOF' },
    ])
    mounted.app.unmount()
  })

  it('keeps an existing value outside the one-of options visible without changing it', async () => {
    const updates: Editor.CrateDraft[] = []
    const draft = Editor.addValue(seeded(), './', 'measurementTechnique', { kind: 'text', value: 'Existing technique' })
    const mounted = await mount('measurementTechnique', updates, draft, {
      rule: {
        id: 'technique', label: 'Technique', description: '', kind: 'enum',
        propertyUri: 'http://schema.org/measurementTechnique', valueName: 'measurementTechnique',
        obligation: 'MUST', enumOptions: ['LC-MS', 'MALDI-TOF'],
      },
    })
    const select = element(mounted.root, (node) => node.tag === 'select')
    expect(select.props.placeholder).toBe('Existing technique')
    expect(content(select)).not.toContain('Existing technique')
    expect(updates).toEqual([])
    mounted.app.unmount()
  })

  it('says what the profile asks of a seeded row', async () => {
    const draft = Editor.addValue(seeded(), './', 'citation', { kind: 'text', value: '' })
    const mounted = await mount('citation', [], draft, {
      rule: {
        id: 'citation',
        label: 'Citation',
        description: 'The paper this dataset belongs to.',
        kind: 'text',
        propertyUri: 'http://schema.org/citation',
        valueName: 'citation',
        obligation: 'SHOULD',
      },
    })
    const text = content(mounted.root)

    expect(text).toContain('Recommended')
    expect(text).toContain('The paper this dataset belongs to.')
    expect(text).not.toContain('Required')
    mounted.app.unmount()
  })

  it('marks a row the profile requires', async () => {
    const draft = Editor.addValue(seeded(), './', 'citation', { kind: 'text', value: '' })
    const mounted = await mount('citation', [], draft, {
      rule: {
        id: 'citation',
        label: 'Citation',
        description: '',
        kind: 'text',
        propertyUri: 'http://schema.org/citation',
        valueName: 'citation',
        obligation: 'MUST',
      },
    })

    expect(content(mounted.root)).toContain('Required')
    mounted.app.unmount()
  })

  it('puts the required badge inside the first empty field, away from the name', async () => {
    const draft = Editor.addValue(
      Editor.addValue(seeded(), './', 'citation', { kind: 'text', value: '' }),
      './', 'citation', { kind: 'text', value: '' },
    )
    const mounted = await mount('citation', [], draft, {
      rule: {
        id: 'citation', label: 'Citation', description: '', kind: 'text',
        propertyUri: 'http://schema.org/citation', valueName: 'citation', obligation: 'MUST',
      },
    })
    const name = element(mounted.root, (node) => node.tag === 'span' && String(node.props.class).includes('truncate'))
    const badge = element(mounted.root, (node) => node.tag === 'span' && node.props.title === 'Required')
    const info = element(mounted.root, (node) => node.props['aria-label'] === 'About Citation')
    const inputs = nodes(mounted.root).filter((node) => node.tag === 'input')

    // The label column holds only the name and its icon; the badge sits in the first field.
    expect(name.parent?.props.class).toBe(Grid.ROW_LABEL)
    expect(nodes(name.parent!)).toContain(info)
    expect(nodes(name.parent!)).not.toContain(badge)
    expect(inputs).toHaveLength(2)
    expect(String(badge.parent?.props.class)).toContain('@container')
    expect(nodes(badge.parent!)).toContain(inputs[0])
    expect(nodes(badge.parent!)).not.toContain(inputs[1])
    expect(nodes(mounted.root).filter((node) => node.props.title === 'Required')).toHaveLength(1)
    expect(String(inputs[0].props.class)).toContain('border-primary/40')
    expect(String(inputs[0].props.class)).toContain('pr-8 @xs:pr-24')
    expect(String(inputs[1].props.class)).toBe('border-primary/40')
    mounted.app.unmount()
  })

  it('takes the badge out of a field that holds a value and keeps the tint', async () => {
    const draft = Editor.addValue(seeded(), './', 'citation', { kind: 'text', value: 'doi:10.1000/one' })
    const mounted = await mount('citation', [], draft, {
      rule: {
        id: 'citation', label: 'Citation', description: '', kind: 'text',
        propertyUri: 'http://schema.org/citation', valueName: 'citation', obligation: 'MUST',
      },
    })

    expect(nodes(mounted.root).some((node) => node.props.title === 'Required')).toBe(false)
    expect(String(element(mounted.root, (node) => node.tag === 'input').props.class)).toBe('border-primary/40')
    mounted.app.unmount()
  })

  it('keeps the badge clear of a one-of select', async () => {
    const draft = Editor.addValue(seeded(), './', 'measurementTechnique', { kind: 'text', value: '' })
    const mounted = await mount('measurementTechnique', [], draft, {
      rule: {
        id: 'technique', label: 'Technique', description: '', kind: 'enum',
        propertyUri: 'http://schema.org/measurementTechnique', valueName: 'measurementTechnique',
        obligation: 'SHOULD', enumOptions: ['LC-MS'],
      },
    })
    const badge = element(mounted.root, (node) => node.props.title === 'Recommended')

    expect(String(badge.props.class)).toContain('right-9')
    expect(String(element(mounted.root, (node) => node.tag === 'select').props.class)).toBe('pr-8 @xs:pr-24')
    mounted.app.unmount()
  })

  it('adds no badge or tint to an optional row', async () => {
    const draft = Editor.addValue(seeded(), './', 'citation', { kind: 'text', value: '' })
    const mounted = await mount('citation', [], draft, {
      rule: {
        id: 'citation', label: 'Citation', description: '', kind: 'text',
        propertyUri: 'http://schema.org/citation', valueName: 'citation', obligation: 'MAY',
      },
    })
    expect(nodes(mounted.root).some((node) => node.props.title === 'Required')).toBe(false)
    expect(content(mounted.root)).not.toContain('Required')
    expect(element(mounted.root, (node) => node.tag === 'input').props.class ?? '').toBe('')
    mounted.app.unmount()
  })

  it('names the row by the profile label, then the vocabulary, then the key', async () => {
    const technique = {
      id: 'technique', label: 'Technique', description: '', kind: 'text' as const,
      propertyUri: 'http://schema.org/measurementTechnique', valueName: 'measurementTechnique', obligation: 'MUST' as const,
    }
    const draft = Editor.addValue(
      Editor.addValue(seeded(), './', 'measurementTechnique', { kind: 'text', value: '' }),
      './', 'citation', { kind: 'text', value: '' },
    )
    const nameOf = (root: HostNode) =>
      content(element(root, (node) => node.tag === 'span' && String(node.props.class).includes('truncate')))
    const inputLabel = (root: HostNode) => element(root, (node) => node.tag === 'input').props['aria-label']

    const configured = await mount('measurementTechnique', [], draft, { rule: technique })
    expect(nameOf(configured.root)).toBe('Technique')
    expect(inputLabel(configured.root)).toBe('Technique')
    expect(element(configured.root, (node) => node.tag === 'span' && String(node.props.class).includes('truncate')).props.title)
      .toBe('Technique (measurementTechnique)')

    const bare = await mount('measurementTechnique', [], draft)
    expect(nameOf(bare.root)).toBe('measurementTechnique')
    expect(inputLabel(bare.root)).toBe('measurementTechnique')

    const blank = await mount('citation', [], draft, { rule: { ...technique, label: '   ', valueName: 'citation' } })
    expect(nameOf(blank.root)).toBe('Citation')

    const repeated = await mount('citation', [], draft, { rule: { ...technique, label: 'citation', valueName: 'citation' } })
    expect(nameOf(repeated.root)).toBe('Citation')
    expect(inputLabel(repeated.root)).toBe('Citation')
    for (const mounted of [configured, bare, blank, repeated]) mounted.app.unmount()
  })

  it('keeps a long key on the truncating name line and saves under the key', async () => {
    const key = 'x'.repeat(1000)
    const updates: Editor.CrateDraft[] = []
    const draft = Editor.addValue(seeded(), './', key, { kind: 'text', value: '' })
    const mounted = await mount(key, updates, draft)
    const name = element(mounted.root, (node) => node.tag === 'span' && String(node.props.class).includes('truncate'))
    expect(content(name)).toBe(key)
    expect(element(mounted.root, (node) => node.tag === 'input').props['aria-label']).toBe(key)

    await typeValue(element(mounted.root, (node) => node.tag === 'input'), 'value')

    expect(updates[0].entities[0].properties[key]).toEqual([{ kind: 'text', value: 'value' }])
    mounted.app.unmount()
  })

  it('stays plain without a profile rule', async () => {
    const draft = Editor.addValue(seeded(), './', 'citation', { kind: 'text', value: '' })
    const mounted = await mount('citation', [], draft)
    const text = content(mounted.root)

    expect(text).not.toContain('Recommended')
    expect(text).not.toContain('Required')
    mounted.app.unmount()
  })

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

  it('offers the license presets on an empty reference row', async () => {
    // A profile that wants the license as an entity seeds a reference row.
    const updates: Editor.CrateDraft[] = []
    const draft = Editor.setProperty(seeded(), './', 'license', [{ kind: 'reference', value: '' }])
    const mounted = await mount('license', updates, draft)
    const select = element(mounted.root, (node) => node.props['aria-label'] === 'License preset')

    select.value = 'https://creativecommons.org/licenses/by/4.0/'
    await (select.props.onChange as (event: { target: HostNode }) => Promise<void>)({ target: select })

    expect(updates[0].entities[0].properties.license).toEqual([
      { kind: 'reference', value: 'https://creativecommons.org/licenses/by/4.0/' },
    ])
    mounted.app.unmount()
  })

  it('offers More details on a license linked by URL only', async () => {
    const updates: Editor.CrateDraft[] = []
    const license = 'https://creativecommons.org/licenses/by/4.0/'
    const draft = Editor.setProperty(seeded(), './', 'license', [{ kind: 'reference', value: license }])
    const mounted = await mount('license', updates, draft, { promoteTo: 'CreativeWork' })

    await click(button(mounted.root, 'More details'))

    expect(Editor.findEntity(updates[0], license)?.types).toEqual(['CreativeWork'])
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

  it('gives the parts row a menu and the data picker', async () => {
    const draft = References.addFilePart(seeded(), { id: 's3://bucket/one.csv', name: 'one.csv' })
    const mounted = await mount('hasPart', [], draft)

    expect(labels(mounted.root)).toEqual(expect.arrayContaining(['Unlink', 'Remove entry', 'Add entry']))

    await click(button(mounted.root, 'Add entry'))
    expect(content(mounted.root)).toContain('Picker ./ hasPart')
    mounted.app.unmount()
  })

  it('offers the picker instead of Create and Link on an empty parts row', async () => {
    const draft = Editor.addValue(seeded(), './', 'hasPart', { kind: 'reference', value: '' })
    const mounted = await mount('hasPart', [], draft)

    expect(labels(mounted.root)).toContain('Add files')
    expect(labels(mounted.root)).not.toContain('Create')
    mounted.app.unmount()
  })

  it('offers to remove the file that unlinking would strand', async () => {
    const updates: Editor.CrateDraft[] = []
    const draft = References.addFilePart(seeded(), { id: 's3://bucket/one.csv', name: 'one.csv' })
    const mounted = await mount('hasPart', updates, draft)

    await click(button(mounted.root, 'Unlink'))
    expect(updates).toHaveLength(0)
    expect(content(mounted.root)).toContain('Nothing else in this dataset holds one.csv')

    await click(button(mounted.root, 'Remove one.csv too'))
    expect(Editor.findEntity(updates[0], 's3://bucket/one.csv')).toBeUndefined()
    mounted.app.unmount()
  })

  it('keeps the file when only the link is dropped', async () => {
    const updates: Editor.CrateDraft[] = []
    const draft = References.addFilePart(seeded(), { id: 's3://bucket/one.csv', name: 'one.csv' })
    const mounted = await mount('hasPart', updates, draft)

    await click(button(mounted.root, 'Unlink'))
    await click(button(mounted.root, 'Keep it'))

    expect(Editor.findEntity(updates[0], 's3://bucket/one.csv')).toBeDefined()
    expect(updates[0].entities[0].properties.hasPart).toEqual([{ kind: 'reference', value: '' }])
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
