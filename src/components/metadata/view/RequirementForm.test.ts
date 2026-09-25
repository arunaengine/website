import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'
import * as Editor from '@/lib/crate/editor'
import * as Lift from '@/lib/shacl/lift'
import * as Repository from '@/lib/repository'
import * as Utils from '@/lib/utils'

const sessionEpoch = ref(0)
const fetchRoCrateRaw = vi.fn()
const replaceMetadataRoCrate = vi.fn()
const onSaved = vi.fn()

const SHAPES = [
  '@prefix schema: <http://schema.org/> .',
  '@prefix sh: <http://www.w3.org/ns/shacl#> .',
  '[] a sh:NodeShape ; sh:targetClass schema:Dataset ;',
  '  sh:property [ sh:path [ sh:alternativePath ( schema:author schema:creator ) ] ; sh:minCount 1 ] ;',
  '  sh:property [ sh:path schema:license ; sh:minCount 1 ; sh:severity sh:Warning ] .',
].join('\n')
const AUTHOR = {
  code: 'constraint_violation', severity: 'violation', focus_node: './', rule: 'minCount', message: 'Add an author.',
  path: '(<http://schema.org/author> | <http://schema.org/creator>)', completeness: 'complete',
}
const CRATE = {
  '@context': 'https://w3id.org/ro/crate/1.2/context',
  '@graph': [
    { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
    { '@id': './', '@type': 'Dataset', name: 'Soil data' },
  ],
}

const Empty = defineComponent(() => () => null)
// Typing into a row sets its property to "Ada Lovelace".
const RowStub = defineComponent({
  props: { draft: Object, entity: Object, property: String },
  emits: ['update'],
  setup: (props, { emit }) => () =>
    h('button', {
      onClick: () => emit('update', Editor.setProperty(
        props.draft as Editor.CrateDraft, (props.entity as Editor.DraftEntity).id, props.property ?? '',
        [{ kind: 'text', value: 'Ada Lovelace' }],
      )),
    }, `Row ${props.property}`),
})

const Form = compileClientComponent(new URL('./RequirementForm.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(defineComponent({
    inheritAttrs: false,
    setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
  })),
  '@/components/ui/Spinner.vue': moduleDefault(Empty),
  '@/components/metadata/editor/PropertyRow.vue': moduleDefault(RowStub),
  '@/components/metadata/editor/grid': { ROW_LIST: '' },
  '@/composables/useAruna': { useAruna: () => ({ fetchRoCrateRaw, replaceMetadataRoCrate, sessionEpoch }) },
  '@/lib/crate/editor': Editor,
  '@/lib/profiles/vocabulary': { loadVocabIndex: () => Promise.resolve(null) },
  '@/lib/repository': Repository,
  '@/lib/shacl/lift': Lift,
  '@/lib/utils': Utils,
})

async function mount(findings: unknown[]) {
  const mounted = await mountApp(Form, { props: { documentId: 'd1', findings, shapes: SHAPES, onSaved } })
  await flush()
  if (mounted.errors.length) throw mounted.errors[0]
  return mounted
}

beforeEach(() => {
  sessionEpoch.value = 0
  onSaved.mockReset()
  fetchRoCrateRaw.mockReset().mockResolvedValue(CRATE)
  replaceMetadataRoCrate.mockReset().mockResolvedValue({})
})

describe('RequirementForm', () => {
  it('saves a failing field into the dataset crate', async () => {
    const mounted = await mount([AUTHOR, { ...AUTHOR, severity: 'warning', path: 'http://schema.org/license' }])
    expect(content(mounted.root)).toContain('Row author')
    expect(content(mounted.root)).toContain('Row license')
    expect(button(mounted.root, 'Save to the dataset').props.disabled).toBe(true)

    await click(button(mounted.root, 'Row author'))
    await click(button(mounted.root, 'Save to the dataset'))

    const [documentId, body] = replaceMetadataRoCrate.mock.calls[0]
    const root = body.rocrate['@graph'].find((node: { '@id': string }) => node['@id'] === './')
    expect(documentId).toBe('d1')
    expect(body).not.toHaveProperty('public')
    expect(root).toMatchObject({ name: 'Soil data', author: 'Ada Lovelace' })
    expect(onSaved).toHaveBeenCalledTimes(1)
    mounted.app.unmount()
  })

  it('renders nothing for a finding no rule can edit', async () => {
    const mounted = await mount([{ ...AUTHOR, path: 'http://schema.org/publisher' }])
    expect(content(mounted.root)).not.toContain('Row')
    expect(content(mounted.root)).not.toContain('Save to the dataset')
    mounted.app.unmount()
  })

  it('shows why a save failed and does not report it saved', async () => {
    replaceMetadataRoCrate.mockRejectedValue(new Error('conflict'))
    const mounted = await mount([AUTHOR])
    await click(button(mounted.root, 'Row author'))
    await click(button(mounted.root, 'Save to the dataset'))

    expect(content(mounted.root)).toContain('conflict')
    expect(onSaved).not.toHaveBeenCalled()
    mounted.app.unmount()
  })
})
