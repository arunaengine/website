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
import * as CrateImport from '@/lib/crateImport'
import * as CustomFields from '@/lib/customFields'
import * as DataEntities from '@/lib/dataEntities'
import * as Subcrates from '@/lib/subcrates'
import * as ProfileControls from '@/lib/profiles/controls'
import * as ProfileEmit from '@/lib/profiles/emit'
import * as EntityEntries from '@/lib/profiles/entityEntries'
import * as EntityTree from '@/lib/profiles/entityTree'
import * as ProfileMigration from '@/lib/profiles/migration'
import * as ProfileRoCrate from '@/lib/profiles/rocrate'
import * as ProfileCatalog from '@/lib/profiles/propertyCatalog'
import * as ProfileUri from '@/lib/profiles/uri'
import * as ProfileValidate from '@/lib/profiles/validate'
import * as ProfileTypes from '@/lib/profiles/types'
import * as RoCrateVersions from '@/lib/rocrateVersions'
import type { ProfilePropertyRule } from '@/lib/profiles/types'
import * as MapFindings from '@/lib/shacl/mapFindings'
import type { ShaclFinding } from '@/lib/shacl/findings'

const groups = ref([{ id: 'group-1', name: 'Research group' }])
const profiles = ref<MetadataProfile[]>([])
const metadata = ref([])
const saving = ref(false)
const currentUser = ref({
  id: 'user-1',
  name: 'Ada Lovelace',
  affiliation: '',
  orcid: '',
  preferredProfileId: '',
})
const apiBaseUrl = ref('https://api.example.test')
const profileCrateParses = ref({})
const profileValidationCapabilities = ref<Api.ProfileValidationCapabilitiesResponse | null>(null)
const createMetadata = vi.fn()
const loadProfileCrate = vi.fn()
const loadProfileValidationCapabilities = vi.fn()

const shaclFindings = ref<ShaclFinding[]>([])
const shaclRunning = ref(false)
const shaclUnavailable = ref(false)
const shaclError = ref<string | null>(null)
const shaclValidate = vi.fn()
const shaclValidateNow = vi.fn()
const shaclReset = vi.fn(() => {
  shaclFindings.value = []
  shaclRunning.value = false
  shaclError.value = null
})

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
  emits: ['update-ref'],
  setup(props, { emit }) {
    return () => h('entity-control', {
      property: (props.control as { property: string }).property,
      entries: props.entries,
      onSetRef: (index: number, value: string) => emit('update-ref', index, value),
    })
  },
})
const CustomFieldsStub = defineComponent({
  props: { rows: { type: Array, default: () => [] } },
  emits: ['update:rows'],
  setup(props) {
    return () => h('custom-fields', { rows: props.rows })
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
const DiscardStub = defineComponent({
  props: { open: Boolean },
  setup: (props) => () => props.open ? h('discard-confirm') : null,
})

const moduleDefault = (component: Component) => ({ __esModule: true, default: component })
const icons = new Proxy({}, { get: () => SlotStub })
const renderRuntime = new Proxy(VueRuntime, {
  get(target, property, receiver) {
    return property === 'Transition' ? SlotStub : Reflect.get(target, property, receiver)
  },
})

function compileDialog(): Component {
  const url = new URL('./NewDatasetDialog.vue', import.meta.url)
  const source = readFileSync(url, 'utf8')
  const { descriptor } = parse(source, { filename: url.pathname })
  if (!descriptor.template) throw new Error('NewDatasetDialog.vue has no template')
  const script = compileScript(descriptor, { id: url.pathname, inlineTemplate: false })
  const scriptJavascript = transpileModule(script.content, {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  }).outputText
  const modules: Record<string, unknown> = {
    vue: VueRuntime,
    '@lucide/vue': icons,
    '@/lib/shacl/lift': {
      cloneLiftNotes: (notes: Array<{ kind: string; message: string; scopes: string[] }>) =>
        notes.map((note) => ({ ...note, scopes: [...note.scopes] })),
    },
    '@/components/ui/Dialog.vue': moduleDefault(SlotStub),
    '@/components/ui/DialogContent.vue': moduleDefault(SlotStub),
    '@/components/ui/DialogHeader.vue': moduleDefault(SlotStub),
    '@/components/ui/DialogTitle.vue': moduleDefault(SlotStub),
    '@/components/ui/DialogDescription.vue': moduleDefault(SlotStub),
    '@/components/ui/DialogFooter.vue': moduleDefault(SlotStub),
    '@/components/ui/DialogClose.vue': moduleDefault(SlotStub),
    '@/components/ui/DiscardDraftConfirm.vue': moduleDefault(DiscardStub),
    '@/components/ui/Button.vue': moduleDefault(ButtonStub),
    '@/components/ui/Input.vue': moduleDefault(SlotStub),
    '@/components/ui/Textarea.vue': moduleDefault(SlotStub),
    '@/components/ui/Select.vue': moduleDefault(SelectStub),
    '@/components/ui/Switch.vue': moduleDefault(SlotStub),
    '@/components/ui/Skeleton.vue': moduleDefault(SlotStub),
    '@/components/ui/Tabs.vue': moduleDefault(SlotStub),
    '@/components/ui/TabsList.vue': moduleDefault(SlotStub),
    '@/components/ui/TabsTrigger.vue': moduleDefault(SlotStub),
    '@/components/groups/CreateGroupDialog.vue': moduleDefault(SlotStub),
    '@/components/metadata/DatasetFilesEditor.vue': moduleDefault(FilesEditorStub),
    '@/components/metadata/DatasetEntityInstances.vue': moduleDefault(EntityControlStub),
    '@/components/metadata/ProfileControlField.vue': moduleDefault(ProfileControlStub),
    '@/components/metadata/profile-builder/LiftNotesPanel.vue': moduleDefault(SlotStub),
    '@/components/metadata/CustomFieldsEditor.vue': moduleDefault(CustomFieldsStub),
    '@/components/metadata/SubcratePickerDialog.vue': moduleDefault(SlotStub),
    '@/composables/useAruna': {
      profileReferenceIri,
      profileRulesLoadState,
      serverValidationRequiredConstraints,
      useAruna: () => ({
        groups,
        profiles,
        metadata,
        createMetadata,
        loadProfileCrate,
        profileCrateParses,
        saving,
        currentUser,
        apiBaseUrl,
        profileValidationCapabilities,
        loadProfileValidationCapabilities,
      }),
    },
    '@/lib/api': Api,
    '@/lib/crateImport': CrateImport,
    '@/lib/dataEntities': DataEntities,
    '@/lib/contentIdentity': ContentIdentity,
    '@/lib/customFields': CustomFields,
    '@/lib/subcrates': Subcrates,
    '@/lib/profiles/controls': ProfileControls,
    '@/lib/profiles/emit': ProfileEmit,
    '@/lib/profiles/entityEntries': EntityEntries,
    '@/lib/profiles/entityTree': EntityTree,
    '@/lib/profiles/migration': ProfileMigration,
    '@/lib/profiles/rocrate': ProfileRoCrate,
    '@/lib/shacl/mapFindings': MapFindings,
    '@/lib/shacl/useShaclValidation': {
      useShaclValidation: () => ({
        findings: shaclFindings,
        running: shaclRunning,
        unavailable: shaclUnavailable,
        error: shaclError,
        validate: shaclValidate,
        validateNow: shaclValidateNow,
        reset: shaclReset,
      }),
    },
    '@/lib/profiles/propertyCatalog': ProfileCatalog,
    '@/lib/profiles/uri': ProfileUri,
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

const NewDatasetDialog = compileDialog()

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
  for (let index = 0; index < 5; index += 1) {
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
  return {
    id,
    name: `${id} profile`,
    shortName: id,
    description: '',
    domain: '',
    iconColor: '',
    entityRules: [],
    propertyRules,
    suggestedKeywords: [],
    managed: false,
  }
}

async function mountDialog(defaultProfileId = 'old'): Promise<HostNode> {
  const root = hostNode('root')
  const app = renderer.createApp(NewDatasetDialog, { open: true, defaultProfileId })
  app.mount(root)
  mountedApps.push(app)
  await flush()
  return root
}

function profileSelect(root: HostNode): HostNode {
  const select = nodes(root).find((node) =>
    node.tag === 'select'
      && Array.isArray(node.props.options)
      && (node.props.options as Array<{ value: string }>).some((option) => option.value === 'old'),
  )
  if (!select) throw new Error('Profile select not found')
  return select
}

function profileControl(root: HostNode, property: string): HostNode {
  const control = nodes(root).find((node) => node.tag === 'profile-control' && node.props.property === property)
  if (!control) throw new Error(`Profile control ${property} not found`)
  return control
}

function entityControl(root: HostNode, property: string): HostNode {
  const control = nodes(root).find((node) => node.tag === 'entity-control' && node.props.property === property)
  if (!control) throw new Error(`Entity control ${property} not found`)
  return control
}

function filesEditor(root: HostNode): HostNode {
  const editor = nodes(root).find((node) => node.tag === 'files-editor')
  if (!editor) throw new Error('Files editor not found')
  return editor
}

function setModel(root: HostNode, predicate: (node: HostNode) => boolean, value: string) {
  const node = nodes(root).find(predicate)
  if (!node) throw new Error('Model field not found')
  ;(node.props['onUpdate:modelValue'] as (next: string) => void)(value)
}

function button(root: HostNode, label: string): HostNode {
  const match = nodes(root).find((node) => node.tag === 'button' && content(node) === label)
  if (!match) throw new Error(`Button ${label} not found`)
  return match
}

function selectProfile(root: HostNode, id: string) {
  ;(profileSelect(root).props.onSelect as (value: string) => void)(id)
}

function click(node: HostNode) {
  ;(node.props.onClick as () => void)()
}

function fillRequiredCreateFields(root: HostNode) {
  setModel(root, (node) => node.props.placeholder === 'Dataset title', 'Profiled fixture')
  setModel(root, (node) => node.props.placeholder === 'datasets/my-dataset', 'datasets/profiled-fixture')
  setModel(root, (node) => String(node.props.rows) === '3', 'Profiled fixture description')
}

function storedProfile(): MetadataProfile {
  return {
    ...profile('registered', []),
    documentId: 'profile-document',
    graphIri: 'https://w3id.org/aruna/profile-document',
    profileUri: 'https://w3id.org/aruna/profile-document',
  }
}

function parsedStoredProfile() {
  return {
    name: 'registered profile',
    description: '',
    entityRules: [],
    datasetPropertyRules: [],
    contextTerms: {},
    liftNotes: [],
  }
}

beforeEach(() => {
  profiles.value = []
  metadata.value = []
  saving.value = false
  profileCrateParses.value = {}
  profileValidationCapabilities.value = null
  shaclFindings.value = []
  shaclRunning.value = false
  shaclUnavailable.value = false
  shaclError.value = null
  createMetadata.mockReset()
  loadProfileCrate.mockReset()
  loadProfileValidationCapabilities.mockReset()
  loadProfileValidationCapabilities.mockResolvedValue({
    evaluator: 'test',
    supported_constraints: [],
    unsupported_constraint_policy: 'fail_closed',
    public_profile_iri_template: 'https://w3id.org/aruna/profile/{id}',
    legacy_profile_iri_template: 'https://w3id.org/aruna/{id}',
  })
  shaclValidate.mockReset()
  shaclValidateNow.mockReset()
  shaclReset.mockClear()
})

afterEach(() => {
  for (const app of mountedApps.splice(0)) app.unmount()
})

describe('New Dataset profile switching', () => {
  it('authors a W3ID with contentUrl while preserving an external identity', async () => {
    createMetadata.mockResolvedValue({
      document_id: 'dataset-1',
      group_id: 'group-1',
      created_at: '2026-08-19T00:00:00Z',
      updated_at: '2026-08-19T00:00:00Z',
    })
    const root = await mountDialog('')
    setModel(root, (node) => node.props.placeholder === 'Dataset title', 'Identity fixture')
    setModel(root, (node) => node.props.placeholder === 'datasets/my-dataset', 'datasets/identity-fixture')
    setModel(root, (node) => String(node.props.rows) === '3', 'Fixture description')

    const location = 's3://raw-data/resolved.fastq.gz'
    const resolved = ContentIdentity.arunaContentReference(
      location,
      ContentIdentity.contentIdentityFromBlake3('ab'.repeat(32)),
    )
    const external = ContentIdentity.externalContentReference('https://example.org/external.fastq.gz')
    const clearResolved = ContentIdentity.stageSelectedContentReference(resolved)
    const clearExternal = ContentIdentity.stageSelectedContentReference(external)
    ;(filesEditor(root).props.onSet as (files: unknown[]) => void)([
      { id: resolved.id, name: 'Resolved reads', types: ['File'] },
      { id: external.id, name: 'External reads', types: ['File'] },
    ])
    clearResolved()
    clearExternal()
    await flush()

    click(button(root, 'Create metadata'))
    await flush()

    const payload = createMetadata.mock.calls[0][0] as { rocrate: { '@graph': Array<Record<string, unknown>> } }
    const dataset = payload.rocrate['@graph'].find((entity) => entity['@id'] === './')
    expect(dataset?.hasPart).toEqual([{ '@id': resolved.id }, { '@id': external.id }])
    expect(payload.rocrate['@graph'].find((entity) => entity['@id'] === resolved.id)).toMatchObject({
      '@id': resolved.id,
      contentUrl: location,
    })
    expect(payload.rocrate['@graph'].find((entity) => entity['@id'] === external.id)).toMatchObject({
      '@id': external.id,
    })
  })

  it('shows the location-identity marker for an unresolved node pick', async () => {
    const root = await mountDialog()
    const location = 's3://raw-data/unresolved.fastq.gz'
    const clear = ContentIdentity.stageSelectedContentReference({
      id: location,
      identity: 'location',
    })
    ;(filesEditor(root).props.onSet as (files: unknown[]) => void)([
      { id: location, name: 'unresolved.fastq.gz', types: ['File'] },
    ])
    clear()
    await flush()

    expect(content(root)).toContain('Location identity')
    expect(content(root)).toContain(location)
  })

  it('migrates a populated matching field by property URI', async () => {
    const uri = 'https://example.test/terms/shared'
    profiles.value = [
      profile('old', [profileRule('oldName', uri)]),
      profile('new', [profileRule('newName', uri)]),
    ]
    const root = await mountDialog()

    ;(profileControl(root, 'oldName').props.onSet as (value: unknown) => void)('kept value')
    await flush()
    selectProfile(root, 'new')
    await flush()

    expect(content(root)).toContain('Moves into the new newName control because the property URI matches.')
    click(button(root, 'Switch and migrate'))
    await flush()

    expect(profileControl(root, 'newName').props.modelValue).toBe('kept value')
    const rows = nodes(root).find((node) => node.tag === 'custom-fields')?.props.rows as CustomFields.CustomFieldRow[]
    expect(rows).toEqual([])
  })

  it('preserves unmatched generated and entity values as custom metadata', async () => {
    const scalarUri = 'https://example.test/terms/old-scalar'
    const entityUri = 'https://example.test/terms/old-entity'
    profiles.value = [
      profile('old', [
        profileRule('oldScalar', scalarUri),
        profileRule('oldEntity', entityUri, {
          kind: 'entity',
          entityTypes: ['http://schema.org/Person'],
          entitySources: ['existing-external'],
        }),
      ]),
      profile('new', [profileRule('newOnly', 'https://example.test/terms/new-only')]),
    ]
    const root = await mountDialog()

    ;(profileControl(root, 'oldScalar').props.onSet as (value: unknown) => void)('unmatched value')
    ;(entityControl(root, 'oldEntity').props.onSetRef as (index: number, value: string) => void)(0, 'https://orcid.org/0000-0001')
    await flush()
    selectProfile(root, 'new')
    await flush()

    expect(content(root)).toContain('Preserved in Additional fields for review. Nothing is cleared.')
    click(button(root, 'Switch and migrate'))
    await flush()

    const rows = nodes(root).find((node) => node.tag === 'custom-fields')?.props.rows as CustomFields.CustomFieldRow[]
    expect(rows).toEqual(expect.arrayContaining([
      { key: scalarUri, type: 'text', value: 'unmatched value' },
      { key: entityUri, type: 'iri', value: 'https://orcid.org/0000-0001' },
    ]))
    expect(content(root)).toContain('2 unmatched fields are preserved in Additional fields below for review.')
  })

  it('switches an untouched draft without confirmation', async () => {
    profiles.value = [
      profile('old', [profileRule('oldName', 'https://example.test/terms/old')]),
      profile('new', [profileRule('newName', 'https://example.test/terms/new')]),
    ]
    const root = await mountDialog()

    selectProfile(root, 'new')
    await flush()

    expect(content(root)).not.toContain('Switch profile and migrate this draft?')
    expect(profileControl(root, 'newName')).toBeTruthy()
  })

  it('invalidates pending SHACL validation and findings on switch', async () => {
    profiles.value = [profile('old', []), profile('new', [])]
    const root = await mountDialog()
    shaclRunning.value = true
    shaclFindings.value = [{
      focusId: './',
      message: 'Old profile finding',
      severity: 'warning',
      sourceShape: 'https://example.test/old-shape',
    }]
    shaclReset.mockClear()

    selectProfile(root, 'new')
    await flush()

    expect(shaclReset).toHaveBeenCalled()
    expect(shaclRunning.value).toBe(false)
    expect(shaclFindings.value).toEqual([])
    expect(content(root)).not.toContain('Switch profile and migrate this draft?')
  })

  it('emits the stable public Profile w3id for a stored profile', async () => {
    profiles.value = [storedProfile()]
    loadProfileCrate.mockResolvedValue(parsedStoredProfile())
    createMetadata.mockResolvedValue({
      document_id: 'dataset-1',
      group_id: 'group-1',
      created_at: '2026-08-19T00:00:00Z',
      updated_at: '2026-08-19T00:00:00Z',
    })
    const root = await mountDialog('registered')
    fillRequiredCreateFields(root)

    click(button(root, 'Create metadata'))
    await flush()

    const payload = createMetadata.mock.calls[0][0] as { rocrate: { '@graph': Array<Record<string, unknown>> } }
    const dataset = payload.rocrate['@graph'].find((entity) => entity['@id'] === './')
    expect(dataset?.conformsTo).toEqual([{ '@id': 'https://w3id.org/aruna/profile/profile-document' }])
  })

  it('renders structured server findings and can save the rejected crate unprofiled', async () => {
    profiles.value = [storedProfile()]
    loadProfileCrate.mockResolvedValue(parsedStoredProfile())
    createMetadata.mockRejectedValueOnce(new Api.ApiError(400, 'Profile validation failed', 'constraint_violation', {
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
    const root = await mountDialog('registered')
    fillRequiredCreateFields(root)

    click(button(root, 'Create metadata'))
    await flush()

    expect(content(root)).toContain('Profiled write rejected')
    expect(content(root)).toContain('violation')
    expect(content(root)).toContain('A name is required by this Profile.')
    expect(content(root)).toContain('Focus node: ./')
    expect(content(root)).toContain('Path: http://schema.org/name')
    expect(content(root)).toContain('Fix the metadata and retry')

    createMetadata.mockResolvedValueOnce({
      document_id: 'dataset-unprofiled',
      group_id: 'group-1',
      created_at: '2026-08-19T00:00:00Z',
      updated_at: '2026-08-19T00:00:00Z',
    })
    click(button(root, 'Remove Profile tag and save unprofiled'))
    await flush()

    const retry = createMetadata.mock.calls[1][0] as { rocrate: { '@graph': Array<Record<string, unknown>> } }
    expect(retry.rocrate['@graph'].find((entity) => entity['@id'] === './')).not.toHaveProperty('conformsTo')
  })

  it('presents a 503 as fail-closed with Retry', async () => {
    profiles.value = [storedProfile()]
    loadProfileCrate.mockResolvedValue(parsedStoredProfile())
    createMetadata.mockRejectedValueOnce(new Api.ApiError(503, 'Service unavailable', 'profile_unavailable', {
      findings: [{
        code: 'profile_unavailable',
        severity: 'violation',
        focus_node: null,
        path: 'http://purl.org/dc/terms/conformsTo',
        rule: 'profile_unavailable',
        message: 'The registered Profile is temporarily unavailable.',
        profile_revision: null,
        completeness: 'incomplete',
      }],
    }))
    const root = await mountDialog('registered')
    fillRequiredCreateFields(root)

    click(button(root, 'Create metadata'))
    await flush()

    expect(content(root)).toContain('Validation fails closed, so nothing was saved.')
    expect(content(root)).toContain('Retry when it is available')
    expect(button(root, 'Retry')).toBeTruthy()
    expect(button(root, 'Remove Profile tag and save unprofiled')).toBeTruthy()
  })
})
