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
  nodes,
  typeValue,
  type HostNode,
} from '@/test/clientRender'
import * as Editor from '@/lib/crate/editor'
import * as TypeDefaults from '@/lib/crate/typeDefaults'
import * as Uri from '@/lib/profiles/uri'
import * as Orcid from '@/lib/lookup/orcid'
import * as Ror from '@/lib/lookup/ror'
import * as Registry from '@/lib/lookup/registry'
import * as Utils from '@/lib/utils'
import { loadVocabIndex, type VocabIndex } from '@/lib/profiles/vocabulary'

let vocab: VocabIndex
beforeAll(async () => {
  vocab = await loadVocabIndex()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const EmptyStub = defineComponent(() => () => null)
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

const LookupBox = compileClientComponent(new URL('../LookupBox.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Spinner.vue': moduleDefault(EmptyStub),
  '@/lib/lookup/registry': Registry,
})

// The search box and the list around the type browser, without the dialog chrome.
const CommandPaneStub = defineComponent({
  props: { modelValue: { type: String, default: '' }, ariaLabel: String, placeholder: String },
  emits: ['update:modelValue'],
  setup(props, { emit, slots }) {
    return () => h('div', [
      h('input', {
        'aria-label': props.ariaLabel ?? props.placeholder,
        value: props.modelValue,
        onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
      }),
      slots.default?.(),
    ])
  },
})

const AddEntityDialog = compileClientComponent(new URL('./AddEntityDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/CommandPane.vue': moduleDefault(CommandPaneStub),
  '@/components/ui/Dialog.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogHeader.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogTitle.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogDescription.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogFooter.vue': moduleDefault(Passthrough),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Spinner.vue': moduleDefault(EmptyStub),
  '@/components/metadata/LookupBox.vue': moduleDefault(LookupBox),
  './TypeBrowser.vue': moduleDefault(TypeBrowser),
  '@/lib/crate/editor': Editor,
  '@/lib/crate/typeDefaults': TypeDefaults,
  '@/lib/lookup/orcid': Orcid,
  '@/lib/lookup/ror': Ror,
  '@/lib/utils': Utils,
})

const draft = Editor.newDraft()
type Created = { draft: Editor.CrateDraft; entity: Editor.DraftEntity }

// An organization typed by hand: same name as the ORCID affiliation, other id.
function withInstitute(): Editor.CrateDraft {
  return Editor.addEntity(draft, { type: 'Organization', name: 'Example Institute', id: '#institute' }).draft
}

function orcidPayload(institution: string) {
  return {
    'expanded-result': [{
      'orcid-id': '0000-0002-1825-0097',
      'given-names': 'Ada',
      'family-names': 'Lovelace',
      'institution-name': [institution],
    }],
  }
}

const ROR_AFFILIATION = {
  items: [{
    chosen: true,
    organization: {
      id: 'https://ror.org/03yrm5c26',
      names: [{ value: 'Example Institute', types: ['ror_display'] }],
      links: [{ type: 'website', value: 'https://example.test' }],
      locations: [{ geonames_details: { country_name: 'Germany' } }],
    },
  }],
}

function mount(props: Record<string, unknown> = {}, created: Created[] = []) {
  return mountApp(AddEntityDialog, {
    props: { open: true, draft, vocab, onCreated: (value: Created) => created.push(value), ...props },
  })
}

function field(root: HostNode, label: string): HostNode {
  return element(root, (node) => node.tag === 'input' && node.props['aria-label'] === label)
}

// The type list renders each name in its own bold span.
function typeNames(root: HostNode): string[] {
  return nodes(root)
    .filter((node) => String(node.props.class ?? '').includes('text-sm font-medium'))
    .map((node) => content(node).trim())
}

describe('AddEntityDialog', () => {
  it('pins the common types above everything else', async () => {
    const mounted = await mount()
    const text = content(mounted.root)

    expect(text.indexOf('Common')).toBeLessThan(text.indexOf('Everything else'))
    expect(text).toContain('Person')
    expect(text).toContain('ContactPoint')
    mounted.app.unmount()
  })

  it('keeps the common group on top of the search results', async () => {
    const mounted = await mount()
    await typeValue(field(mounted.root, 'Search entity types'), 'organ')
    const text = content(mounted.root)

    expect(text.indexOf('Common')).toBeLessThan(text.indexOf('Everything else'))
    expect(text.indexOf('Organization')).toBeLessThan(text.indexOf('Everything else'))
    mounted.app.unmount()
  })

  it('restricts the list to the types a reference accepts', async () => {
    const mounted = await mount({ range: ['http://schema.org/Person', 'http://schema.org/Organization'] })
    expect(content(mounted.root)).not.toContain('ContactPoint')

    const checkbox = element(mounted.root, (node) => node.props['aria-label'] === 'Only matching types')
    await (checkbox.props.onChange as (event: { target: { checked: boolean } }) => void)({
      target: { checked: false },
    })
    await flush()

    expect(content(mounted.root)).toContain('ContactPoint')
    mounted.app.unmount()
  })

  it('creates an entity under the slug of its name', async () => {
    const created: Created[] = []
    const mounted = await mount({}, created)

    await click(button(mounted.root, 'Place'))
    await typeValue(field(mounted.root, 'Name'), 'Giessen')
    await click(button(mounted.root, 'Create'))

    expect(created[0].entity).toMatchObject({
      id: '#giessen',
      types: ['Place'],
      properties: { name: [{ kind: 'text', value: 'Giessen' }] },
    })
    expect(Editor.findEntity(created[0].draft, '#giessen')).toBeDefined()
    mounted.app.unmount()
  })

  it('starts a person with the properties most people fill in', async () => {
    const created: Created[] = []
    const mounted = await mount({}, created)

    await click(button(mounted.root, 'Person'))
    expect(content(mounted.root)).toContain('Starts with: Given name, Family name, Affiliation')

    await click(button(mounted.root, 'Create'))

    expect(created[0].entity.properties).toEqual({
      givenName: [{ kind: 'text', value: '' }],
      familyName: [{ kind: 'text', value: '' }],
      affiliation: [{ kind: 'reference', value: '' }],
    })
    mounted.app.unmount()
  })

  it('keeps data types out of the contextual list', async () => {
    const mounted = await mount({ excludeData: true })

    expect(typeNames(mounted.root)).toContain('Person')
    expect(typeNames(mounted.root)).not.toContain('File')
    expect(typeNames(mounted.root)).not.toContain('Dataset')
    mounted.app.unmount()
  })

  it('names the registry a person or an organization is searched in', async () => {
    const mounted = await mount()

    await click(button(mounted.root, 'Person'))
    expect(content(mounted.root)).toContain('Search ORCID by name or id')

    await click(button(mounted.root, 'Back'))
    await click(button(mounted.root, 'Organization'))
    expect(content(mounted.root)).toContain('Search ROR by name or id')
    mounted.app.unmount()
  })

  it('keeps a long identifier inside the dialog', async () => {
    // Everything under the type header must wrap or truncate, never widen it.
    const mounted = await mount()

    await click(button(mounted.root, 'Person'))
    await typeValue(field(mounted.root, 'Name'), 'https://orcid.org/0000-0002-1825-0097')

    const body = element(mounted.root, (node) => String(node.props.class ?? '').includes('space-y-4'))
    expect(String(body.props.class)).toContain('min-w-0')

    const imported = element(mounted.root, (node) => String(node.props.title ?? '').startsWith('Use ORCID'))
    expect(String(imported.props.class)).toContain('min-w-0')
    expect(String(imported.props.class)).toContain('truncate')

    const hint = element(mounted.root, (node) => node.tag === 'p' && content(node).includes('Starts with:'))
    expect(String(hint.props.class)).toContain('break-words')
    mounted.app.unmount()
  })

  it('creates a person without any link unless one is picked', async () => {
    // A contextual person must not silently become an author.
    const created: Created[] = []
    const mounted = await mount({ offerLink: true }, created)

    await click(button(mounted.root, 'Person'))
    const select = element(mounted.root, (node) => node.props['aria-label'] === 'Link from the dataset as')
    expect(select.props.value).toBe('')
    expect(content(select)).toContain('None')
    expect(content(select)).toContain('Author')

    await click(button(mounted.root, 'Create'))

    expect(created[0].draft.entities[0].properties.author).toBeUndefined()
    mounted.app.unmount()
  })

  it('links a new person as the property that was picked', async () => {
    const created: Created[] = []
    const mounted = await mount({ offerLink: true }, created)

    await click(button(mounted.root, 'Person'))
    const select = element(mounted.root, (node) => node.props['aria-label'] === 'Link from the dataset as')
    select.value = 'author'
    await (select.props.onChange as (event: { target: HostNode }) => Promise<void>)({ target: select })
    await flush()
    await click(button(mounted.root, 'Create'))

    expect(created[0].draft.entities[0].properties.author).toEqual([
      { kind: 'reference', value: created[0].entity.id },
    ])
    mounted.app.unmount()
  })

  it('shows the fixed link when opened from a property row', async () => {
    const mounted = await mount({ linkedFrom: { entity: 'Example dataset', property: 'Author' } })

    await click(button(mounted.root, 'Person'))
    expect(content(mounted.root)).toContain('Linked from Example dataset as Author')
    expect(() => element(mounted.root, (node) => node.props['aria-label'] === 'Link from the dataset as')).toThrow()
    mounted.app.unmount()
  })

  it('takes a person from an ORCID search by name', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (_url: unknown) => ({
      ok: true,
      json: async () => ({
        'expanded-result': [{
          'orcid-id': '0000-0002-1825-0097',
          'given-names': 'Ada',
          'family-names': 'Lovelace',
          'institution-name': ['Example Institute'],
        }],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const created: Created[] = []
    const mounted = await mount({}, created)

    await click(button(mounted.root, 'Person'))
    await typeValue(field(mounted.root, 'Name'), 'ada countess lovelace')
    vi.advanceTimersByTime(300)
    for (let round = 0; round < 6; round += 1) await flush()

    expect(String(fetchMock.mock.calls[0][0])).toContain('expanded-search')
    await click(element(mounted.root, (node) => node.props.role === 'option'))
    await click(button(mounted.root, 'Create'))

    expect(created[0].entity).toMatchObject({
      id: 'https://orcid.org/0000-0002-1825-0097',
      types: ['Person'],
      properties: {
        name: [{ value: 'Ada Lovelace' }],
        givenName: [{ value: 'Ada' }],
        familyName: [{ value: 'Lovelace' }],
        affiliation: [{ kind: 'reference', value: '#org-example-institute' }],
      },
    })
    expect(Editor.findEntity(created[0].draft, '#org-example-institute')?.types).toEqual(['Organization'])
    mounted.app.unmount()
  })

  it('fetches the record behind a pasted ORCID id', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        person: { name: { 'given-names': { value: 'Grace' }, 'family-name': { value: 'Hopper' } } },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const created: Created[] = []
    const mounted = await mount({}, created)

    await click(button(mounted.root, 'Person'))
    await typeValue(field(mounted.root, 'Name'), 'https://orcid.org/0000-0001-2345-6789')
    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Import this record'))
    await flush()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://pub.orcid.org/v3.0/0000-0001-2345-6789',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
    await click(button(mounted.root, 'Create'))

    expect(created[0].entity).toMatchObject({
      id: 'https://orcid.org/0000-0001-2345-6789',
      properties: { name: [{ value: 'Grace Hopper' }] },
    })
    mounted.app.unmount()
  })

  it('reuses the organization a person is affiliated with', async () => {
    // Two people of one institute must not leave two Organization entities.
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => orcidPayload('Example  institute') })))
    const created: Created[] = []
    const mounted = await mount({ draft: withInstitute() }, created)

    await click(button(mounted.root, 'Person'))
    await typeValue(field(mounted.root, 'Name'), 'ada lovelace')
    vi.advanceTimersByTime(300)
    for (let round = 0; round < 6; round += 1) await flush()
    await click(element(mounted.root, (node) => node.props.role === 'option'))
    await click(button(mounted.root, 'Create'))

    const organizations = created[0].draft.entities.filter((entity) => entity.types.includes('Organization'))
    expect(organizations.map((entity) => entity.id)).toEqual(['#institute'])
    expect(created[0].entity.properties.affiliation).toEqual([{ kind: 'reference', value: '#institute' }])
    mounted.app.unmount()
  })

  it('reuses an entity the typed name already stands for', async () => {
    vi.useFakeTimers()
    const seeded = withInstitute()
    const created: Created[] = []
    const mounted = await mount({ draft: seeded }, created)

    await click(button(mounted.root, 'Organization'))
    await typeValue(field(mounted.root, 'Name'), '  example institute ')
    expect(content(mounted.root)).toContain('Matches Example Institute already in this dataset; it will be reused.')

    await click(button(mounted.root, 'Create'))

    expect(created[0].entity.id).toBe('#institute')
    expect(created[0].draft.entities).toHaveLength(seeded.entities.length)
    mounted.app.unmount()
  })

  it('upgrades an ORCID affiliation to its ROR record', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async (url: unknown) => ({
      ok: true,
      json: async () => (String(url).includes('ror.org') ? ROR_AFFILIATION : orcidPayload('Example Institute')),
    })))
    const created: Created[] = []
    const mounted = await mount({}, created)

    await click(button(mounted.root, 'Person'))
    await typeValue(field(mounted.root, 'Name'), 'ada lovelace')
    vi.advanceTimersByTime(300)
    for (let round = 0; round < 6; round += 1) await flush()
    await click(element(mounted.root, (node) => node.props.role === 'option'))
    for (let round = 0; round < 6; round += 1) await flush()
    await click(button(mounted.root, 'Create'))

    expect(created[0].entity.properties.affiliation)
      .toEqual([{ kind: 'reference', value: 'https://ror.org/03yrm5c26' }])
    expect(Editor.findEntity(created[0].draft, 'https://ror.org/03yrm5c26')?.properties).toMatchObject({
      name: [{ value: 'Example Institute' }],
      url: [{ kind: 'url', value: 'https://example.test' }],
      addressCountry: [{ value: 'Germany' }],
    })
    expect(Editor.findEntity(created[0].draft, '#org-example-institute')).toBeUndefined()
    mounted.app.unmount()
  })

  it('keeps an imported value instead of its empty default', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        person: { name: { 'given-names': { value: 'Grace' }, 'family-name': { value: 'Hopper' } } },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const created: Created[] = []
    const mounted = await mount({}, created)

    await click(button(mounted.root, 'Person'))
    await typeValue(field(mounted.root, 'Name'), 'https://orcid.org/0000-0001-2345-6789')
    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Import this record'))
    await flush()
    await click(button(mounted.root, 'Create'))

    expect(created[0].entity.properties.givenName).toEqual([{ kind: 'text', value: 'Grace' }])
    expect(created[0].entity.properties.affiliation).toEqual([{ kind: 'reference', value: '' }])

    const graph = Editor.toRoCrate(created[0].draft)['@graph'] as Array<Record<string, unknown>>
    const person = graph.find((node) => node['@id'] === created[0].entity.id)
    expect(Object.keys(person ?? {})).toEqual(['@id', '@type', 'name', 'givenName', 'familyName'])
    mounted.app.unmount()
  })
})
