import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileClientComponent, moduleDefault, mountApp, nodes } from '@/test/clientRender'
import * as Editor from '@/lib/crate/editor'
import * as References from '@/lib/crate/references'
import * as Pickers from '@/lib/crate/pickers'
import * as Grid from './grid'
import { loadVocabIndex, type VocabIndex } from '@/lib/profiles/vocabulary'

// The root form and every property row must share one row template, so labels
// and action columns line up across the whole editor.

let vocab: VocabIndex
beforeAll(async () => {
  vocab = await loadVocabIndex()
})

const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const EmptyStub = defineComponent(() => () => null)
const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const InputStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: '' } },
  setup: (props, { attrs }) => () => h('input', { ...attrs, value: props.modelValue }),
})

const shared = {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  './IssueMark.vue': moduleDefault(EmptyStub),
  './grid': Grid,
  '@/lib/crate/editor': Editor,
}

const PropertyRow = compileClientComponent(new URL('./PropertyRow.vue', import.meta.url), {
  ...shared,
  '@/components/ui/Tooltip.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenu.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuTrigger.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuItem.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuSub.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuSubTrigger.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuSubContent.vue': moduleDefault(Passthrough),
  './ValueInput.vue': moduleDefault(EmptyStub),
  './ReferenceValue.vue': moduleDefault(EmptyStub),
  './LinkEntityDialog.vue': moduleDefault(EmptyStub),
  './AddEntityDialog.vue': moduleDefault(EmptyStub),
  './AddFilesDialog.vue': moduleDefault(EmptyStub),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/lib/crate/references': References,
  '@/lib/crate/pickers': Pickers,
})

const RootForm = compileClientComponent(new URL('./RootForm.vue', import.meta.url), {
  ...shared,
  '@/components/ui/Select.vue': moduleDefault(EmptyStub),
  '@/components/ui/Textarea.vue': moduleDefault(InputStub),
  './PropertyEditor.vue': moduleDefault(EmptyStub),
  './PropertyRow.vue': moduleDefault(PropertyRow),
})

function rows(root: Parameters<typeof nodes>[0], className: string) {
  return nodes(root).filter((node) => node.props.class === className)
}

describe('editor row alignment', () => {
  it('lays the root form and a property row on the same grid', async () => {
    const draft = Editor.newDraft()
    const row = await mountApp(PropertyRow, {
      props: { draft, entity: draft.entities[0], property: 'name', vocab },
    })
    const form = await mountApp(RootForm, {
      props: { draft, vocab, issues: [], profiles: [], profileId: '' },
    })

    expect(rows(row.root, Grid.ROW_GRID)).toHaveLength(1)
    expect(rows(form.root, Grid.ROW_GRID).length).toBeGreaterThan(1)
    expect(rows(row.root, Grid.ROW_ACTIONS)).toHaveLength(1)
    expect(rows(form.root, Grid.ROW_ACTIONS).length).toBe(rows(form.root, Grid.ROW_GRID).length)
    expect(Grid.ROW_GRID).toContain('grid-cols-[11rem_minmax(0,1fr)_auto]')
    expect(Grid.ROW_ACTIONS).toContain('w-20')
    row.app.unmount()
    form.app.unmount()
  })
})
