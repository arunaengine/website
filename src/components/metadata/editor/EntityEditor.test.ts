import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  moduleDefault,
  mountApp,
} from '@/test/clientRender'
import * as Editor from '@/lib/crate/editor'
import * as Pickers from '@/lib/crate/pickers'

const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const EmptyStub = defineComponent(() => () => null)
// The data picker, reduced to the target it is bound to.
const FilesStub = defineComponent({
  props: { target: { type: Object, required: true } },
  setup: (props) => () => h('p', `Picker ${(props.target as { entityId: string }).entityId} ${(props.target as { property: string }).property}`),
})
// The property dialog, reduced to the two picks this test needs and to what
// the profile hands it to suggest.
const PropertyStub = defineComponent({
  props: { suggestions: { type: Array, default: () => [] }, profileName: { type: String, default: '' } },
  emits: ['pick'],
  setup: (props, { emit }) => () => h('span', [
    h('button', { onClick: () => emit('pick', { key: 'hasPart', kind: 'reference' }) }, 'Pick parts'),
    h('button', { onClick: () => emit('pick', { key: 'publisher', kind: 'text' }) }, 'Pick publisher'),
    h('p', `Suggests ${(props.suggestions as Array<{ valueName: string }>)
      .map((rule) => rule.valueName).join(', ') || 'nothing'} from ${props.profileName || 'no profile'}`),
  ]),
})

function rule(valueName: string, obligation: string) {
  return {
    id: valueName,
    label: valueName,
    description: '',
    kind: 'text' as const,
    propertyUri: `http://schema.org/${valueName}`,
    valueName,
    obligation: obligation as 'MUST' | 'SHOULD' | 'MAY',
  }
}

const EntityEditor = compileClientComponent(new URL('./EntityEditor.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/CopyButton.vue': moduleDefault(EmptyStub),
  '@/components/ui/EmptyState.vue': moduleDefault(EmptyStub),
  './RootForm.vue': moduleDefault(EmptyStub),
  './EntityHeader.vue': moduleDefault(EmptyStub),
  './PropertyEditor.vue': moduleDefault(EmptyStub),
  './AddPropertyDialog.vue': moduleDefault(PropertyStub),
  './AddFilesDialog.vue': moduleDefault(FilesStub),
  '@/lib/crate/editor': Editor,
  '@/lib/crate/pickers': Pickers,
})

function mount(
  updates: Editor.CrateDraft[],
  draft = Editor.newDraft(),
  selected = './',
  profileRules: Editor.ProfileExpectation | null = null,
) {
  return mountApp(EntityEditor, {
    props: {
      draft,
      selected,
      vocab: null,
      issues: [],
      profiles: [],
      profileId: '',
      profileRules,
      onUpdate: (next: Editor.CrateDraft) => updates.push(next),
    },
  })
}

describe('EntityEditor', () => {
  it('opens the picker instead of adding an empty parts row', async () => {
    const updates: Editor.CrateDraft[] = []
    const mounted = await mount(updates)

    await click(button(mounted.root, 'Add property'))
    await click(button(mounted.root, 'Pick parts'))

    expect(updates).toHaveLength(0)
    expect(content(mounted.root)).toContain('Picker ./ hasPart')
    mounted.app.unmount()
  })

  it('binds the picker to the entity that is being edited', async () => {
    const draft = Editor.addEntity(Editor.newDraft(), { type: 'Dataset', id: '#folder', name: 'raw' }).draft
    const mounted = await mount([], draft, '#folder')

    await click(button(mounted.root, 'Add property'))
    await click(button(mounted.root, 'Pick parts'))

    expect(content(mounted.root)).toContain('Picker #folder hasPart')
    mounted.app.unmount()
  })

  it('offers what the profile still allows on the open entity', async () => {
    // The rules follow the selected entity's type, not the dataset's.
    const action = Editor.addEntity(Editor.newDraft(), { type: 'http://schema.org/CreateAction', id: '#run' })
    const draft = Editor.setProperty(action.draft, '#run', 'endTime', [{ kind: 'datetime', value: '' }])
    const mounted = await mount([], draft, '#run', {
      name: 'Process Run Crate',
      root: { label: 'Root dataset', required: [], recommended: [], optional: [rule('funder', 'MAY')] },
      shapes: {
        CreateAction: {
          label: 'Run action',
          required: [],
          recommended: [rule('endTime', 'SHOULD')],
          optional: [rule('startTime', 'MAY'), rule('error', 'MAY')],
        },
      },
      types: [],
      contents: [],
    })

    await click(button(mounted.root, 'Add property'))

    expect(content(mounted.root)).toContain('Suggests startTime, error from Process Run Crate')
    mounted.app.unmount()
  })

  it('adds an ordinary property as an empty row', async () => {
    const updates: Editor.CrateDraft[] = []
    const mounted = await mount(updates)

    await click(button(mounted.root, 'Add property'))
    await click(button(mounted.root, 'Pick publisher'))

    expect(updates[0].entities[0].properties.publisher).toEqual([{ kind: 'text', value: '' }])
    mounted.app.unmount()
  })
})
