import { readFileSync } from 'node:fs'
import { compile } from '@vue/compiler-dom'
import { compileScript, parse } from '@vue/compiler-sfc'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import * as VueRuntime from 'vue'
import { createRenderer, defineComponent, h, nextTick, ref, type App, type Component } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { profileRulesLoadState } from '@/composables/useAruna'
import type { MetadataProfile } from '@/data/types'
import * as CrateImport from '@/lib/crateImport'
import * as CustomFields from '@/lib/customFields'
import * as Subcrates from '@/lib/subcrates'
import * as ProfileControls from '@/lib/profiles/controls'
import * as ProfileEmit from '@/lib/profiles/emit'
import * as EntityEntries from '@/lib/profiles/entityEntries'
import * as EntityTree from '@/lib/profiles/entityTree'
import * as ProfileRoCrate from '@/lib/profiles/rocrate'
import * as ProfileCatalog from '@/lib/profiles/propertyCatalog'
import * as ProfileUri from '@/lib/profiles/uri'
import * as ProfileValidate from '@/lib/profiles/validate'
import * as ProfileTypes from '@/lib/profiles/types'
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
const createMetadata = vi.fn()
const loadProfileCrate = vi.fn()

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
    '@/components/metadata/DatasetFilesEditor.vue': moduleDefault(SlotStub),
    '@/components/metadata/DatasetEntityInstances.vue': moduleDefault(EntityControlStub),
    '@/components/metadata/ProfileControlField.vue': moduleDefault(ProfileControlStub),
    '@/components/metadata/profile-builder/LiftNotesPanel.vue': moduleDefault(SlotStub),
    '@/components/metadata/CustomFieldsEditor.vue': moduleDefault(CustomFieldsStub),
    '@/components/metadata/SubcratePickerDialog.vue': moduleDefault(SlotStub),
    '@/composables/useAruna': {
      profileRulesLoadState,
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
      }),
    },
    '@/lib/crateImport': CrateImport,
    '@/lib/customFields': CustomFields,
    '@/lib/subcrates': Subcrates,
    '@/lib/profiles/controls': ProfileControls,
    '@/lib/profiles/emit': ProfileEmit,
    '@/lib/profiles/entityEntries': EntityEntries,
    '@/lib/profiles/entityTree': EntityTree,
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

async function mountDialog(): Promise<HostNode> {
  const root = hostNode('root')
  const app = renderer.createApp(NewDatasetDialog, { open: true, defaultProfileId: 'old' })
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

beforeEach(() => {
  profiles.value = []
  metadata.value = []
  saving.value = false
  profileCrateParses.value = {}
  shaclFindings.value = []
  shaclRunning.value = false
  shaclUnavailable.value = false
  shaclError.value = null
  createMetadata.mockReset()
  loadProfileCrate.mockReset()
  shaclValidate.mockReset()
  shaclValidateNow.mockReset()
  shaclReset.mockClear()
})

afterEach(() => {
  for (const app of mountedApps.splice(0)) app.unmount()
})

describe('New Dataset profile switching', () => {
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
})
