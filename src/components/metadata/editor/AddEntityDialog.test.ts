import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  button,
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
import * as Uri from '@/lib/profiles/uri'
import * as Orcid from '@/lib/lookup/orcid'
import * as Ror from '@/lib/lookup/ror'
import * as Utils from '@/lib/utils'
import { loadVocabIndex, type VocabIndex } from '@/lib/profiles/vocabulary'

let vocab: VocabIndex
beforeAll(async () => {
  vocab = await loadVocabIndex()
})
afterEach(() => vi.unstubAllGlobals())

const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const EmptyStub = defineComponent(() => () => null)
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

const TypeBrowser = compileClientComponent(new URL('./TypeBrowser.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/lib/crate/editor': Editor,
  '@/lib/profiles/uri': Uri,
})

const AddEntityDialog = compileClientComponent(new URL('./AddEntityDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Dialog.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogHeader.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogTitle.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogDescription.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogFooter.vue': moduleDefault(Passthrough),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/ui/Spinner.vue': moduleDefault(EmptyStub),
  '@/components/metadata/LookupBox.vue': moduleDefault(EmptyStub),
  './TypeBrowser.vue': moduleDefault(TypeBrowser),
  '@/lib/crate/editor': Editor,
  '@/lib/lookup/orcid': Orcid,
  '@/lib/lookup/ror': Ror,
  '@/lib/utils': Utils,
})

const draft = Editor.newDraft()
type Created = { draft: Editor.CrateDraft; entity: Editor.DraftEntity }

function mount(props: Record<string, unknown>, created: Created[] = []) {
  return mountApp(AddEntityDialog, {
    props: { open: true, draft, vocab, onCreated: (value: Created) => created.push(value), ...props },
  })
}

function field(root: HostNode, label: string): HostNode {
  return element(root, (node) => node.tag === 'input' && node.props['aria-label'] === label)
}

async function pickPerson(root: HostNode) {
  await click(button(root, 'Person'))
  await click(button(root, 'Continue'))
}

describe('AddEntityDialog', () => {
  it('offers only the types a reference accepts', async () => {
    const mounted = await mount({ range: ['http://schema.org/Person', 'http://schema.org/Organization'] })
    const text = content(mounted.root)

    expect(text).toContain('Person')
    expect(text).toContain('Organization')
    expect(text).not.toContain('ContactPoint')
    mounted.app.unmount()
  })

  it('selects the only type a search leaves', async () => {
    const mounted = await mount({})
    await typeValue(field(mounted.root, 'Search entity types'), 'SoftwareSourceCode')
    await click(button(mounted.root, 'Continue'))

    expect(content(mounted.root)).toContain('New SoftwareSourceCode')
    mounted.app.unmount()
  })

  it('creates an entity under the slug of its name', async () => {
    const created: Created[] = []
    const mounted = await mount({}, created)
    await pickPerson(mounted.root)
    await typeValue(field(mounted.root, 'Name'), 'Ada Lovelace')
    await click(button(mounted.root, 'Create'))

    expect(created[0].entity).toMatchObject({
      id: '#ada-lovelace',
      types: ['Person'],
      properties: { name: [{ kind: 'text', value: 'Ada Lovelace' }] },
    })
    expect(Editor.findEntity(created[0].draft, '#ada-lovelace')).toBeDefined()
    mounted.app.unmount()
  })

  it('imports a person from an ORCID id', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        person: { name: { 'given-names': { value: 'Ada' }, 'family-name': { value: 'Lovelace' } } },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const created: Created[] = []
    const mounted = await mount({}, created)
    await pickPerson(mounted.root)

    await click(button(mounted.root, 'Import from ORCID'))
    await typeValue(field(mounted.root, 'ORCID identifier'), '0000-0002-1825-0097')
    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Import this record'))
    await flush()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://pub.orcid.org/v3.0/0000-0002-1825-0097',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
    await click(button(mounted.root, 'Create'))

    expect(created[0].entity).toMatchObject({
      id: 'https://orcid.org/0000-0002-1825-0097',
      properties: {
        name: [{ value: 'Ada Lovelace' }],
        givenName: [{ value: 'Ada' }],
        familyName: [{ value: 'Lovelace' }],
      },
    })
    mounted.app.unmount()
  })
})
