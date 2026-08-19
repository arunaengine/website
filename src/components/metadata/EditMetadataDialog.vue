<script setup lang="ts">
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Switch from '@/components/ui/Switch.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import Select from '@/components/ui/Select.vue'
import DatasetFilesEditor from '@/components/metadata/DatasetFilesEditor.vue'
import DatasetEntityInstances from '@/components/metadata/DatasetEntityInstances.vue'
import ProfileControlField from '@/components/metadata/ProfileControlField.vue'
import LiftNotesPanel from '@/components/metadata/profile-builder/LiftNotesPanel.vue'
import CustomFieldsEditor from '@/components/metadata/CustomFieldsEditor.vue'
import SubcratePickerDialog from '@/components/metadata/SubcratePickerDialog.vue'
import { AlertTriangle, Layers, Pencil, Plus, X } from '@lucide/vue'
import { computed, ref, shallowRef, watch } from 'vue'
import {
  profileReferenceIri,
  profileRulesLoadState,
  serverValidationRequiredConstraints,
  useAruna,
} from '@/composables/useAruna'
import {
  ApiError,
  profileValidationFindings,
  type MetadataDocumentListItem,
  type MetadataDocumentSummary,
  type ProfileValidationFinding,
} from '@/lib/api'
import { takeSelectedContentReference } from '@/lib/contentIdentity'
import { applyDataEntities, dataEntityTreeOf, type DataEntity } from '@/lib/dataEntities'
import { addSubcrateLink, removeSubcrateLink, subcrateLinksOf, type SubcrateLink } from '@/lib/subcrates'
import { documentIdFromIri } from '@/lib/graphIri'
import { groupCustomFieldRows, seedCustomFieldRows, type CustomFieldRow, type PreservedFieldRow } from '@/lib/customFields'
import { controlsFromRules, defaultControlValues, normalizeProfileValues } from '@/lib/profiles/controls'
import { emitEntityEntries, emitSelectObject, isHasPartUri } from '@/lib/profiles/emit'
import type { EntityEntry } from '@/lib/profiles/entityEntries'
import {
  entityTypeLabelFor,
  newEntityEntry,
  newRefEntry,
  seedEntries,
  subControlsFor,
} from '@/lib/profiles/entityTree'
import {
  cloneDraftValue,
  draftValuePopulated,
  migrationTarget,
  type ProfileDraftItem,
} from '@/lib/profiles/migration'
import { licenseEntity } from '@/lib/profiles/rocrate'
import { isAbsoluteUri, sameSchemaOrgType } from '@/lib/profiles/uri'
import { cloneLiftNotes, type LiftNote } from '@/lib/shacl/lift'
import { validateProfileData } from '@/lib/profiles/validate'
import { classifyRoCrateSpecIri } from '@/lib/rocrateVersions'
import {
  DX_PROFILE,
  type JsonSchema,
  type ProfileControl,
  type ProfileEntityRule,
  type ProfilePropertyRule,
} from '@/lib/profiles/types'
import type { MetadataProfile } from '@/data/types'

const NO_PROFILE_VALUE = '__no_profile__'
const EXTERNAL_PROFILE_VALUE = '__external_profile__'

interface LoadedProfileDefinition {
  profile: MetadataProfile
  entityRules: ProfileEntityRule[]
  propertyRules: ProfilePropertyRule[]
  schema?: JsonSchema
  contextTerms: Record<string, string>
  additionalRequirements: LiftNote[]
  shapes: string[]
  complete: boolean
}

interface ExistingProfileItem extends ProfileDraftItem {
  rawValue: unknown
}

interface ProfileTransitionReviewItem {
  label: string
  propertyUri: string
  valuePreview: string
  targetLabel?: string
}

const props = defineProps<{
  open: boolean
  documentId: string
  // The document's resolved profile, when one exists — drives the (non-blocking)
  // validation panel in the Fields tab.
  profile?: MetadataProfile | null
}>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'saved', summary: MetadataDocumentSummary): void
}>()

const {
  saving,
  fetchRoCrateRaw,
  getMetadataDocument,
  getMetadataItem,
  replaceMetadataRoCrate,
  toMetadataDoc,
  metadataItems,
  apiBaseUrl,
  profiles,
  loadProfileCrate,
  profileValidationCapabilities,
  loadProfileValidationCapabilities,
} = useAruna()

const loading = ref(false)
const loadError = ref<string | null>(null)
const saveError = ref<string | null>(null)
const serverFindings = ref<ProfileValidationFinding[]>([])
const profiledWriteUnavailable = ref(false)
const profiledWriteRejected = ref(false)
const rawError = ref<string | null>(null)
const activeTab = ref<'fields' | 'files' | 'raw'>('fields')

// The pristine, unresolved crate fetched from the backend; edits mutate a clone.
// Shallow: structuredClone in buildFromFields rejects reactive proxies.
const pristine = shallowRef<unknown>(null)
const rawText = ref('')
const loadedDocumentId = ref<string | null>(null)
let loadToken = 0

const name = ref('')
const description = ref('')
const keywordsText = ref('')
const datePublished = ref('')
const license = ref('')
// Preserve the license shape: a plain string stays a string, an object/absent
// value is written as { "@id": … } plus a contextual CreativeWork entity.
const licenseWasString = ref(false)
const isPublic = ref(false)

const activeProfileValue = ref(NO_PROFILE_VALUE)
const profileDefinition = shallowRef<LoadedProfileDefinition | null>(null)
const profileControls = ref<ProfileControl[]>([])
const profileEntityRules = ref<ProfileEntityRule[]>([])
const profileContextTerms = ref<Record<string, string>>({})
const profileAdditionalRequirements = ref<LiftNote[]>([])
const profileShapes = ref<string[]>([])
const serverRequiredConstraints = computed(() =>
  serverValidationRequiredConstraints(profileShapes.value, profileValidationCapabilities.value),
)
const profileContextConflicts = ref<string[]>([])
const generatedValues = ref<Record<string, unknown>>({})
const entityEntries = ref<Record<string, EntityEntry[]>>({})
const editableProfileKeys = ref<Set<string>>(new Set())
const profileLoading = ref(false)
const profileLoadFailed = ref(false)
const profileLoadError = ref<string | null>(null)
const profileTransitionApplied = ref(false)
const externalProfileReferences = ref<string[]>([])
const transitionReview = ref<ProfileTransitionReviewItem[]>([])
const transitionMigratedCount = ref(0)

const profileSwitchOpen = ref(false)
const profileSwitchLoading = ref(false)
const profileSwitchError = ref<string | null>(null)
const pendingProfileValue = ref<string | null>(null)
const pendingProfileDefinition = shallowRef<LoadedProfileDefinition | null>(null)
const pendingBaseCrate = shallowRef<unknown>(null)
const pendingItems = ref<ExistingProfileItem[]>([])
let profileSwitchToken = 0

// Additional typed root properties beyond the managed built-ins. Scalars,
// {"@id"} references and arrays of those seed as editable rows; deeper
// structured values are listed read-only and stay untouched in the crate
// (edit them via the Raw JSON tab).
const MANAGED_KEYS = new Set([
  '@id', '@type', '@context', 'name', 'description', 'keywords', 'datePublished',
  'license', 'hasPart', 'author', 'creator', 'contributor', 'conformsTo',
  'mentions', 'about', 'identifier',
])
const customFields = ref<CustomFieldRow[]>([])
const preservedFields = ref<PreservedFieldRow[]>([])
let seededCustomKeys: string[] = []
const PROFILE_INDEPENDENT_KEYS = new Set(['name', 'description', 'datePublished', 'license'])
const PROFILE_RESERVED_KEYS = new Set(['@id', '@type', 'conformsTo'])

const availableProfiles = computed(() => {
  const values = [...profiles.value]
  if (props.profile && !values.some((profile) => profile.id === props.profile?.id)) values.push(props.profile)
  return values
})
const selectedProfile = computed(() =>
  availableProfiles.value.find((profile) => profile.id === activeProfileValue.value),
)
const pendingProfile = computed(() =>
  availableProfiles.value.find((profile) => profile.id === pendingProfileValue.value),
)
const profileOptions = computed(() => [
  ...(activeProfileValue.value === EXTERNAL_PROFILE_VALUE
    ? [{ value: EXTERNAL_PROFILE_VALUE, label: 'Current: External profile reference' }]
    : []),
  {
    value: NO_PROFILE_VALUE,
    label: activeProfileValue.value === NO_PROFILE_VALUE
      ? 'Current: No profile reference'
      : 'No profile reference',
  },
  ...availableProfiles.value.map((profile) => ({
    value: profile.id,
    label: profile.id === activeProfileValue.value
      ? `Current: ${profile.name}`
      : `New: ${profile.name}`,
  })),
])
const profileSelection = computed({
  get: () => activeProfileValue.value,
  set: (next: string) => {
    void requestProfileSwitch(next)
  },
})
const profileHasPartProperties = computed(() => new Set(
  (profileDefinition.value?.propertyRules ?? [])
    .filter((rule) => isHasPartUri(rule.propertyUri))
    .map((rule) => rule.valueName),
))
const profileValueNames = computed(() => new Set(profileControls.value.map((control) => control.property)))
const showKeywordsScaffold = computed(() => !profileValueNames.value.has('keywords'))
const generatedScalarControls = computed(() =>
  profileControls.value.filter(
    (control) =>
      control.control !== 'entity'
      && !PROFILE_INDEPENDENT_KEYS.has(control.property)
      && !profileHasPartProperties.value.has(control.property),
  ),
)
const entityControls = computed(() =>
  profileControls.value.filter(
    (control) =>
      control.control === 'entity'
      && !PROFILE_INDEPENDENT_KEYS.has(control.property)
      && !profileHasPartProperties.value.has(control.property),
  ),
)
const entitySubControls = computed<Record<string, ProfileControl[]>>(() =>
  Object.fromEntries(entityControls.value.map((control) => [
    control.property,
    subControlsFor(control, profileEntityRules.value),
  ])),
)
const profileHasRules = computed(() => Boolean(
  profileDefinition.value?.entityRules.length
    || profileDefinition.value?.propertyRules.length
    || profileDefinition.value?.schema
    || profileDefinition.value?.additionalRequirements.length,
))
const profileRuleState = computed(() => profileRulesLoadState({
  loading: profileLoading.value,
  unavailable: profileLoadFailed.value,
  complete: Boolean(profileDefinition.value?.complete),
  hasRules: profileHasRules.value,
}))
const pendingControls = computed(() => controlsFromRules(
  pendingProfileDefinition.value?.propertyRules ?? [],
  pendingProfileDefinition.value?.entityRules ?? [],
))
const pendingPreview = computed(() => pendingItems.value.map((item) => ({
  item,
  target: migrationTarget(item, pendingProfileDefinition.value?.propertyRules ?? [], pendingControls.value),
})))
const pendingReplacementCrate = computed(() => {
  if (!pendingBaseCrate.value || pendingProfileValue.value === null || profileSwitchLoading.value || profileSwitchError.value) return null
  return buildTransitionCrate(
    pendingBaseCrate.value,
    pendingProfileValue.value,
    pendingProfileDefinition.value,
    pendingItems.value,
  )
})
const pendingReplacementText = computed(() =>
  pendingReplacementCrate.value ? JSON.stringify(pendingReplacementCrate.value, null, 2) : '',
)

// Subcrate links (RO-Crate 1.2), editable as a list: unlink drops the link,
// the picker adds new ones; the save composes them via the subcrates helpers.
const subcrates = ref<SubcrateLink[]>([])
const subcratePickerOpen = ref(false)

// The spec's subjectOf fallback needs a URL that resolves to the child's crate
// JSON; the portal serves it at GET /metadata/{id}/rocrate.
function crateJsonUrl(documentId: string): string {
  return `${apiBaseUrl.value.replace(/\/+$/, '')}/metadata/${encodeURIComponent(documentId)}/rocrate`
}

function subcrateTitleOf(item: MetadataDocumentListItem): string {
  return toMetadataDoc(item).title
}

function onSubcratesPicked(items: MetadataDocumentListItem[]) {
  const linked = new Set(subcrates.value.map((link) => link.iri))
  for (const item of items) {
    if (!item.graph_iri || linked.has(item.graph_iri)) continue
    subcrates.value.push({
      iri: item.graph_iri,
      name: subcrateTitleOf(item),
      identifier: item.document_id,
      subjectOf: crateJsonUrl(item.document_id),
    })
  }
  subcratePickerOpen.value = false
}

function removeSubcrate(iri: string) {
  subcrates.value = subcrates.value.filter((link) => link.iri !== iri)
}

// Cross-document references: root `mentions` entries whose @id matches a
// catalog document's graph IRI are editable here; anything else in `mentions`
// is preserved verbatim.
const relatedIds = ref<string[]>([])
let preservedMentions: unknown[] = []
const relatedPick = ref('')

// The dataset's data entities, seeded from the crate and written back through
// buildFromFields so file edits ride the same parsed-crate path as the fields.
const fileRows = ref<DataEntity[]>([])
const locationIdentityIds = ref<Set<string>>(new Set())
const files = computed<DataEntity[]>({
  get: () => fileRows.value,
  set: (next) => {
    const previous = new Map(fileRows.value.map((file) => [file.id, file]))
    const fallbackIds = new Set([...locationIdentityIds.value].filter((id) => next.some((file) => file.id === id)))
    fileRows.value = next.map((file) => {
      const existing = previous.get(file.id)
      if (existing) return { ...file, contentUrl: file.contentUrl ?? existing.contentUrl }
      const selected = takeSelectedContentReference(file.id)
      if (selected?.identity === 'location') fallbackIds.add(file.id)
      return { ...file, contentUrl: selected?.contentUrl }
    })
    locationIdentityIds.value = fallbackIds
  },
})
const locationIdentityFiles = computed(() => fileRows.value.filter((file) => locationIdentityIds.value.has(file.id)))
const crateOptions = computed(() => files.value.map((file) => ({ value: file.id, label: file.name || file.id })))

watch(
  [() => props.open, () => props.documentId],
  ([open]) => {
    ++loadToken
    ++profileSwitchToken
    loadedDocumentId.value = null
    pristine.value = null
    profileSwitchOpen.value = false
    profileSwitchLoading.value = false
    profileSwitchError.value = null
    pendingProfileValue.value = null
    pendingProfileDefinition.value = null
    pendingBaseCrate.value = null
    pendingItems.value = []
    profileTransitionApplied.value = false
    transitionReview.value = []
    transitionMigratedCount.value = 0
    if (!open) {
      loading.value = false
      return
    }
    activeTab.value = 'fields'
    clearProfileWriteFailure()
    rawError.value = null
    void loadProfileValidationCapabilities().catch(() => undefined)
    void load(props.documentId, loadToken)
  },
)

function reload() {
  const token = ++loadToken
  loadedDocumentId.value = null
  pristine.value = null
  void load(props.documentId, token)
}

async function load(documentId: string, token: number) {
  loading.value = true
  loadError.value = null
  try {
    const [crate, summary] = await Promise.all([
      fetchRoCrateRaw(documentId),
      getMetadataDocument(documentId),
    ])
    if (token !== loadToken || !props.open || documentId !== props.documentId) return
    pristine.value = crate
    loadedDocumentId.value = documentId
    isPublic.value = summary.public
    seedFields(crate)
    rawText.value = JSON.stringify(crate, null, 2)
    await initializeProfile(crate, token)
  } catch (err) {
    if (token === loadToken) loadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (token === loadToken) loading.value = false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function graphOf(crate: unknown): Array<Record<string, unknown>> {
  if (!isRecord(crate)) return []
  const g = crate['@graph']
  return Array.isArray(g) ? g.filter(isRecord) : []
}

// The root dataset is the entity referenced by the ro-crate-metadata.json
// descriptor's `about`, falling back to the first non-descriptor entity.
function rootDatasetId(crate: unknown): string | undefined {
  const g = graphOf(crate)
  const descriptor = g.find((e) => e['@id'] === 'ro-crate-metadata.json')
  if (descriptor && isRecord(descriptor.about)) {
    const id = descriptor.about['@id']
    if (typeof id === 'string') return id
  }
  return g.find((e) => e['@id'] !== 'ro-crate-metadata.json')?.['@id'] as string | undefined
}

function findRoot(crate: unknown): Record<string, unknown> | undefined {
  const g = graphOf(crate)
  const id = rootDatasetId(crate)
  const byId = id ? g.find((e) => e['@id'] === id) : undefined
  return byId ?? g.find((e) => e['@id'] !== 'ro-crate-metadata.json')
}

function stringField(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return stringField(value[0])
  return ''
}

function arrayField(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(stringField).filter(Boolean)
  const single = stringField(value)
  return single ? [single] : []
}

function licenseIri(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return licenseIri(value[0])
  if (isRecord(value)) return typeof value['@id'] === 'string' ? value['@id'] : ''
  return ''
}

function refIdOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (isRecord(value) && typeof value['@id'] === 'string') return value['@id']
  return undefined
}

function referenceIdsOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(referenceIdsOf)
  const id = refIdOf(value)
  return id ? [id] : []
}

function profileReferencesOf(crate: unknown): string[] {
  const root = findRoot(crate)
  return [...new Set(referenceIdsOf(root?.conformsTo))]
    .filter((iri) => classifyRoCrateSpecIri(iri).kind === 'non-spec')
}

function profileForReference(iri: string): MetadataProfile | undefined {
  return availableProfiles.value.find(
    (profile) => profileReferenceIri(profile) === iri || profile.profileUri === iri || profile.graphIri === iri,
  )
}

function summaryProfileDefinition(profile: MetadataProfile): LoadedProfileDefinition {
  return {
    profile,
    entityRules: cloneDraftValue(profile.entityRules),
    propertyRules: cloneDraftValue(profile.propertyRules),
    schema: profile.schema ? cloneDraftValue(profile.schema) : undefined,
    contextTerms: { ...(profile.contextTerms ?? {}) },
    additionalRequirements: [],
    shapes: [profile.shapesText, profile.customShapesText].filter((value): value is string => Boolean(value?.trim())),
    complete: !profile.documentId,
  }
}

async function fullProfileDefinition(profile: MetadataProfile, force = false): Promise<LoadedProfileDefinition> {
  const fallback = summaryProfileDefinition(profile)
  if (!profile.documentId) return fallback
  const parsed = await loadProfileCrate(profile.documentId, { force })
  return {
    profile,
    entityRules: cloneDraftValue(parsed.entityRules),
    propertyRules: cloneDraftValue(parsed.datasetPropertyRules),
    schema: parsed.schema ? cloneDraftValue(parsed.schema) : undefined,
    contextTerms: { ...(parsed.contextTerms ?? {}) },
    additionalRequirements: cloneLiftNotes(parsed.liftNotes),
    shapes: [parsed.shapesText, parsed.customShapesText].filter((value): value is string => Boolean(value?.trim())),
    complete: true,
  }
}

async function initializeProfile(crate: unknown, token: number) {
  const references = profileReferencesOf(crate)
  externalProfileReferences.value = references.filter((iri) => !profileForReference(iri))
  const matched = references.length === 1 ? profileForReference(references[0]) : undefined
  if (externalProfileReferences.value.length || references.length > 1) {
    activeProfileValue.value = EXTERNAL_PROFILE_VALUE
    clearProfileDefinition(crate)
    return
  }
  if (!matched) {
    activeProfileValue.value = NO_PROFILE_VALUE
    clearProfileDefinition(crate)
    return
  }

  activeProfileValue.value = matched.id
  const fallback = summaryProfileDefinition(matched)
  applyProfileDefinition(fallback, crate)
  if (!matched.documentId) return

  profileLoading.value = true
  profileLoadFailed.value = false
  profileLoadError.value = null
  try {
    const loaded = await fullProfileDefinition(matched)
    if (token !== loadToken || !props.open) return
    applyProfileDefinition(loaded, crate)
  } catch (err) {
    if (token !== loadToken) return
    profileLoadFailed.value = true
    profileLoadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (token === loadToken) profileLoading.value = false
  }
}

function clearProfileDefinition(crate: unknown) {
  profileDefinition.value = null
  profileControls.value = []
  profileEntityRules.value = []
  profileContextTerms.value = {}
  profileAdditionalRequirements.value = []
  profileShapes.value = []
  profileContextConflicts.value = []
  generatedValues.value = {}
  entityEntries.value = {}
  editableProfileKeys.value = new Set()
  profileLoading.value = false
  profileLoadFailed.value = false
  profileLoadError.value = null
  seedAdditionalFields(findRoot(crate))
}

function profileInputValue(value: unknown, control: ProfileControl): { value: unknown; representable: boolean } {
  if (control.control === 'select-object') {
    const ids = referenceIdsOf(value)
    return {
      value: control.multiple ? ids : ids[0] ?? '',
      representable: Boolean(ids.length) && (control.multiple || ids.length === 1),
    }
  }
  const entries = Array.isArray(value) ? value : [value]
  const scalar = entries.map((entry) => {
    if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') return entry
    if (isRecord(entry) && typeof entry['@id'] === 'string' && Object.keys(entry).length === 1) return entry['@id']
    return undefined
  })
  if (scalar.some((entry) => entry === undefined)) return { value: undefined, representable: false }
  if (!control.multiple && entries.length > 1) return { value: undefined, representable: false }
  if (control.control === 'tags') return { value: scalar.map(String).join(', '), representable: true }
  if (control.multiple) return { value: scalar, representable: true }
  return { value: scalar[0] ?? '', representable: true }
}

function applyProfileDefinition(definition: LoadedProfileDefinition, crate: unknown) {
  profileDefinition.value = definition
  if (definition.complete) {
    profileLoading.value = false
    profileLoadFailed.value = false
    profileLoadError.value = null
  }
  profileEntityRules.value = definition.entityRules
  profileContextTerms.value = definition.contextTerms
  profileAdditionalRequirements.value = cloneLiftNotes(definition.additionalRequirements)
  profileShapes.value = [...definition.shapes]

  const root = findRoot(crate) ?? {}
  const controls = controlsFromRules(definition.propertyRules, definition.entityRules)
  const visibleControls: ProfileControl[] = []
  const contextTerms = contextTermMappings(crate)
  const contextConflicts: string[] = []
  const editable = new Set<string>()
  const nextGenerated = defaultControlValues(controls.filter((control) => control.control !== 'entity'))
  const nextEntities: Record<string, EntityEntry[]> = {}

  for (const control of controls) {
    if (PROFILE_RESERVED_KEYS.has(control.property)) continue
    const rule = definition.propertyRules.find((candidate) => candidate.valueName === control.property)
    const mapped = contextTerms[control.property]
    if (rule && mapped && mapped !== rule.propertyUri && !sameSchemaOrgType(mapped, rule.propertyUri)) {
      contextConflicts.push(control.property)
      continue
    }
    const hasValue = Object.prototype.hasOwnProperty.call(root, control.property)
    if (control.control === 'entity') {
      const value = root[control.property]
      const values: unknown[] = hasValue
        ? (Array.isArray(value) ? value : [value])
        : []
      const seededIds = values.map((value) => {
        if (typeof value === 'string' && isAbsoluteUri(value)) return value
        if (isRecord(value) && typeof value['@id'] === 'string' && Object.keys(value).length === 1) return value['@id']
        return undefined
      })
      if (hasValue && (seededIds.some((id) => id === undefined) || (!control.multiple && seededIds.length > 1))) continue
      const ids = seededIds.filter((id): id is string => id !== undefined)
      const entries = ids.map((id) => ({ ...newRefEntry(), ref: id }))
      nextEntities[control.property] = entries.length
        ? entries
        : seedEntries(control, definition.entityRules, 1)
    } else if (hasValue) {
      const seeded = profileInputValue(root[control.property], control)
      if (!seeded.representable) continue
      nextGenerated[control.property] = seeded.value
    }
    visibleControls.push(control)
    if (!PROFILE_INDEPENDENT_KEYS.has(control.property) && !profileHasPartRule(definition, control.property)) {
      editable.add(control.property)
    }
  }

  profileControls.value = visibleControls
  profileContextConflicts.value = contextConflicts
  generatedValues.value = nextGenerated
  entityEntries.value = nextEntities
  editableProfileKeys.value = editable
  seedAdditionalFields(root)
}

function profileHasPartRule(definition: LoadedProfileDefinition, property: string): boolean {
  return definition.propertyRules.some((rule) => rule.valueName === property && isHasPartUri(rule.propertyUri))
}

function seedAdditionalFields(root: Record<string, unknown> | undefined) {
  const managed = new Set([...MANAGED_KEYS, ...editableProfileKeys.value])
  const seeded = seedCustomFieldRows(root ?? {}, managed)
  customFields.value = seeded.rows
  preservedFields.value = seeded.preserved
  seededCustomKeys = [...new Set(seeded.rows.map((row) => row.key))]
}

function seedFields(crate: unknown) {
  const root = findRoot(crate)
  name.value = stringField(root?.name)
  description.value = stringField(root?.description)
  keywordsText.value = arrayField(root?.keywords).join(', ')
  datePublished.value = stringField(root?.datePublished)
  licenseWasString.value = typeof root?.license === 'string'
  license.value = licenseIri(root?.license)

  seedAdditionalFields(root)

  // Subcrate references (RO-Crate 1.2) are managed in their own list, not the
  // files editor; they must not seed as file rows. Only depth-zero entities
  // seed: a nested sub-dataset's parts belong to that sub-dataset, and seeding
  // them here would hoist them into the root's hasPart on save.
  subcrates.value = subcrateLinksOf(crate)
  const subcrateIris = new Set(subcrates.value.map((link) => link.iri))
  fileRows.value = dataEntityTreeOf(crate).filter((row) => row.depth === 0 && !subcrateIris.has(row.id))
  locationIdentityIds.value = new Set()

  // A mention is one of our documents iff its @id is an Aruna graph IRI; that
  // is a pure decision on the IRI, not a catalog lookup.
  const mentions = Array.isArray(root?.mentions) ? root.mentions : root?.mentions ? [root.mentions] : []
  relatedIds.value = []
  preservedMentions = []
  for (const mention of mentions) {
    const id = refIdOf(mention)
    if (id && documentIdFromIri(id)) relatedIds.value.push(id)
    else preservedMentions.push(mention)
  }
  relatedPick.value = ''
  for (const iri of relatedIds.value) void ensureRelatedLabel(iri)
}

function buildFromFields(): unknown {
  const clone: unknown = structuredClone(pristine.value)
  const root = findRoot(clone)
  if (!root) throw new Error('This crate has no root dataset entity to edit.')
  // Unlinked subcrates are removed FIRST, while their entities still exist in
  // the clone, so removeSubcrateLink can also clean up subjectOf leftovers.
  const keptSubcrateIris = new Set(subcrates.value.map((link) => link.iri))
  for (const link of subcrateLinksOf(pristine.value)) {
    if (!keptSubcrateIris.has(link.iri)) removeSubcrateLink(clone, link.iri)
  }
  // File edits rebuild hasPart and File entities before mentions are rewritten, so
  // a removed file still counted as referenced by an existing mention is preserved.
  applyDataEntities(clone, files.value)
  applyAuthoredContentUrls(clone)
  restoreSubcrates(clone)
  // Newly picked subcrates compose via the spec-conformant helper; kept links
  // were already restored verbatim above (addSubcrateLink is idempotent).
  for (const link of subcrates.value) addSubcrateLink(clone, link)
  root.name = name.value.trim()
  root.description = description.value.trim()
  const keywords = keywordsText.value.split(',').map((k) => k.trim()).filter(Boolean)
  if (keywords.length) root.keywords = keywords
  else delete root.keywords
  if (datePublished.value.trim()) root.datePublished = datePublished.value.trim()
  else delete root.datePublished
  const licenseValue = license.value.trim()
  if (!licenseValue) {
    delete root.license
  } else if (licenseWasString.value) {
    root.license = licenseValue
  } else {
    root.license = { '@id': licenseValue }
    upsertLicenseEntity(clone, licenseValue)
  }

  applyProfileFields(clone, root)

  // Custom fields: rows write typed values (repeated keys merge into arrays);
  // keys removed since seeding are deleted; managed keys are skipped rather
  // than clobbering structured properties. Preserved keys are never touched.
  const grouped = groupCustomFieldRows(customFields.value)
  for (const key of seededCustomKeys) {
    if (!(key in grouped)) delete root[key]
  }
  for (const [key, value] of Object.entries(grouped)) {
    if (MANAGED_KEYS.has(key) || editableProfileKeys.value.has(key)) continue
    root[key] = value
  }

  const mentionRefs = [...preservedMentions, ...relatedIds.value.map((id) => ({ '@id': id }))]
  if (mentionRefs.length) root.mentions = mentionRefs
  else delete root.mentions
  for (const id of relatedIds.value) upsertRelatedEntity(clone, id)
  return clone
}

function applyAuthoredContentUrls(crate: unknown) {
  if (!isRecord(crate)) return
  const graph = Array.isArray(crate['@graph']) ? crate['@graph'] : []
  for (const file of files.value) {
    const contentUrl = file.contentUrl?.trim()
    if (!contentUrl) continue
    const entity = graph.find((value) => isRecord(value) && value['@id'] === file.id)
    if (isRecord(entity)) entity.contentUrl = contentUrl
  }
}

function applyProfileFields(crate: unknown, root: Record<string, unknown>) {
  const definition = profileDefinition.value
  if (definition) {
    const addEntity = graphEntitySink(crate)
    const normalized = normalizeProfileValues(generatedValues.value, generatedScalarControls.value, { omitEmpty: true })
    for (const control of generatedScalarControls.value) {
      if (!editableProfileKeys.value.has(control.property)) continue
      delete root[control.property]
      if (control.control === 'select-object') {
        const reference = emitSelectObject(control, generatedValues.value[control.property], addEntity)
        if (reference) root[control.property] = reference
      } else if (control.property in normalized) {
        root[control.property] = normalized[control.property]
      }
    }

    const emitContext = {
      entityRules: profileEntityRules.value,
      contextTerms: profileContextTerms.value,
      validCrateIds: new Set(files.value.map((file) => file.id)),
      usedSyntheticIds: new Set<string>(),
      addEntity,
    }
    for (const control of entityControls.value) {
      if (!editableProfileKeys.value.has(control.property)) continue
      delete root[control.property]
      const references: Array<{ '@id': string }> = []
      const seen = new Set<string>()
      for (const entry of entityEntries.value[control.property] ?? []) {
        const emitted = entry.source === 'existing'
          ? entry.ref?.trim() ? [{ '@id': entry.ref.trim() }] : []
          : emitEntityEntries(control, [entry], emitContext, 1)
        for (const reference of emitted) {
          if (seen.has(reference['@id'])) continue
          seen.add(reference['@id'])
          references.push(reference)
        }
      }
      if (references.length) root[control.property] = control.multiple ? references : references[0]
    }
    mergeProfileContext(crate, definition.contextTerms)
  }

  if (profileTransitionApplied.value) {
    rewriteProfileReference(crate, activeProfileValue.value, definition)
  }
}

function graphEntitySink(crate: unknown): (entity: Record<string, unknown>) => void {
  if (!isRecord(crate)) return () => {}
  const graph = Array.isArray(crate['@graph']) ? (crate['@graph'] as unknown[]) : []
  const byId = new Map<string, Record<string, unknown>>()
  for (const value of graph) {
    if (isRecord(value) && typeof value['@id'] === 'string') byId.set(value['@id'], value)
  }
  crate['@graph'] = graph
  return (entity) => {
    const id = typeof entity['@id'] === 'string' ? entity['@id'] : ''
    if (!id) return
    const existing = byId.get(id)
    if (existing) {
      for (const [key, value] of Object.entries(entity)) {
        if (existing[key] === undefined) existing[key] = value
      }
      return
    }
    const added = structuredClone(entity)
    byId.set(id, added)
    graph.push(added)
  }
}

function mergeProfileContext(crate: unknown, terms: Record<string, string>) {
  if (!isRecord(crate) || !Object.keys(terms).length) return
  const current = crate['@context']
  const items = Array.isArray(current) ? structuredClone(current) : current === undefined ? [] : [structuredClone(current)]
  const termIndex = items.findIndex((item) => isRecord(item))
  if (termIndex >= 0) items[termIndex] = { ...terms, ...(items[termIndex] as Record<string, unknown>) }
  else items.push({ ...terms })
  crate['@context'] = items.length === 1 ? items[0] : items
}

function contextTermMappings(crate: unknown): Record<string, string> {
  if (!isRecord(crate)) return {}
  const current = crate['@context']
  const items = Array.isArray(current) ? current : [current]
  const terms: Record<string, string> = {}
  for (const item of items) {
    if (!isRecord(item)) continue
    for (const [key, value] of Object.entries(item)) {
      if (!key.startsWith('@') && typeof value === 'string') terms[key] = value
      else if (!key.startsWith('@') && isRecord(value) && typeof value['@id'] === 'string') terms[key] = value['@id']
    }
  }
  return terms
}

function rewriteProfileReference(crate: unknown, profileValue: string, definition: LoadedProfileDefinition | null) {
  const root = findRoot(crate)
  if (!root) return
  const current = Array.isArray(root.conformsTo) ? root.conformsTo : root.conformsTo ? [root.conformsTo] : []
  const specificationReferences = current.filter((value) => {
    const iri = refIdOf(value)
    return Boolean(iri && classifyRoCrateSpecIri(iri).kind !== 'non-spec')
  })
  if (profileValue === NO_PROFILE_VALUE) {
    if (specificationReferences.length) root.conformsTo = specificationReferences
    else delete root.conformsTo
    return
  }
  const profile = definition?.profile
  const iri = profileReferenceIri(profile)
  if (!profile || !iri) return
  root.conformsTo = [...specificationReferences, { '@id': iri }]
  graphEntitySink(crate)({
    '@id': iri,
    '@type': ['CreativeWork', DX_PROFILE],
    name: profile.name,
    ...(profile.version ? { version: profile.version } : {}),
  })
}

// The files rebuild (applyDataEntities) knows nothing about subcrates: it drops
// their hasPart refs and entities. Restore the KEPT links verbatim from the
// pristine crate so a Fields/Files save never loses subcrate links; links the
// user unlinked in this session are not restored.
function restoreSubcrates(clone: unknown) {
  const kept = new Set(subcrates.value.map((link) => link.iri))
  const links = subcrateLinksOf(pristine.value).filter((link) => kept.has(link.iri))
  if (!links.length || !isRecord(clone)) return
  const root = findRoot(clone)
  if (!root) return
  const pristineGraph = graphOf(pristine.value)
  const graph = Array.isArray(clone['@graph']) ? (clone['@graph'] as unknown[]) : []
  const hasPart = Array.isArray(root.hasPart) ? root.hasPart : root.hasPart ? [root.hasPart] : []
  for (const link of links) {
    if (!graph.some((entity) => isRecord(entity) && entity['@id'] === link.iri)) {
      const original = pristineGraph.find((entity) => entity['@id'] === link.iri)
      if (original) graph.push(structuredClone(original))
    }
    if (!hasPart.some((ref) => refIdOf(ref) === link.iri)) hasPart.push({ '@id': link.iri })
  }
  root.hasPart = hasPart
  clone['@graph'] = graph
}

// Each related document gets a resolvable contextual entity so the reference
// stays meaningful outside this portal. A resolved title refreshes an existing
// stub; the bare IRI is never written as a name, so an unresolved label leaves
// the stub nameless rather than permanently wrong.
function upsertRelatedEntity(crate: unknown, graphIri: string) {
  if (!isRecord(crate)) return
  const g = Array.isArray(crate['@graph']) ? (crate['@graph'] as unknown[]) : []
  const label = relatedLabels.value[graphIri]
  const existing = g.find((entity) => isRecord(entity) && entity['@id'] === graphIri)
  if (isRecord(existing)) {
    if (label) existing.name = label
    return
  }
  const documentId = documentIdFromIri(graphIri)
  g.push({
    '@id': graphIri,
    '@type': 'Dataset',
    ...(label ? { name: label } : {}),
    ...(documentId ? { identifier: documentId } : {}),
  })
  crate['@graph'] = g
}

// Labels for linked documents outside the loaded pages come from a targeted
// fetch, cached per IRI so the template stays synchronous.
const relatedLabels = ref<Record<string, string>>({})

async function ensureRelatedLabel(graphIri: string) {
  const documentId = documentIdFromIri(graphIri)
  if (!documentId || relatedLabels.value[graphIri]) return
  const loaded = metadataItems.value.find((entry) => entry.document_id === documentId)
  if (loaded) {
    relatedLabels.value = { ...relatedLabels.value, [graphIri]: toMetadataDoc(loaded).title }
    return
  }
  try {
    const item = await getMetadataItem(documentId)
    const title = toMetadataDoc(item).title || item.document_path
    relatedLabels.value = { ...relatedLabels.value, [graphIri]: title }
  } catch {
    // A deleted or unreadable target keeps its IRI as the label.
  }
}

function relatedLabel(graphIri: string): string {
  return relatedLabels.value[graphIri] || graphIri
}

// Options come from the loaded catalog pages; the realm is too large to
// enumerate here, so linking a document further out goes through its IRI.
const relatedOptions = computed(() =>
  metadataItems.value
    .filter((item) => item.document_id !== props.documentId && !relatedIds.value.includes(item.graph_iri))
    .map((item) => ({ value: item.graph_iri, label: toMetadataDoc(item).title })),
)

function addRelated() {
  if (relatedPick.value && !relatedIds.value.includes(relatedPick.value)) {
    relatedIds.value = [...relatedIds.value, relatedPick.value]
    void ensureRelatedLabel(relatedPick.value)
  }
  relatedPick.value = ''
}

function removeRelated(graphIri: string) {
  relatedIds.value = relatedIds.value.filter((id) => id !== graphIri)
}

function snapshotExistingProfileItems(crate: unknown): ExistingProfileItem[] {
  const definition = profileDefinition.value
  const root = findRoot(crate)
  if (!definition || !root) return []
  const controls = new Map(profileControls.value.map((control) => [control.property, control]))
  const items: ExistingProfileItem[] = []
  for (const rule of definition.propertyRules) {
    if (PROFILE_INDEPENDENT_KEYS.has(rule.valueName) || isHasPartUri(rule.propertyUri)) continue
    if (!Object.prototype.hasOwnProperty.call(root, rule.valueName)) continue
    const rawValue = root[rule.valueName]
    if (!draftValuePopulated(rawValue)) continue
    const control = controls.get(rule.valueName)
    if (!control) continue
    const migrationValue = control.control === 'entity'
      ? (Array.isArray(rawValue) ? rawValue : [rawValue]).map(() => newRefEntry())
      : cloneDraftValue(rawValue)
    items.push({
      property: rule.valueName,
      propertyUri: rule.propertyUri,
      label: control.label,
      kind: control.control === 'entity' ? 'entity' : 'generated',
      value: migrationValue,
      rawValue: cloneDraftValue(rawValue),
      multiple: control.multiple,
      valueKind: control.kind,
    })
  }
  return items
}

function transitionValuePreview(item: ExistingProfileItem): string {
  const rendered = JSON.stringify(item.rawValue)
  return rendered.length > 140 ? `${rendered.slice(0, 137)}...` : rendered
}

async function retryActiveProfile() {
  const profile = selectedProfile.value
  if (!profile || profileLoading.value) return
  let current: unknown
  try {
    current = buildFromFields()
  } catch (err) {
    profileLoadError.value = err instanceof Error ? err.message : String(err)
    return
  }
  profileLoading.value = true
  profileLoadFailed.value = false
  profileLoadError.value = null
  try {
    const definition = await fullProfileDefinition(profile, true)
    applyProfileDefinition(definition, current)
  } catch (err) {
    profileLoadFailed.value = true
    profileLoadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    profileLoading.value = false
  }
}

async function requestProfileSwitch(nextValue: string) {
  if (nextValue === activeProfileValue.value || nextValue === EXTERNAL_PROFILE_VALUE || profileSwitchOpen.value) return
  if (nextValue !== NO_PROFILE_VALUE && selectedProfile.value && (profileLoading.value || profileLoadFailed.value)) {
    saveError.value = 'Retry the current profile rules before switching to another registered profile, or choose No profile reference.'
    return
  }
  let base: unknown
  try {
    base = buildFromFields()
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : String(err)
    return
  }

  const token = ++profileSwitchToken
  pendingProfileValue.value = nextValue
  pendingBaseCrate.value = base
  pendingItems.value = snapshotExistingProfileItems(base)
  pendingProfileDefinition.value = null
  profileSwitchError.value = null
  profileSwitchOpen.value = true

  if (nextValue === NO_PROFILE_VALUE) {
    profileSwitchLoading.value = false
    return
  }
  const target = availableProfiles.value.find((profile) => profile.id === nextValue)
  if (!target) {
    profileSwitchError.value = 'That registered profile is no longer available.'
    profileSwitchLoading.value = false
    return
  }
  if (!profileReferenceIri(target)) {
    profileSwitchError.value = 'That registered profile has no saved reference IRI.'
    profileSwitchLoading.value = false
    return
  }

  profileSwitchLoading.value = true
  try {
    const definition = await fullProfileDefinition(target)
    if (token !== profileSwitchToken) return
    pendingProfileDefinition.value = definition
  } catch (err) {
    if (token !== profileSwitchToken) return
    profileSwitchError.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (token === profileSwitchToken) profileSwitchLoading.value = false
  }
}

async function retryPendingProfile() {
  const target = pendingProfile.value
  if (!target || profileSwitchLoading.value) return
  const token = ++profileSwitchToken
  profileSwitchLoading.value = true
  profileSwitchError.value = null
  try {
    const definition = await fullProfileDefinition(target, true)
    if (token !== profileSwitchToken) return
    pendingProfileDefinition.value = definition
  } catch (err) {
    if (token !== profileSwitchToken) return
    profileSwitchError.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (token === profileSwitchToken) profileSwitchLoading.value = false
  }
}

function cancelProfileSwitch() {
  ++profileSwitchToken
  profileSwitchOpen.value = false
  profileSwitchLoading.value = false
  profileSwitchError.value = null
  pendingProfileValue.value = null
  pendingProfileDefinition.value = null
  pendingBaseCrate.value = null
  pendingItems.value = []
}

function confirmProfileSwitch() {
  const nextValue = pendingProfileValue.value
  const replacement = pendingReplacementCrate.value
  if (nextValue === null || !replacement || profileSwitchLoading.value || profileSwitchError.value) return
  const review = pendingPreview.value.map(({ item, target }) => ({
    label: item.label,
    propertyUri: item.propertyUri,
    valuePreview: transitionValuePreview(item),
    ...(target ? { targetLabel: target.label } : {}),
  }))

  activeProfileValue.value = nextValue
  profileTransitionApplied.value = true
  pristine.value = structuredClone(replacement)
  rawText.value = JSON.stringify(replacement, null, 2)
  externalProfileReferences.value = []
  seedFields(replacement)
  if (pendingProfileDefinition.value) applyProfileDefinition(pendingProfileDefinition.value, replacement)
  else clearProfileDefinition(replacement)
  transitionReview.value = review
  transitionMigratedCount.value = review.filter((item) => item.targetLabel).length
  activeTab.value = 'fields'
  cancelProfileSwitch()
}

function buildTransitionCrate(
  base: unknown,
  nextValue: string,
  definition: LoadedProfileDefinition | null,
  items: ExistingProfileItem[],
): unknown {
  const clone = structuredClone(base)
  const root = findRoot(clone)
  if (!root) throw new Error('This crate has no root dataset entity to edit.')
  const controls = controlsFromRules(definition?.propertyRules ?? [], definition?.entityRules ?? [])
  for (const item of items) {
    const target = migrationTarget(item, definition?.propertyRules ?? [], controls)
    if (target) {
      if (target.property === item.property) continue
      const existing = root[target.property]
      delete root[item.property]
      root[target.property] = mergeMetadataValues(existing, item.rawValue)
      continue
    }
    if (item.property !== item.propertyUri) {
      const existing = root[item.propertyUri]
      delete root[item.property]
      root[item.propertyUri] = mergeMetadataValues(existing, item.rawValue)
    }
  }
  if (definition) mergeProfileContext(clone, definition.contextTerms)
  rewriteProfileReference(clone, nextValue, definition)
  return clone
}

function mergeMetadataValues(existing: unknown, incoming: unknown): unknown {
  if (existing === undefined) return cloneDraftValue(incoming)
  const values = [
    ...(Array.isArray(existing) ? existing : [existing]),
    ...(Array.isArray(incoming) ? incoming : [incoming]),
  ]
  const seen = new Set<string>()
  const merged = values.filter((value) => {
    const key = JSON.stringify(value)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return merged.length === 1 ? cloneDraftValue(merged[0]) : cloneDraftValue(merged)
}

function setGeneratedValue(property: string, value: unknown) {
  generatedValues.value = { ...generatedValues.value, [property]: value }
}

function addEntityEntry(control: ProfileControl, source: 'new' | 'existing') {
  const entry = source === 'new' ? newEntityEntry(control, profileEntityRules.value, 1) : newRefEntry()
  entityEntries.value = {
    ...entityEntries.value,
    [control.property]: [...(entityEntries.value[control.property] ?? []), entry],
  }
}

function removeEntityEntry(property: string, index: number) {
  const entries = [...(entityEntries.value[property] ?? [])]
  entries.splice(index, 1)
  entityEntries.value = { ...entityEntries.value, [property]: entries }
}

function switchEntityEntrySource(control: ProfileControl, index: number, source: 'new' | 'existing') {
  const entries = [...(entityEntries.value[control.property] ?? [])]
  const current = entries[index]
  if (!current || current.source === source) return
  entries[index] = source === 'new' ? newEntityEntry(control, profileEntityRules.value, 1) : newRefEntry()
  entityEntries.value = { ...entityEntries.value, [control.property]: entries }
}

function setEntityEntryValue(property: string, index: number, subProperty: string, value: unknown) {
  const entries = [...(entityEntries.value[property] ?? [])]
  const current = entries[index]
  if (!current || current.source !== 'new') return
  entries[index] = { ...current, instance: { ...(current.instance ?? {}), [subProperty]: value } }
  entityEntries.value = { ...entityEntries.value, [property]: entries }
}

function setEntityEntryRef(property: string, index: number, value: string) {
  const entries = [...(entityEntries.value[property] ?? [])]
  const current = entries[index]
  if (!current || current.source !== 'existing') return
  entries[index] = { ...current, ref: value }
  entityEntries.value = { ...entityEntries.value, [property]: entries }
}

function setEntityEntryCustomId(property: string, index: number, value: string) {
  const entries = [...(entityEntries.value[property] ?? [])]
  const current = entries[index]
  if (!current || current.source !== 'new') return
  entries[index] = { ...current, customId: value }
  entityEntries.value = { ...entityEntries.value, [property]: entries }
}

// Live, non-blocking profile validation over the Fields tab state. Editing an
// existing document must stay possible even when it never conformed, so
// violations inform rather than gate the save.
const violations = computed(() => {
  const schema = profileDefinition.value?.schema
  if (!schema || !props.open || loading.value || !pristine.value) return []
  try {
    return validateProfileData(schema, findRoot(buildFromFields()) ?? {})
  } catch {
    return []
  }
})

function violationsFor(property: string) {
  return violations.value.filter((violation) => violation.fieldId === property)
}

function unknownProfileReferences(crate: unknown): string[] {
  return profileReferencesOf(crate).filter((iri) => !profileForReference(iri))
}

const replacementPreviewText = computed(() => {
  if (!profileTransitionApplied.value || !pristine.value) return ''
  try {
    return JSON.stringify(buildFromFields(), null, 2)
  } catch {
    return ''
  }
})

function upsertLicenseEntity(crate: unknown, licenseValue: string) {
  if (!isRecord(crate)) return
  const g = Array.isArray(crate['@graph']) ? (crate['@graph'] as unknown[]) : []
  const exists = g.some((e) => isRecord(e) && e['@id'] === licenseValue)
  if (!exists) g.push(licenseEntity(licenseValue))
  crate['@graph'] = g
}

function clearProfileWriteFailure() {
  saveError.value = null
  serverFindings.value = []
  profiledWriteUnavailable.value = false
  profiledWriteRejected.value = false
}

function showProfileWriteFailure(error: unknown, profiled: boolean) {
  const findings = profileValidationFindings(error)
  const unavailable = profiled && error instanceof ApiError && error.status === 503
  serverFindings.value = findings
  profiledWriteUnavailable.value = unavailable
  profiledWriteRejected.value = profiled && (findings.length > 0 || unavailable)
  saveError.value = profiledWriteRejected.value
    ? unavailable
      ? 'The server did not save this profiled write because Profile validation is unavailable.'
      : 'The server rejected this profiled write.'
    : error instanceof ApiError && error.status === 403
      ? 'You need write permission in the owning group.'
      : error instanceof Error
        ? error.message
        : String(error)
}

async function save(unprofiled = false) {
  clearProfileWriteFailure()
  rawError.value = null
  const documentId = loadedDocumentId.value
  if (!documentId || documentId !== props.documentId) {
    saveError.value = 'This document changed while the editor was loading. Reload it before saving.'
    return
  }
  let rocrate: unknown
  try {
    rocrate = activeTab.value === 'raw' ? JSON.parse(rawText.value) : buildFromFields()
    if (unprofiled) rewriteProfileReference(rocrate, NO_PROFILE_VALUE, null)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (activeTab.value === 'raw') rawError.value = message
    else saveError.value = message
    return
  }
  const profiled = profileReferencesOf(rocrate).length > 0
  const externalReferences = unknownProfileReferences(rocrate)
  if (externalReferences.length) {
    const message = `Remove the external conformsTo ${externalReferences.length === 1 ? 'reference' : 'references'} before saving, or choose a registered profile. Only registered profile references can be written.`
    if (activeTab.value === 'raw') rawError.value = message
    else saveError.value = message
    return
  }
  try {
    // The update is accepted into the pipeline; the projection may lag, so the
    // detail view's crate re-fetch (loadRoCrate) polls until it materializes.
    const summary = await replaceMetadataRoCrate(documentId, { rocrate, public: isPublic.value })
    emit('saved', summary)
    emit('update:open', false)
  } catch (err) {
    showProfileWriteFailure(err, profiled)
  }
}

function requestClose(next: boolean) {
  if (!next && profileSwitchOpen.value) {
    cancelProfileSwitch()
    return
  }
  emit('update:open', next)
}
</script>

<template>
  <Dialog :open="props.open" @update:open="requestClose">
    <DialogContent class="relative max-w-2xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2"><Pencil class="h-4 w-4 text-primary" /> Edit metadata</DialogTitle>
        <DialogDescription>
          Replace the document's RO-Crate. Editing writes the whole crate back; the projection may briefly lag after saving.
        </DialogDescription>
      </DialogHeader>

      <div v-if="loading" class="py-8 text-center text-sm text-muted-foreground">Loading crate…</div>
      <div v-else-if="loadError" class="space-y-3">
        <p class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ loadError }}</p>
        <Button variant="outline" size="sm" @click="reload">Try again</Button>
      </div>

      <template v-else>
        <Tabs v-model="activeTab">
          <TabsList>
            <TabsTrigger value="fields">Fields</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
            <TabsTrigger value="raw">Raw JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="fields" class="space-y-3">
            <section class="space-y-2 rounded-md border border-border p-3">
              <div>
                <label class="text-xs font-medium text-foreground">Profile reference</label>
                <Select v-model="profileSelection" :options="profileOptions" class="mt-1" aria-label="Profile reference" />
                <p class="mt-1 text-[11px] text-muted-foreground">
                  Choose a registered profile or remove the profile reference. Published datasets and datasets with persistent identifiers can transition too.
                </p>
              </div>

              <div v-if="externalProfileReferences.length" class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div>
                  <p>This Dataset contains an external conformsTo reference that remains visible for reading but cannot be written back.</p>
                  <ul class="mt-1 space-y-0.5">
                    <li v-for="iri in externalProfileReferences" :key="iri"><code class="break-all font-mono">{{ iri }}</code></li>
                  </ul>
                  <p class="mt-1">Choose a registered profile or No profile reference before saving.</p>
                </div>
              </div>

              <div v-if="selectedProfile && profileRuleState === 'loading'" class="space-y-2">
                <p class="text-[11px] text-muted-foreground">Loading the selected profile rules…</p>
                <Skeleton class="h-12" />
              </div>
              <div v-else-if="selectedProfile && profileRuleState === 'unavailable'" class="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
                <p class="text-xs font-medium text-destructive">The selected profile rules are unavailable.</p>
                <p class="mt-1 text-[11px] text-destructive/90">{{ profileLoadError }}</p>
                <p class="mt-1 text-[11px] text-muted-foreground">The saved summary fields remain visible, but a new transition needs the full stored profile.</p>
                <Button variant="outline" size="sm" class="mt-2" @click="retryActiveProfile">Retry</Button>
              </div>
              <p v-else-if="selectedProfile && profileRuleState === 'empty'" class="text-[11px] text-muted-foreground">
                No generated rules are defined for this profile. Additional metadata remains allowed unless an explicit SHACL rule restricts it.
              </p>
              <p v-else-if="selectedProfile" class="text-[11px] text-muted-foreground">
                Matching saved values are shown in the generated controls. Additional metadata remains allowed unless an explicit SHACL rule restricts it.
              </p>
              <p v-if="profileContextConflicts.length" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
                These profile field names already map to different property URIs in this crate and are not reinterpreted: {{ profileContextConflicts.join(', ') }}. Their saved values remain custom metadata. Resolve the context conflict in Raw JSON or remove the profile reference before saving if authoritative validation rejects the crate.
              </p>

              <div v-if="profileAdditionalRequirements.length || serverRequiredConstraints.length" class="space-y-2 rounded-md border border-border bg-muted/20 p-2">
                <p class="mb-1 text-[11px] font-medium text-foreground">Additional requirements</p>
                <div v-if="serverRequiredConstraints.length" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                  <p class="font-medium">Server validation required</p>
                  <p class="mt-1">The browser cannot lift {{ serverRequiredConstraints.join(', ') }} into complete controls. The server checks these constraints when you save.</p>
                </div>
                <LiftNotesPanel :notes="profileAdditionalRequirements" attached />
              </div>

              <template v-if="selectedProfile && profileRuleState !== 'loading'">
                <div v-if="generatedScalarControls.length" class="grid gap-3 sm:grid-cols-2">
                  <ProfileControlField
                    v-for="control in generatedScalarControls"
                    :key="control.property"
                    :control="control"
                    :model-value="generatedValues[control.property]"
                    :violations="violationsFor(control.property)"
                    :class="control.control === 'textarea' || control.control === 'tags' ? 'sm:col-span-2' : ''"
                    @update:model-value="(value: unknown) => setGeneratedValue(control.property, value)"
                  />
                </div>
                <DatasetEntityInstances
                  v-for="control in entityControls"
                  :key="control.property"
                  :control="control"
                  :sub-controls="entitySubControls[control.property] ?? []"
                  :entries="entityEntries[control.property] ?? []"
                  :entry-violations="[]"
                  :presence-violations="violationsFor(control.property)"
                  :type-label="entityTypeLabelFor(control)"
                  :crate-options="crateOptions"
                  :entity-rules="profileEntityRules"
                  :depth="1"
                  @add-new="addEntityEntry(control, 'new')"
                  @add-existing="addEntityEntry(control, 'existing')"
                  @remove="(index: number) => removeEntityEntry(control.property, index)"
                  @switch-source="(index: number, source: 'new' | 'existing') => switchEntityEntrySource(control, index, source)"
                  @update="(index: number, property: string, value: unknown) => setEntityEntryValue(control.property, index, property, value)"
                  @update-ref="(index: number, value: string) => setEntityEntryRef(control.property, index, value)"
                  @update-custom-id="(index: number, value: string) => setEntityEntryCustomId(control.property, index, value)"
                />
              </template>
            </section>

            <div>
              <label class="text-xs font-medium text-foreground">Name</label>
              <Input v-model="name" class="mt-1" placeholder="Dataset title" />
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Description</label>
              <Textarea v-model="description" rows="4" class="mt-1 font-sans" placeholder="Describe the dataset" />
            </div>
            <div v-if="showKeywordsScaffold">
              <label class="text-xs font-medium text-foreground">Keywords</label>
              <Input v-model="keywordsText" class="mt-1" placeholder="comma, separated, keywords" />
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="text-xs font-medium text-foreground">Date published</label>
                <Input v-model="datePublished" type="date" class="mt-1" />
              </div>
              <div>
                <label class="text-xs font-medium text-foreground">License (IRI)</label>
                <Input v-model="license" class="mt-1" placeholder="https://creativecommons.org/licenses/by/4.0" />
              </div>
            </div>

            <div v-if="transitionReview.length" class="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
              <p class="font-medium text-foreground">Profile transition review</p>
              <p class="mt-1 text-muted-foreground">
                {{ transitionMigratedCount }} {{ transitionMigratedCount === 1 ? 'field now uses' : 'fields now use' }} matching controls.
                {{ transitionReview.length - transitionMigratedCount }} unmatched {{ transitionReview.length - transitionMigratedCount === 1 ? 'field remains' : 'fields remain' }} as custom metadata for review.
              </p>
              <ul class="mt-2 space-y-1">
                <li v-for="item in transitionReview" :key="item.propertyUri" class="rounded border border-border bg-background/70 px-2 py-1.5">
                  <span class="font-medium text-foreground">{{ item.label }}</span>
                  <code class="ml-1 break-all font-mono text-[10px] text-muted-foreground">{{ item.propertyUri }}</code>
                  <span class="mt-0.5 block break-all font-mono text-[10px] text-muted-foreground">{{ item.valuePreview }}</span>
                  <span class="mt-0.5 block text-muted-foreground">
                    {{ item.targetLabel ? `Moved into ${item.targetLabel} because the property URI matches.` : 'Preserved as custom metadata in the replacement crate. Nothing was deleted.' }}
                  </span>
                </li>
              </ul>
              <details v-if="replacementPreviewText" class="mt-2 rounded border border-border bg-background/70 p-2">
                <summary class="cursor-pointer font-medium text-foreground">Preview exact replacement crate</summary>
                <p class="mt-1 text-[11px] text-muted-foreground">This is a local preview of the exact Fields-tab replacement. It does not report verified conformance. The server validates the submitted replacement authoritatively.</p>
                <pre class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[10px] text-foreground">{{ replacementPreviewText }}</pre>
              </details>
            </div>

            <CustomFieldsEditor v-model:rows="customFields" :preserved="preservedFields" />

            <div>
              <label class="text-xs font-medium text-foreground">Related datasets</label>
              <div class="mt-1.5 flex items-center gap-2">
                <Select v-model="relatedPick" :options="relatedOptions" placeholder="Pick a loaded catalog dataset" class="flex-1" />
                <Button variant="outline" size="sm" :disabled="!relatedPick" @click="addRelated"><Plus class="h-3.5 w-3.5" /> Link</Button>
              </div>
              <ul v-if="relatedIds.length" class="mt-2 space-y-1">
                <li v-for="id in relatedIds" :key="id" class="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs">
                  <span class="min-w-0 truncate text-foreground" :title="id">{{ relatedLabel(id) }}</span>
                  <Button variant="ghost" size="icon-sm" class="shrink-0 text-muted-foreground" aria-label="Unlink dataset" @click="removeRelated(id)">
                    <X class="h-3.5 w-3.5" />
                  </Button>
                </li>
              </ul>
              <p class="mt-1 text-[11px] text-muted-foreground">
                Written as <code class="font-mono">mentions</code> references; they render as browsable links on the detail page.
              </p>
            </div>

            <div>
              <div class="flex items-center justify-between gap-3">
                <label class="text-xs font-medium text-foreground">Subcrates</label>
                <Button variant="outline" size="sm" @click="subcratePickerOpen = true">
                  <Plus class="h-3.5 w-3.5" /> Link subcrate
                </Button>
              </div>
              <ul v-if="subcrates.length" class="mt-2 space-y-1">
                <li v-for="link in subcrates" :key="link.iri" class="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs">
                  <span class="flex min-w-0 items-center gap-1.5">
                    <Layers class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span class="min-w-0 truncate text-foreground" :title="link.iri">{{ link.name }}</span>
                  </span>
                  <Button variant="ghost" size="icon-sm" class="shrink-0 text-muted-foreground" :aria-label="`Unlink subcrate ${link.name}`" title="Unlink subcrate (the child document itself is kept)" @click="removeSubcrate(link.iri)">
                    <X class="h-3.5 w-3.5" />
                  </Button>
                </li>
              </ul>
              <p class="mt-1 text-[11px] text-muted-foreground">
                References to other crates (RO-Crate 1.2), written as <code class="font-mono">hasPart</code> Dataset entities. Linked crates stay independent documents.
              </p>
            </div>

            <div v-if="violations.length" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
              <div class="font-medium text-amber-800 dark:text-amber-300">Browser SHACL preview: {{ selectedProfile?.name }}</div>
              <ul class="mt-1 list-disc space-y-0.5 pl-4">
                <li v-for="violation in violations" :key="violation.pointer + violation.message" :class="violation.severity === 'error' ? 'text-destructive' : 'text-amber-800 dark:text-amber-300'">
                  <span class="font-mono">{{ violation.fieldId ?? violation.pointer }}</span>: {{ violation.message }}
                </li>
              </ul>
              <p class="mt-1 text-muted-foreground">These browser findings are a preview and do not report verified conformance.</p>
            </div>
          </TabsContent>

          <TabsContent value="files">
            <DatasetFilesEditor v-model="files" :crate="pristine" />
            <div v-if="locationIdentityFiles.length" class="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
              <p class="font-medium">Location identity</p>
              <ul class="mt-1 space-y-1">
                <li v-for="file in locationIdentityFiles" :key="file.id">
                  <code class="break-all font-mono">{{ file.id }}</code> keeps its storage location as the File identifier because the content digest was unavailable.
                </li>
              </ul>
            </div>
            <p class="mt-2 text-[11px] text-muted-foreground">
              Reference identifiers are kept verbatim. Removing a file drops it from the crate unless another entity still references it.
            </p>
          </TabsContent>

          <TabsContent value="raw" class="space-y-2">
            <Textarea v-model="rawText" rows="18" class="text-xs" spellcheck="false" />
            <p v-if="rawError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ rawError }}</p>
            <p v-else class="text-[11px] text-muted-foreground">The active tab wins on save; raw JSON must be a valid RO-Crate object.</p>
          </TabsContent>
        </Tabs>

        <div class="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2">
          <div>
            <div class="text-sm font-medium text-foreground">Public</div>
            <div class="text-[11px] text-muted-foreground">Anyone can read this document when public.</div>
          </div>
          <Switch aria-label="Public" :checked="isPublic" @update:checked="(v: boolean) => (isPublic = v)" />
        </div>

        <section v-if="profiledWriteRejected" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
          <p class="font-medium text-destructive">Profiled write rejected</p>
          <p v-if="profiledWriteUnavailable" class="mt-1 text-foreground">
            The Profile or server validator is unavailable. Validation fails closed, so nothing was saved. Retry when it is available, or remove the Profile tag and save unprofiled.
          </p>
          <ul v-if="serverFindings.length" class="mt-2 space-y-2">
            <li v-for="(finding, index) in serverFindings" :key="`${finding.code}:${index}`" class="rounded border border-border bg-background/70 px-2 py-1.5">
              <p class="font-medium uppercase text-destructive">{{ finding.severity }}</p>
              <p class="mt-0.5 text-foreground">{{ finding.message }}</p>
              <p class="mt-1 break-all font-mono text-[10px] text-muted-foreground">Focus node: {{ finding.focus_node || 'Not provided' }}</p>
              <p class="break-all font-mono text-[10px] text-muted-foreground">Path: {{ finding.path || 'Not provided' }}</p>
            </li>
          </ul>
          <p v-if="!profiledWriteUnavailable" class="mt-2 text-foreground">Fix the metadata and retry, or remove the Profile tag and save unprofiled.</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" :disabled="saving" @click="save()">Retry</Button>
            <Button type="button" variant="outline" size="sm" :disabled="saving" @click="save(true)">Remove Profile tag and save unprofiled</Button>
          </div>
        </section>
        <p v-else-if="saveError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ saveError }}</p>
      </template>

      <DialogFooter>
        <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
        <Button :disabled="loading || Boolean(loadError) || saving" @click="save()">{{ saving ? 'Saving…' : 'Save changes' }}</Button>
      </DialogFooter>

      <Transition
        enter-active-class="transition-opacity duration-150"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="profileSwitchOpen"
          class="absolute inset-0 z-40 flex items-center justify-center rounded-xl bg-background/70 p-4 backdrop-blur-sm"
          @click.self="cancelProfileSwitch"
        >
          <div role="alertdialog" aria-modal="true" aria-labelledby="edit-profile-switch-title" class="w-full max-w-lg rounded-lg border border-border bg-popover p-4 shadow-xl">
            <h2 id="edit-profile-switch-title" class="text-sm font-semibold text-foreground">Confirm Dataset profile transition</h2>
            <p class="mt-1 text-xs text-muted-foreground">
              This changes the Dataset's declared profile from
              {{ selectedProfile?.name ?? (activeProfileValue === EXTERNAL_PROFILE_VALUE ? 'the external reference' : 'No profile reference') }}
              to {{ pendingProfile?.name ?? 'No profile reference' }}. Publication and persistent identifiers remain unchanged.
            </p>
            <p class="mt-1 text-xs text-muted-foreground">All non-profile metadata stays in the crate. Matching property URI values move to the new controls, and unmatched values remain as custom metadata for review.</p>

            <p v-if="profileSwitchLoading" class="mt-3 text-xs text-muted-foreground">Loading the stored profile and preparing the exact replacement preview…</p>
            <div v-else-if="profileSwitchError" class="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <p>The registered profile could not be loaded, so this transition cannot be confirmed yet. {{ profileSwitchError }}</p>
              <Button variant="outline" size="sm" class="mt-2" @click="retryPendingProfile">Retry</Button>
            </div>
            <template v-else>
              <p v-if="!pendingPreview.length" class="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                No populated profile-owned fields need migration. Confirm the semantic profile change below.
              </p>
              <ul v-else class="mt-3 max-h-48 space-y-2 overflow-y-auto">
                <li v-for="({ item, target }, index) in pendingPreview" :key="`${item.propertyUri}:${index}`" class="rounded-md border border-border bg-card px-3 py-2 text-xs">
                  <p class="font-medium text-foreground">{{ item.label }}</p>
                  <p class="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">{{ item.propertyUri }}</p>
                  <p class="mt-1 text-muted-foreground">Saved value: {{ transitionValuePreview(item) }}</p>
                  <p v-if="target" class="mt-1 text-foreground">Moves into the new {{ target.label }} control because the property URI matches.</p>
                  <p v-else class="mt-1 text-foreground">Remains as custom metadata for review. Nothing is cleared.</p>
                </li>
              </ul>
              <details v-if="pendingReplacementText" class="mt-3 rounded-md border border-border bg-muted/20 p-2">
                <summary class="cursor-pointer text-xs font-medium text-foreground">Preview exact replacement crate</summary>
                <pre class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[10px] text-foreground">{{ pendingReplacementText }}</pre>
              </details>
              <p class="mt-2 text-[11px] text-muted-foreground">This local preview does not verify conformance. The server performs authoritative validation when the Profile tag is retained.</p>
            </template>

            <div class="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" @click="cancelProfileSwitch">Keep current profile</Button>
              <Button size="sm" :disabled="profileSwitchLoading || Boolean(profileSwitchError) || !pendingReplacementCrate" @click="confirmProfileSwitch">Confirm transition</Button>
            </div>
          </div>
        </div>
      </Transition>

      <SubcratePickerDialog
        v-model:open="subcratePickerOpen"
        :excluded-iris="subcrates.map((link) => link.iri)"
        :exclude-document-id="documentId"
        @select="onSubcratesPicked"
      />
    </DialogContent>
  </Dialog>
</template>
