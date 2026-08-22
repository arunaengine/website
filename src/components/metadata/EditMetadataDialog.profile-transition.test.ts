import { readFileSync } from 'node:fs'
import { compile } from '@vue/compiler-dom'
import { compileScript, parse } from '@vue/compiler-sfc'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import * as VueRuntime from 'vue'
import { createRenderer, defineComponent, h, nextTick, ref, type App, type Component } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  profileReferenceIri,
  profileRulesLoadState,
  serverValidationRequiredConstraints,
} from '@/composables/useAruna'
import type { MetadataProfile } from '@/data/types'
import * as Api from '@/lib/api'
import * as ContentIdentity from '@/lib/contentIdentity'
import * as DataEntities from '@/lib/dataEntities'
import * as Subcrates from '@/lib/subcrates'
import * as GraphIri from '@/lib/graphIri'
import * as CustomFields from '@/lib/customFields'
import * as ProfileControls from '@/lib/profiles/controls'
import * as ProfileEmit from '@/lib/profiles/emit'
import * as EntityEntries from '@/lib/profiles/entityEntries'
import * as EntityTree from '@/lib/profiles/entityTree'
import * as ProfileMigration from '@/lib/profiles/migration'
import * as ProfileRoCrate from '@/lib/profiles/rocrate'
import * as ProfileUri from '@/lib/profiles/uri'
import * as ProfileValidate from '@/lib/profiles/validate'
import * as RoCrateVersions from '@/lib/rocrateVersions'
import * as ProfileTypes from '@/lib/profiles/types'
import * as ShaclLift from '@/lib/shacl/lift'
import type { ProfilePropertyRule } from '@/lib/profiles/types'

const saving = ref(false)
const profiles = ref<MetadataProfile[]>([])
const metadataItems = ref([])
const apiBaseUrl = ref('https://api.example.test')
const authToken = ref('test-token')
const profileValidationCapabilities = ref<Api.ProfileValidationCapabilitiesResponse | null>(null)
const dialogOpen = ref(false)
const fetchRoCrateRaw = vi.fn()
const getMetadataDocument = vi.fn()
const getMetadataItem = vi.fn()
const replaceMetadataRoCrate = vi.fn()
const loadProfileCrate = vi.fn()
const loadProfileValidationCapabilities = vi.fn()

const SlotStub = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const SelectStub = defineComponent({
  props: { modelValue: { default: '' }, options: { type: Array, default: () => [] } },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () => h('select', {
      ...attrs,
      modelValue: props.modelValue,
      options: props.options,
      onSelect: (value: string) => emit('update:modelValue', value),
    })
  },
})
const ProfileControlStub = defineComponent({
  props: { control: { type: Object, required: true }, modelValue: { default: undefined } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('profile-control', {
      property: (props.control as { property: string }).property,
      modelValue: props.modelValue,
      onSet: (value: unknown) => emit('update:modelValue', value),
    })
  },
})
const EntityControlStub = defineComponent({
  props: { control: { type: Object, required: true }, entries: { type: Array, default: () => [] } },
  setup(props) {
    return () => h('entity-control', {
      property: (props.control as { property: string }).property,
      entries: props.entries,
    })
  },
})
const CustomFieldsStub = defineComponent({
  props: { rows: { type: Array, default: () => [] }, preserved: { type: Array, default: () => [] } },
  setup(props) {
    return () => h('custom-fields', { rows: props.rows, preserved: props.preserved })
  },
})
const FilesEditorStub = defineComponent({
  props: { modelValue: { type: Array, default: () => [] } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('files-editor', {
      files: props.modelValue,
      onSet: (files: unknown[]) => emit('update:modelValue', files),
    })
  },
})

const moduleDefault = (component: Component) => ({ __esModule: true, default: component })
const icons = new Proxy({}, { get: () => SlotStub })
const renderRuntime = new Proxy(VueRuntime, {
  get(target, property, receiver) {
    return property === 'Transition' ? SlotStub : Reflect.get(target, property, receiver)
  },
})

function compileDialog(): Component {
  const url = new URL('./EditMetadataDialog.vue', import.meta.url)
  const source = readFileSync(url, 'utf8')
  const { descriptor } = parse(source, { filename: url.pathname })
  if (!descriptor.template) throw new Error('EditMetadataDialog.vue has no template')
  const script = compileScript(descriptor, { id: url.pathname, inlineTemplate: false })
  const scriptJavascript = transpileModule(script.content, {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  }).outputText
  const modules: Record<string, unknown> = {
    vue: VueRuntime,
    '@lucide/vue': icons,
    '@/components/ui/Dialog.vue': moduleDefault(SlotStub),
    '@/components/ui/DialogContent.vue': moduleDefault(SlotStub),
    '@/components/ui/DialogHeader.vue': moduleDefault(SlotStub),
    '@/components/ui/DialogTitle.vue': moduleDefault(SlotStub),
    '@/components/ui/DialogDescription.vue': moduleDefault(SlotStub),
    '@/components/ui/DialogFooter.vue': moduleDefault(SlotStub),
    '@/components/ui/DialogClose.vue': moduleDefault(SlotStub),
    '@/components/ui/Button.vue': moduleDefault(ButtonStub),
    '@/components/ui/Input.vue': moduleDefault(SlotStub),
    '@/components/ui/Textarea.vue': moduleDefault(SlotStub),
    '@/components/ui/Switch.vue': moduleDefault(SlotStub),
    '@/components/ui/Skeleton.vue': moduleDefault(SlotStub),
    '@/components/ui/Tabs.vue': moduleDefault(SlotStub),
    '@/components/ui/TabsList.vue': moduleDefault(SlotStub),
    '@/components/ui/TabsTrigger.vue': moduleDefault(SlotStub),
    '@/components/ui/TabsContent.vue': moduleDefault(SlotStub),
    '@/components/ui/Select.vue': moduleDefault(SelectStub),
    '@/components/metadata/DatasetFilesEditor.vue': moduleDefault(FilesEditorStub),
    '@/components/metadata/DatasetEntityInstances.vue': moduleDefault(EntityControlStub),
    '@/components/metadata/ProfileControlField.vue': moduleDefault(ProfileControlStub),
    '@/components/metadata/profile-builder/LiftNotesPanel.vue': moduleDefault(SlotStub),
    '@/components/metadata/CustomFieldsEditor.vue': moduleDefault(CustomFieldsStub),
    '@/components/metadata/SubcratePickerDialog.vue': moduleDefault(SlotStub),
    '@/components/metadata/ProfileValidationPreview.vue': moduleDefault(SlotStub),
    '@/composables/useAruna': {
      profileReferenceIri,
      profileRulesLoadState,
      serverValidationRequiredConstraints,
      useAruna: () => ({
        saving,
        fetchRoCrateRaw,
        getMetadataDocument,
        getMetadataItem,
        replaceMetadataRoCrate,
        toMetadataDoc: (item: { document_path?: string }) => ({ title: item.document_path ?? '' }),
        metadataItems,
        apiBaseUrl,
        authToken,
        profiles,
        loadProfileCrate,
        profileValidationCapabilities,
        loadProfileValidationCapabilities,
      }),
    },
    '@/lib/api': Api,
    '@/lib/contentIdentity': ContentIdentity,
    '@/lib/dataEntities': DataEntities,
    '@/lib/subcrates': Subcrates,
    '@/lib/graphIri': GraphIri,
    '@/lib/customFields': CustomFields,
    '@/lib/profiles/controls': ProfileControls,
    '@/lib/profiles/emit': ProfileEmit,
    '@/lib/profiles/entityEntries': EntityEntries,
    '@/lib/profiles/entityTree': EntityTree,
    '@/lib/profiles/migration': ProfileMigration,
    '@/lib/profiles/rocrate': ProfileRoCrate,
    '@/lib/profiles/uri': ProfileUri,
    '@/lib/shacl/lift': ShaclLift,
    '@/composables/useProfilePreview': {
      useProfilePreview: () => ({
        result: ref(null),
        running: ref(false),
        unavailable: ref(false),
        error: ref<string | null>(null),
        preview: vi.fn(),
        previewNow: vi.fn(),
        reset: vi.fn(),
      }),
    },
    '@/lib/profiles/validate': ProfileValidate,
    '@/lib/rocrateVersions': RoCrateVersions,
    '@/lib/profiles/types': ProfileTypes,
  }
  const cjs = { exports: {} as Record<string, unknown> }
  const localRequire = (id: string) => {
    if (!(id in modules)) throw new Error(`Missing test module ${id}`)
    return modules[id]
  }
  new Function('require', 'exports', 'module', scriptJavascript)(localRequire, cjs.exports, cjs)
  const component = cjs.exports.default as Component
  const { code } = compile(descriptor.template.content, {
    mode: 'function',
    prefixIdentifiers: true,
    bindingMetadata: script.bindings,
  })
  const renderJavascript = transpileModule(code, {
    compilerOptions: { module: ModuleKind.None, target: ScriptTarget.ES2022 },
  }).outputText
  Object.assign(component, { render: new Function('Vue', renderJavascript)(renderRuntime) })
  return component
}

const EditMetadataDialog = compileDialog()

type HostKind = 'root' | 'element' | 'text' | 'comment'
interface HostNode {
  kind: HostKind
  tag: string
  text: string
  props: Record<string, unknown>
  children: HostNode[]
  parent: HostNode | null
}

function hostNode(kind: HostKind, tag = '', text = ''): HostNode {
  return { kind, tag, text, props: {}, children: [], parent: null }
}

function insert(child: HostNode, parent: HostNode, anchor: HostNode | null = null) {
  if (child.parent) {
    const previous = child.parent.children.indexOf(child)
    if (previous >= 0) child.parent.children.splice(previous, 1)
  }
  child.parent = parent
  const index = anchor ? parent.children.indexOf(anchor) : -1
  if (index >= 0) parent.children.splice(index, 0, child)
  else parent.children.push(child)
}

const renderer = createRenderer<HostNode, HostNode>({
  patchProp(node, key, _previous, value) {
    node.props[key] = value
  },
  insert,
  remove(node) {
    if (!node.parent) return
    const index = node.parent.children.indexOf(node)
    if (index >= 0) node.parent.children.splice(index, 1)
    node.parent = null
  },
  createElement: (tag) => hostNode('element', tag),
  createText: (text) => hostNode('text', '', text),
  createComment: (text) => hostNode('comment', '', text),
  setText(node, text) {
    node.text = text
  },
  setElementText(node, text) {
    node.text = text
    node.children = []
  },
  parentNode: (node) => node.parent,
  nextSibling(node) {
    if (!node.parent) return null
    return node.parent.children[node.parent.children.indexOf(node) + 1] ?? null
  },
  insertStaticContent(content, parent, anchor) {
    const node = hostNode('text', '', content)
    insert(node, parent, anchor)
    return [node, node]
  },
})

const mountedApps: App<HostNode>[] = []

function nodes(root: HostNode): HostNode[] {
  return [root, ...root.children.flatMap(nodes)]
}

function content(node: HostNode): string {
  return `${node.text} ${node.children.map(content).join(' ')}`.replace(/\s+/g, ' ').trim()
}

async function flush() {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

function profileRule(
  valueName: string,
  propertyUri: string,
  overrides: Partial<ProfilePropertyRule> = {},
): ProfilePropertyRule {
  return {
    id: valueName,
    label: valueName,
    description: '',
    kind: 'text',
    propertyUri,
    valueName,
    obligation: 'MAY',
    ...overrides,
  }
}

function profile(id: string, propertyRules: ProfilePropertyRule[]): MetadataProfile {
  const profileUri = `https://profiles.example.test/${id}`
  return {
    id,
    documentId: `${id}-document`,
    graphIri: profileUri,
    profileUri,
    name: `${id} profile`,
    shortName: id,
    description: '',
    domain: '',
    iconColor: '',
    entityRules: [],
    propertyRules,
    contextTerms: Object.fromEntries(propertyRules.map((rule) => [rule.valueName, rule.propertyUri])),
    suggestedKeywords: [],
    managed: false,
  }
}

function parsedProfile(profileValue: MetadataProfile) {
  return {
    name: profileValue.name,
    description: '',
    version: undefined,
    entityRules: profileValue.entityRules,
    datasetPropertyRules: profileValue.propertyRules,
    schema: undefined,
    contextTerms: profileValue.contextTerms ?? {},
    shapesText: profileValue.shapesText,
    customShapesText: profileValue.customShapesText,
    liftNotes: [],
  }
}

function crate(conformsTo: string, rootFields: Record<string, unknown> = {}) {
  return {
    '@context': ['https://w3id.org/ro/crate/1.2/context', {
      oldName: 'https://example.test/terms/shared',
      oldOnly: 'https://example.test/terms/old-only',
    }],
    '@graph': [
      {
        '@id': 'ro-crate-metadata.json',
        '@type': 'CreativeWork',
        conformsTo: { '@id': 'https://w3id.org/ro/crate/1.2' },
        about: { '@id': './' },
      },
      {
        '@id': './',
        '@type': 'Dataset',
        name: 'Saved dataset',
        description: 'Saved description',
        datePublished: '2026-08-19',
        license: 'https://creativecommons.org/licenses/by/4.0/',
        conformsTo: { '@id': conformsTo },
        ...rootFields,
      },
    ],
  }
}

function rootOf(value: unknown): Record<string, unknown> {
  const graph = (value as { '@graph': Array<Record<string, unknown>> })['@graph']
  return graph.find((entity) => entity['@id'] === './') ?? {}
}

async function mountDialog(value: unknown, publicValue = false): Promise<HostNode> {
  fetchRoCrateRaw.mockResolvedValue(structuredClone(value))
  getMetadataDocument.mockResolvedValue({ public: publicValue })
  const root = hostNode('root')
  const Wrapper = defineComponent({
    setup: () => () => h(EditMetadataDialog, {
      open: dialogOpen.value,
      documentId: 'dataset-1',
      profile: profiles.value[0] ?? null,
    }),
  })
  const app = renderer.createApp(Wrapper)
  app.mount(root)
  mountedApps.push(app)
  dialogOpen.value = true
  await flush()
  return root
}

function profileSelect(root: HostNode): HostNode {
  const select = nodes(root).find((node) =>
    node.tag === 'select'
      && Array.isArray(node.props.options)
      && (node.props.options as Array<{ value: string }>).some((option) => option.value === '__no_profile__'),
  )
  if (!select) throw new Error('Profile select not found')
  return select
}

function selectProfile(root: HostNode, id: string) {
  ;(profileSelect(root).props.onSelect as (value: string) => void)(id)
}

function button(root: HostNode, label: string): HostNode {
  const match = nodes(root).find((node) => node.tag === 'button' && content(node) === label)
  if (!match) throw new Error(`Button ${label} not found`)
  return match
}

function click(node: HostNode) {
  ;(node.props.onClick as () => void)()
}

function requestDialogClose(root: HostNode) {
  const dialog = nodes(root).find((node) =>
    node.props.open === true && typeof node.props['onUpdate:open'] === 'function',
  )
  if (!dialog) throw new Error('Open dialog not found')
  ;(dialog.props['onUpdate:open'] as (open: boolean) => void)(false)
}

function profileControl(root: HostNode, property: string): HostNode {
  const control = nodes(root).find((node) => node.tag === 'profile-control' && node.props.property === property)
  if (!control) throw new Error(`Profile control ${property} not found`)
  return control
}

function customRows(root: HostNode): CustomFields.CustomFieldRow[] {
  return (nodes(root).find((node) => node.tag === 'custom-fields')?.props.rows ?? []) as CustomFields.CustomFieldRow[]
}

function filesEditor(root: HostNode): HostNode {
  const editor = nodes(root).find((node) => node.tag === 'files-editor')
  if (!editor) throw new Error('Files editor not found')
  return editor
}

beforeEach(() => {
  saving.value = false
  dialogOpen.value = false
  profiles.value = []
  metadataItems.value = []
  profileValidationCapabilities.value = null
  fetchRoCrateRaw.mockReset()
  getMetadataDocument.mockReset()
  getMetadataItem.mockReset()
  replaceMetadataRoCrate.mockReset()
  replaceMetadataRoCrate.mockResolvedValue({ document_id: 'dataset-1' })
  loadProfileCrate.mockReset()
  loadProfileCrate.mockImplementation(async (documentId: string) => {
    const selected = profiles.value.find((entry) => entry.documentId === documentId)
    if (!selected) throw new Error('Profile not found')
    return parsedProfile(selected)
  })
  loadProfileValidationCapabilities.mockReset()
  loadProfileValidationCapabilities.mockResolvedValue({
    evaluator: 'test',
    supported_constraints: [],
    unsupported_constraint_policy: 'fail_closed',
    public_profile_iri_template: 'https://w3id.org/aruna/profile/{id}',
    legacy_profile_iri_template: 'https://w3id.org/aruna/{id}',
  })
})

afterEach(() => {
  for (const app of mountedApps.splice(0)) app.unmount()
})

describe('existing Dataset profile transition', () => {
  it('keeps a legacy location unchanged and marks only a newly unresolved pick', async () => {
    const legacy = 's3://raw-data/legacy.fastq.gz'
    const value = crate('', { hasPart: [{ '@id': legacy }] })
    ;(value['@graph'] as Array<Record<string, unknown>>).push({
      '@id': legacy,
      '@type': 'File',
      name: 'Legacy reads',
    })
    const root = await mountDialog(value)

    expect(filesEditor(root).props.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: legacy, name: 'Legacy reads' }),
    ]))
    expect(content(root)).not.toContain('Location identity')

    const unresolved = 's3://raw-data/unresolved.fastq.gz'
    const clear = ContentIdentity.stageSelectedContentReference({ id: unresolved, identity: 'location' })
    ;(filesEditor(root).props.onSet as (files: unknown[]) => void)([
      ...(filesEditor(root).props.files as unknown[]),
      { id: unresolved, name: 'Unresolved reads', types: ['File'] },
    ])
    clear()
    await flush()

    expect(content(root)).toContain('Location identity')
    expect(content(root)).toContain(unresolved)
  })

  it('writes a newly resolved file with its W3ID and contentUrl', async () => {
    const root = await mountDialog(crate(''))
    const digest = 'ab'.repeat(32)
    const location = 's3://raw-data/resolved.fastq.gz'
    const reference = ContentIdentity.arunaContentReference(
      location,
      ContentIdentity.contentIdentityFromBlake3(digest),
    )
    const clear = ContentIdentity.stageSelectedContentReference(reference)
    ;(filesEditor(root).props.onSet as (files: unknown[]) => void)([
      { id: reference.id, name: 'Resolved reads', types: ['File'] },
    ])
    clear()
    await flush()

    click(button(root, 'Save changes'))
    await flush()

    const payload = replaceMetadataRoCrate.mock.calls[0][1] as { rocrate: { '@graph': Array<Record<string, unknown>> } }
    expect(rootOf(payload.rocrate).hasPart).toEqual([{ '@id': reference.id }])
    expect(payload.rocrate['@graph'].find((entity) => entity['@id'] === reference.id)).toMatchObject({
      '@id': reference.id,
      contentUrl: location,
    })
  })

  it.each([
    ['an inline entity', { '@id': 'https://orcid.org/0000-0001', name: 'Jane' }],
    ['a bare literal', 'Jane'],
  ])('preserves %s instead of seeding a lossy entity control', async (_label, author) => {
    const selected = profile('authors', [
      profileRule('author', 'http://schema.org/author', {
        kind: 'entity',
        entityTypes: ['http://schema.org/Person'],
        entitySources: ['existing-external'],
      }),
    ])
    profiles.value = [selected]
    const root = await mountDialog(crate(selected.profileUri!, { author }))

    expect(nodes(root).some((node) =>
      node.tag === 'entity-control' && node.props.property === 'author',
    )).toBe(false)

    click(button(root, 'Save changes'))
    await flush()

    const payload = replaceMetadataRoCrate.mock.calls[0][1] as { rocrate: unknown }
    expect(rootOf(payload.rocrate).author).toEqual(author)
  })

  it('migrates matching property URI values and preserves unmatched values for review', async () => {
    const shared = 'https://example.test/terms/shared'
    const oldEntity = 'https://example.test/terms/old-entity'
    profiles.value = [
      profile('old', [
        profileRule('oldName', shared),
        profileRule('oldOnly', 'https://example.test/terms/old-only'),
        profileRule('oldEntity', oldEntity, {
          kind: 'entity',
          entityTypes: ['http://schema.org/Person'],
          entitySources: ['existing-external'],
        }),
      ]),
      profile('new', [
        profileRule('newName', shared),
        profileRule('oldOnly', 'https://example.test/terms/new-meaning'),
      ]),
    ]
    const root = await mountDialog(crate(profiles.value[0].profileUri!, {
      oldName: 'matching value',
      oldOnly: 'unmatched value',
      oldEntity: { '@id': 'https://orcid.org/0000-0001' },
    }))

    selectProfile(root, 'new')
    await flush()

    expect(content(root)).toContain('Moves into the new newName control because the property URI matches.')
    expect(content(root)).toContain('Remains as custom metadata for review. Nothing is cleared.')
    expect(content(root)).toContain('"newName": "matching value"')
    click(button(root, 'Confirm transition'))
    await flush()

    expect(profileControl(root, 'newName').props.modelValue).toBe('matching value')
    expect(content(root)).toContain('already map to different property URIs in this crate and are not reinterpreted: oldOnly')
    expect(customRows(root)).toEqual(expect.arrayContaining([
      { key: 'https://example.test/terms/old-only', type: 'text', value: 'unmatched value' },
      { key: oldEntity, type: 'iri', value: 'https://orcid.org/0000-0001' },
    ]))
    expect(content(root)).toContain('Preserved as custom metadata in the replacement crate. Nothing was deleted.')

    click(button(root, 'Save changes'))
    await flush()
    const payload = replaceMetadataRoCrate.mock.calls[0][1] as { rocrate: unknown }
    const savedRoot = rootOf(payload.rocrate)
    expect(savedRoot).toMatchObject({
      newName: 'matching value',
      conformsTo: [{ '@id': profileReferenceIri(profiles.value[1]) }],
    })
    expect(savedRoot['https://example.test/terms/old-only']).toBe('unmatched value')
    expect(savedRoot[oldEntity]).toEqual({ '@id': 'https://orcid.org/0000-0001' })
    expect(savedRoot).not.toHaveProperty('oldName')
    expect(savedRoot).not.toHaveProperty('oldOnly')
    expect(savedRoot).not.toHaveProperty('oldEntity')
  })

  it('uses Escape close to dismiss the profile-transition preview first', async () => {
    profiles.value = [
      profile('old', [profileRule('oldName', 'https://example.test/terms/name')]),
      profile('new', [profileRule('newName', 'https://example.test/terms/name')]),
    ]
    const root = await mountDialog(crate(profiles.value[0].profileUri!, { oldName: 'Draft value' }))

    selectProfile(root, 'new')
    await flush()
    expect(content(root)).toContain('Confirm Dataset profile transition')

    requestDialogClose(root)
    await flush()
    expect(content(root)).not.toContain('Confirm Dataset profile transition')
  })

  it('keeps profile-owned data as custom metadata when moving to no profile', async () => {
    profiles.value = [profile('old', [profileRule('oldName', 'https://example.test/terms/shared')])]
    const root = await mountDialog(crate(profiles.value[0].profileUri!, { oldName: 'keep without a profile' }))

    selectProfile(root, '__no_profile__')
    await flush()
    click(button(root, 'Confirm transition'))
    await flush()

    expect(customRows(root)).toContainEqual({ key: 'https://example.test/terms/shared', type: 'text', value: 'keep without a profile' })
    click(button(root, 'Save changes'))
    await flush()
    const payload = replaceMetadataRoCrate.mock.calls[0][1] as { rocrate: unknown }
    expect(rootOf(payload.rocrate)['https://example.test/terms/shared']).toBe('keep without a profile')
    expect(rootOf(payload.rocrate)).not.toHaveProperty('oldName')
    expect(rootOf(payload.rocrate)).not.toHaveProperty('conformsTo')
  })

  it('allows a published Dataset with a persistent identifier to transition', async () => {
    profiles.value = [
      profile('old', []),
      profile('new', []),
    ]
    const identifier = 'https://w3id.org/aruna/data/0123456789abcdef'
    const root = await mountDialog(crate(profiles.value[0].profileUri!, { identifier }), true)

    selectProfile(root, 'new')
    await flush()
    click(button(root, 'Confirm transition'))
    await flush()
    click(button(root, 'Save changes'))
    await flush()

    expect(replaceMetadataRoCrate).toHaveBeenCalledOnce()
    const payload = replaceMetadataRoCrate.mock.calls[0][1] as { rocrate: unknown; public: boolean }
    expect(payload.public).toBe(true)
    expect(rootOf(payload.rocrate).identifier).toBe(identifier)
    expect(rootOf(payload.rocrate).conformsTo).toEqual([{ '@id': profileReferenceIri(profiles.value[1]) }])
  })

  it('requires an external conformsTo reference to be removed before save', async () => {
    profiles.value = [profile('registered', [])]
    const external = 'https://external.example.test/profile/v1'
    const root = await mountDialog(crate(external, { customValue: 'preserved' }))

    expect(content(root)).toContain(external)
    expect(content(root)).toContain('cannot be written back')
    click(button(root, 'Save changes'))
    await flush()

    expect(replaceMetadataRoCrate).not.toHaveBeenCalled()
    expect(content(root)).toContain('Remove the external conformsTo reference before saving')

    selectProfile(root, '__no_profile__')
    await flush()
    click(button(root, 'Confirm transition'))
    await flush()
    click(button(root, 'Save changes'))
    await flush()

    expect(replaceMetadataRoCrate).toHaveBeenCalledOnce()
    const payload = replaceMetadataRoCrate.mock.calls[0][1] as { rocrate: unknown }
    expect(rootOf(payload.rocrate).customValue).toBe('preserved')
    expect(rootOf(payload.rocrate)).not.toHaveProperty('conformsTo')
  })

  it('renders structured 400 findings and saves the same metadata without the Profile tag', async () => {
    profiles.value = [profile('registered', [])]
    replaceMetadataRoCrate.mockRejectedValueOnce(new Api.ApiError(400, 'Profile validation failed', 'constraint_violation', {
      findings: [{
        code: 'constraint_violation',
        severity: 'violation',
        focus_node: './',
        path: 'http://schema.org/name',
        rule: 'sh:minCount',
        message: 'A name is required by this Profile.',
        profile_revision: 'revision-1',
        completeness: 'complete',
      }],
    }))
    const root = await mountDialog(crate(profiles.value[0].profileUri!))

    click(button(root, 'Save changes'))
    await flush()

    expect(content(root)).toContain('Profiled write rejected')
    expect(content(root)).toContain('violation')
    expect(content(root)).toContain('A name is required by this Profile.')
    expect(content(root)).toContain('Focus node: ./')
    expect(content(root)).toContain('Path: http://schema.org/name')

    replaceMetadataRoCrate.mockResolvedValueOnce({ document_id: 'dataset-1' })
    click(button(root, 'Remove Profile tag and save unprofiled'))
    await flush()

    const retry = replaceMetadataRoCrate.mock.calls[1][1] as { rocrate: unknown }
    expect(rootOf(retry.rocrate)).not.toHaveProperty('conformsTo')
  })

  it('presents a 503 as fail-closed with Retry', async () => {
    profiles.value = [profile('registered', [])]
    replaceMetadataRoCrate.mockRejectedValueOnce(new Api.ApiError(503, 'Service unavailable', 'validator_unavailable', {
      findings: [{
        code: 'validator_unavailable',
        severity: 'violation',
        focus_node: null,
        path: 'http://purl.org/dc/terms/conformsTo',
        rule: 'validator_unavailable',
        message: 'The Profile evaluator is unavailable.',
        profile_revision: 'revision-1',
        completeness: 'incomplete',
      }],
    }))
    const root = await mountDialog(crate(profiles.value[0].profileUri!))

    click(button(root, 'Save changes'))
    await flush()

    expect(content(root)).toContain('Validation fails closed, so nothing was saved.')
    expect(content(root)).toContain('Retry when it is available')
    expect(button(root, 'Retry')).toBeTruthy()
    expect(button(root, 'Remove Profile tag and save unprofiled')).toBeTruthy()
  })

  it('labels backend-supported constraints outside the browser lift as server validation required', async () => {
    const selected = profile('registered', [])
    selected.shapesText = '@prefix sh: <http://www.w3.org/ns/shacl#> . [] sh:closed true .'
    profiles.value = [selected]
    profileValidationCapabilities.value = {
      evaluator: 'test',
      supported_constraints: ['sh:closed'],
      unsupported_constraint_policy: 'fail_closed',
      public_profile_iri_template: 'https://w3id.org/aruna/profile/{id}',
      legacy_profile_iri_template: 'https://w3id.org/aruna/{id}',
    }
    const root = await mountDialog(crate(selected.profileUri!))

    expect(content(root)).toContain('Server validation required')
    expect(content(root)).toContain('sh:closed')
  })
})
