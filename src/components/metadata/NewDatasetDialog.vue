<script setup lang="ts">
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DiscardDraftConfirm from '@/components/ui/DiscardDraftConfirm.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import CreateGroupDialog from '@/components/groups/CreateGroupDialog.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import DatasetFilesEditor from '@/components/metadata/DatasetFilesEditor.vue'
import DatasetEntityInstances from '@/components/metadata/DatasetEntityInstances.vue'
import ProfileControlField from '@/components/metadata/ProfileControlField.vue'
import LiftNotesPanel from '@/components/metadata/profile-builder/LiftNotesPanel.vue'
import CustomFieldsEditor from '@/components/metadata/CustomFieldsEditor.vue'
import SubcratePickerDialog from '@/components/metadata/SubcratePickerDialog.vue'
import ProfileValidationPreview from '@/components/metadata/ProfileValidationPreview.vue'
import { computed, ref, watch } from 'vue'
import { AlertTriangle, Check, FileJson, FileJson2, FileUp, Layers, Plus, Upload, X } from '@lucide/vue'
import {
  profileReferenceIri,
  profileRulesLoadState,
  serverValidationRequiredConstraints,
  useAruna,
} from '@/composables/useAruna'
import { useProfilePreview } from '@/composables/useProfilePreview'
import { analyzeCrateJson, type CrateImportPreview } from '@/lib/crateImport'
import {
  fileEntityForReference,
  takeSelectedContentReference,
  type ContentReferenceIdentity,
} from '@/lib/contentIdentity'
import { groupCustomFieldRows, type CustomFieldRow } from '@/lib/customFields'
import { addSubcrateLink, type SubcrateLink } from '@/lib/subcrates'
import {
  ApiError,
  profileValidationFindings,
  type MetadataDocumentListItem,
  type ProfileValidationFinding,
} from '@/lib/api'
import { crateGraph, crateRootId, type DataEntity } from '@/lib/dataEntities'
import type { MetadataDoc } from '@/data/types'
import { controlsFromRules, defaultControlValues, normalizeProfileValues } from '@/lib/profiles/controls'
import { emitEntityEntries, emitSelectObject, isHasPartUri, slugify, uniqueId } from '@/lib/profiles/emit'
import {
  effectiveEntryValues,
  entrySourcePolicy,
  type EntityEntry,
} from '@/lib/profiles/entityEntries'
import {
  cloneDraftValue,
  customRowsForDraft,
  draftItemPreview,
  draftValuePopulated,
  entityDraftPopulated,
  migrationTarget,
  type ProfileDraftItem,
  type ProfileDraftMigration,
} from '@/lib/profiles/migration'
import {
  countEntryErrors,
  entityTypeLabelFor,
  newEntityEntry,
  newRefEntry,
  seedEntries,
  subControlsFor,
  validateEntries,
  type EntryViolationNode,
} from '@/lib/profiles/entityTree'
import { licenseEntity } from '@/lib/profiles/rocrate'
import { mapPreviewFindings } from '@/lib/shacl/mapFindings'
import { cloneLiftNotes, type LiftNote } from '@/lib/shacl/lift'
import { buildProfileContext } from '@/lib/profiles/propertyCatalog'
import { isAbsoluteUri } from '@/lib/profiles/uri'
import { validateProfileData, validateRequiredInstances } from '@/lib/profiles/validate'
import { classifyRoCrateSpecIri } from '@/lib/rocrateVersions'
import {
  DX_PROFILE,
  RO_CRATE_PROFILE,
  type JsonSchema,
  type ProfileControl,
  type ProfileEntityRule,
  type ProfilePropertyRule,
  type ProfileViolation,
} from '@/lib/profiles/types'

// radix-vue reserves the empty string for a SelectItem's cleared state, so the
// "no profile" choice travels as this sentinel and maps back to '' on write.
const NO_PROFILE_VALUE = '__no_profile__'

const props = defineProps<{
  open: boolean
  defaultProfileId?: string
}>()

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'created', doc: MetadataDoc): void
}>()

const {
  groups,
  profiles,
  metadata,
  createMetadata,
  loadProfileCrate,
  profileCrateParses,
  saving,
  currentUser,
  apiBaseUrl,
  authToken,
  profileValidationCapabilities,
  loadProfileValidationCapabilities,
} = useAruna()

const groupId = ref('')
const profileId = ref('')
const path = ref('')
const title = ref('')
const description = ref('')
const datePublished = ref(new Date().toISOString().slice(0, 10))
const license = ref('https://creativecommons.org/licenses/by/4.0/')
const isPublic = ref(false)
const keywords = ref('')
const identifier = ref('')
const creators = ref<string[]>([])
interface DatasetDataReference {
  label: string
  url: string
  contentUrl?: string
  identity: ContentReferenceIdentity
}
const dataRefs = ref<DatasetDataReference[]>([])
// Typed extra root properties (shared CustomFieldsEditor rows).
const customFields = ref<CustomFieldRow[]>([])
const customFieldValues = computed(() => groupCustomFieldRows(customFields.value))
// Subcrate references (RO-Crate 1.2) selected during creation; composed into
// the built crate via the spec-conformant addSubcrateLink helper.
const subcrates = ref<SubcrateLink[]>([])
const subcratePickerOpen = ref(false)
const submitError = ref<string | null>(null)
const serverFindings = ref<ProfileValidationFinding[]>([])
const profiledWriteUnavailable = ref(false)
const profiledWriteRejected = ref(false)
const createGroupOpen = ref(false)
const profileSchema = ref<JsonSchema | undefined>()
const profileControls = ref<ProfileControl[]>([])
// The raw Dataset property rules behind profileControls, kept so hasPart rules can
// be detected by propertyUri (isHasPartUri) and their requiredInstances validated
// — ProfileControl carries neither propertyUri nor a way back to the rule.
const profileDatasetRules = ref<ProfilePropertyRule[]>([])
const profileEntityRules = ref<ProfileEntityRule[]>([])
const profileContextTerms = ref<Record<string, string>>({})
const generatedValues = ref<Record<string, unknown>>({})
// Combined reuse-or-create entry lists, keyed by the entity control property
// (valueName). Each entry is either a described-new instance (sub-form values)
// or a reuse reference (external URI / crate data-reference id), per the
// rule's entitySources policy (plan Phase 4).
const entityEntries = ref<Record<string, EntityEntry[]>>({})
// SHACL shapes texts of the active profile (generated shapes.ttl + attached
// shapes.custom.ttl), driving the deep-validation worker. Empty when the
// profile carries none (e.g. a legacy v2 crate): deep validation then stays off.
const profileShapes = ref<string[]>([])
const profileAdditionalRequirements = ref<LiftNote[]>([])
const profileLoading = ref(false)
const profileLoadError = ref<string | null>(null)
// True when the full-crate load (or its S3 artifact resolution) FAILED — as
// opposed to the informational "profile has no machine-readable rules" case.
// The initial summary parse structurally contains zero profile rules (the
// backend summary strips File entities), so a failed refinement means the form
// is silently missing fields; that state blocks the generated section AND
// submission until a retry succeeds or the profile is deselected.
const profileLoadFailed = ref(false)
const profileLoadComplete = ref(false)
const profileSwitchOpen = ref(false)
const profileSwitchLoading = ref(false)
const profileSwitchError = ref<string | null>(null)
const pendingProfileId = ref<string | null>(null)
const pendingProfileDraft = ref<ProfileDraftItem[]>([])
const pendingProfileTargetRules = ref<ProfilePropertyRule[]>([])
const pendingProfileTargetEntityRules = ref<ProfileEntityRule[]>([])
const profileMigrationSummary = ref<{ migrated: number; preserved: number } | null>(null)
let profileLoadToken = 0
let profileSwitchToken = 0
let queuedProfileMigration: ProfileDraftMigration | undefined

const builtInDatasetKeys = new Set(['name', 'description', 'datePublished', 'license'])
// `hasPart` is NOT reserved: a profile hasPart rule binds to the always-present
// Data references section (which owns hasPart emission) instead of colliding.
const reservedDatasetKeys = new Set(['@id', '@type', 'conformsTo'])

const groupOptions = computed(() => groups.value.map((group) => ({ value: group.id, label: group.name })))
const profileOptions = computed(() => [
  { value: NO_PROFILE_VALUE, label: 'No profile reference' },
  ...profiles.value.map((profile) => {
    // Count every entity rule's properties — the same total ProfilesView shows —
    // not just the root Dataset rules.
    const count = profile.entityRules.length
      ? profile.entityRules.reduce((sum, rule) => sum + rule.propertyRules.length, 0)
      : profile.propertyRules.length
    return { value: profile.id, label: `${profile.name}${count ? ` (${count} properties)` : ''}` }
  }),
])
const profileSelection = computed({
  get: () => profileId.value || NO_PROFILE_VALUE,
  set: (next: string) => {
    void requestProfileSwitch(next === NO_PROFILE_VALUE ? '' : next)
  },
})
const selectedProfile = computed(() => profiles.value.find((profile) => profile.id === profileId.value))
const serverRequiredConstraints = computed(() =>
  serverValidationRequiredConstraints(profileShapes.value, profileValidationCapabilities.value),
)
const pendingProfile = computed(() => profiles.value.find((profile) => profile.id === pendingProfileId.value))
const pendingProfileTargetControls = computed(() =>
  controlsFromRules(pendingProfileTargetRules.value, pendingProfileTargetEntityRules.value),
)
const profileSwitchPreview = computed(() => pendingProfileDraft.value.map((item) => ({
  item,
  target: migrationTarget(item, pendingProfileTargetRules.value, pendingProfileTargetControls.value),
})))

const keywordList = computed(() => keywords.value.split(',').map((keyword) => keyword.trim()).filter(Boolean))
const creatorList = computed(() => creators.value.map((name) => name.trim()).filter(Boolean))
const dataRefList = computed(() =>
  dataRefs.value
    .map((entry) => ({
      label: entry.label.trim(),
      url: entry.url.trim(),
      contentUrl: entry.contentUrl?.trim() || undefined,
      identity: entry.identity,
    }))
    .filter((entry) => entry.url),
)
// Bridge the shared files editor onto the existing {label,url} model so buildRoCrate
// keeps emitting hasPart File entities from `dataRefs`; per-file details are omitted
// here (`detailed: false`) because the create emit shape carries only id + name.
const filesModel = computed<DataEntity[]>({
  get: () => dataRefs.value.map((entry) => ({
    id: entry.url,
    name: entry.label,
    types: ['File'],
    contentUrl: entry.contentUrl,
  })),
  set: (next) => {
    const previous = new Map(dataRefs.value.map((entry) => [entry.url, entry]))
    dataRefs.value = next.map((file) => {
      const existing = previous.get(file.id)
      if (existing) {
        return { ...existing, label: file.name, contentUrl: file.contentUrl ?? existing.contentUrl }
      }
      const selected = takeSelectedContentReference(file.id)
      return {
        label: file.name,
        url: file.id,
        contentUrl: selected?.contentUrl,
        identity: selected?.identity ?? 'external',
      }
    })
  },
})
const locationIdentityRefs = computed(() => dataRefList.value.filter((entry) => entry.identity === 'location'))
// A labelled reference needs a URL, and every supplied URL must be an absolute
// URI (http(s)://, s3://, …) so it emits as a valid `{"@id"}` reference.
function dataRefUrlError(entry: { label: string; url: string }): boolean {
  const url = entry.url.trim()
  if (!url) return Boolean(entry.label.trim())
  return !isAbsoluteUri(url)
}
const dataRefsValid = computed(() => dataRefs.value.every((entry) => !dataRefUrlError(entry)))
// Dataset rules targeting schema.org/hasPart. Only ENTITY-kind hasPart rules bind
// to the always-present Data references section (which owns hasPart emission);
// they are excluded from the generic control lists below and their required
// instances validated against the data references. A NON-entity (scalar/url)
// hasPart rule can't be represented by that section and would collide with its
// hasPart emission, so it is surfaced as a blocking configuration collision (M5),
// exactly the way reserved keys are — never a silent brick.
const hasPartDatasetRules = computed(() => profileDatasetRules.value.filter((rule) => isHasPartUri(rule.propertyUri)))
const hasPartRules = computed(() => hasPartDatasetRules.value.filter((rule) => rule.kind === 'entity'))
const hasPartScalarCollisionKeys = computed(() => hasPartDatasetRules.value.filter((rule) => rule.kind !== 'entity').map((rule) => rule.valueName))
const hasPartProperties = computed(() => new Set(hasPartRules.value.map((rule) => rule.valueName)))

// Scalar profile inputs rendered in the grid; entity-ref controls become their
// own card-list / reference editors and are excluded here. Built-in dataset keys
// stay on the scaffold inputs; hasPart binds to Data references.
const generatedScalarControls = computed(() =>
  profileControls.value.filter(
    (control) => control.control !== 'entity' && !builtInDatasetKeys.has(control.property) && !hasPartProperties.value.has(control.property),
  ),
)
const entityControls = computed(() =>
  profileControls.value.filter(
    (control) => control.control === 'entity' && !builtInDatasetKeys.has(control.property) && !hasPartProperties.value.has(control.property),
  ),
)
// Crate-local pick options for reuse entries: the current data references,
// whose `{"@id"}` is the reference url (the same id the hasPart File entity
// carries), so a crate reference resolves to that entity.
const crateOptions = computed(() => dataRefList.value.map((entry) => ({ value: entry.url, label: entry.label || entry.url })))
// The ids a crate reuse reference may resolve to right now (stale ids are
// pruned from validation and emission, M4).
const crateIdSet = computed(() => new Set(dataRefList.value.map((entry) => entry.url)))

// Data references as `{ id, name }` candidates for hasPart required-instance
// matching. Built EXACTLY the way buildRoCrate names/ids the hasPart File entities
// (@id = url, name = label || url) so validation agrees with emission.
const hasPartEntries = computed(() => dataRefList.value.map((entry) => ({ id: entry.url, name: entry.label || entry.url })))
// Blocking (MUST) / warning (SHOULD) violations for each required instance a
// hasPart rule does not find among the data references.
const hasPartRequiredViolations = computed<ProfileViolation[]>(() =>
  hasPartRules.value.flatMap((rule) => validateRequiredInstances(rule, hasPartEntries.value)),
)
// The profile's required contents, shown as a checklist beside the Data references
// section with a satisfied flag and severity (unsatisfied → error/warning).
const hasPartRequirements = computed(() =>
  hasPartRules.value.flatMap((rule) => {
    // Severity comes straight from validateRequiredInstances (all of a rule's
    // instances share one severity) so the checklist never drifts from the gating
    // logic — MUST → error, SHOULD/MAY → warning (H3). Empty entries yield a
    // violation per non-empty instance; its severity is the rule's severity.
    const severity: ProfileViolation['severity'] = validateRequiredInstances(rule, [])[0]?.severity ?? 'error'
    return (rule.requiredInstances ?? [])
      .filter((instance) => instance.name || instance.id)
      .map((instance) => ({
        key: `${rule.valueName}:${instance.id ?? instance.name}`,
        label: instance.name ?? instance.id ?? '',
        hint: instance.hint,
        severity,
        satisfied: hasPartEntries.value.some(
          (entry) => (instance.id ? entry.id === instance.id : false) || (instance.name ? entry.name === instance.name : false),
        ),
      }))
  }),
)
// Sub-form controls per top-level entity control; nested depths derive theirs
// through the same subControlsFor inside DatasetEntityInstances.
const entitySubControls = computed<Record<string, ProfileControl[]>>(() => {
  const map: Record<string, ProfileControl[]> = {}
  for (const control of entityControls.value) {
    map[control.property] = subControlsFor(control, profileEntityRules.value)
  }
  return map
})

// The values record fed to the Dataset schema validator: scalar profile values
// plus each entity control's effective entry values, so presence and list
// cardinality act on the COMBINED entry count (described-new instances always
// count; reuse blanks and stale crate ids are pruned — H1/M4 — so validation
// matches what will actually be emitted).
const normalizedGeneratedValues = computed(() => {
  const values: Record<string, unknown> = {
    ...coreProfileValues(),
    ...normalizeProfileValues(generatedValues.value, generatedScalarControls.value),
  }
  for (const control of entityControls.value) {
    const effective = effectiveEntryValues(
      entityEntries.value[control.property] ?? [],
      entrySourcePolicy(control.entitySources),
      crateIdSet.value,
    )
    values[control.property] = control.multiple ? effective : effective[0] ?? ''
  }
  // hasPart: the data references drive the rule's presence + cardinality (the
  // required-instance contents are validated separately via validateRequiredInstances).
  for (const rule of hasPartRules.value) {
    values[rule.valueName] = hasPartEntries.value
  }
  // select-object controls hold a chosen @id (a reference), not a scalar, so
  // normalizeProfileValues skips them; surface the value so its required/
  // recommended presence check fires (empty = missing).
  for (const control of generatedScalarControls.value) {
    if (control.control === 'select-object') values[control.property] = generatedValues.value[control.property]
  }
  return values
})
const generatedCreateValues = computed(() => normalizeProfileValues(generatedValues.value, generatedScalarControls.value, { omitEmpty: true }))
// Warnings inside come from SHOULD/recommended rules; they never block
// submission (see canSubmit) and surface inline at their inputs.
const profileViolations = computed(() => validateProfileData(profileSchema.value, normalizedGeneratedValues.value))
const profileCollisionKeys = computed(() => profileControls.value.map((control) => control.property).filter((property) => reservedDatasetKeys.has(property)))

// Per-entry violation trees for every entity control, keyed by control
// property; outer array index aligns with the entry index. validateEntries
// recurses through nested sub-forms: described-new entries get the target
// shape's scalar validation, flat reference-format checks and nested trees;
// reuse entries get the reference-format check ONLY (reuse-by-URI is never
// re-validated against the shape — plan 5.4, stated in the UI).
const entityEntryViolations = computed<Record<string, EntryViolationNode[]>>(() => {
  const ctx = { entityRules: profileEntityRules.value, crateIds: crateIdSet.value }
  const map: Record<string, EntryViolationNode[]> = {}
  for (const control of entityControls.value) {
    map[control.property] = validateEntries(entityEntries.value[control.property] ?? [], control, ctx, 1)
  }
  return map
})
const entityEntryErrorCount = computed(() => {
  let count = 0
  for (const nodes of Object.values(entityEntryViolations.value)) count += countEntryErrors(nodes)
  return count
})

// Schema presence / cardinality violations that target a hasPart rule, surfaced at
// the Data references section (hasPart has no generic control of its own).
// Mapped deep-validation findings for hasPart append here too (display-only).
const hasPartSchemaViolations = computed(() => [
  ...profileViolations.value.filter((violation) => hasPartProperties.value.has(violation.fieldId ?? '')),
  ...[...hasPartProperties.value].flatMap((property) => previewViolationsFor(property)),
])

const profileInputCount = computed(() => generatedScalarControls.value.length + entityControls.value.length)
const profileHasRules = computed(() => Boolean(
  profileEntityRules.value.length
    || profileDatasetRules.value.length
    || profileSchema.value
    || profileShapes.value.length,
))
const profileRuleState = computed(() => profileRulesLoadState({
  loading: profileLoading.value,
  unavailable: profileLoadFailed.value,
  complete: profileLoadComplete.value,
  hasRules: profileHasRules.value,
}))

// Value names the profile itself defines; when it covers author/keywords/
// identifier the matching built-in scaffold input is hidden (the profile control
// takes over) rather than colliding.
const profileValueNames = computed(() => new Set(profileControls.value.map((control) => control.property)))
const showAuthorsScaffold = computed(() => !profileValueNames.value.has('author'))
const showKeywordsScaffold = computed(() => !profileValueNames.value.has('keywords'))
const showIdentifierScaffold = computed(() => !profileValueNames.value.has('identifier'))
// M3: a profile Dataset rule that constrains license to a fixed set (enum /
// select-url) renders its Select in place of the free-text License URL scaffold,
// two-way bound to `license` (the value crate emission uses). `license` is a
// built-in key, so this control is filtered out of generatedScalarControls and
// would otherwise be invisible — only the after-the-fact enum error would show.
const licenseControl = computed(() =>
  profileControls.value.find(
    (control) => control.property === 'license' && (control.kind === 'enum' || control.kind === 'select-url') && (control.enumOptions?.length ?? 0) > 0,
  ),
)
// Violations surfaced on the license Select: the built-in profile violations (enum
// mismatch) plus the RO-Crate-root required error, so display matches gating.
const licenseControlViolations = computed<ProfileViolation[]>(() => {
  const out = [...(builtInViolations.value.license ?? [])]
  if (scaffoldFieldErrors.value.license) {
    out.unshift({ ruleId: 'required', pointer: '/license', fieldId: 'license', message: scaffoldFieldErrors.value.license, severity: 'error' })
  }
  return out
})
const hasEntityEntries = computed(() =>
  entityControls.value.some(
    (control) =>
      effectiveEntryValues(
        entityEntries.value[control.property] ?? [],
        entrySourcePolicy(control.entitySources),
        crateIdSet.value,
      ).length > 0,
  ),
)

// The spec's subjectOf fallback needs a URL that resolves to the child's crate
// JSON; the portal serves it at GET /metadata/{id}/rocrate.
function crateJsonUrl(documentId: string): string {
  return `${apiBaseUrl.value.replace(/\/+$/, '')}/metadata/${encodeURIComponent(documentId)}/rocrate`
}

function subcrateTitleOf(item: MetadataDocumentListItem): string {
  return metadata.value.find((doc) => doc.ulid === item.document_id)?.title || item.document_path
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

// Anything beyond the scaffold fields requires submitting a full RO-Crate.
const needsRoCrate = computed(() =>
  Boolean(
    profileId.value
      || (showKeywordsScaffold.value && keywordList.value.length)
      || (showAuthorsScaffold.value && creatorList.value.length)
      || (showIdentifierScaffold.value && identifier.value.trim())
      || dataRefList.value.length
      || hasEntityEntries.value
      || Object.keys(generatedCreateValues.value).length
      || Object.keys(customFieldValues.value).length
      || subcrates.value.length,
  ),
)

// A selected profile whose rules are unavailable cannot safely generate or
// validate its inputs, so loading and failed states gate submission until Retry
// succeeds or the profile reference is removed. A completed profile with no
// rules is distinct and remains non-blocking.
// An RO-Crate root MUST carry description, datePublished and license, so an empty
// `license: {"@id": ""}` can never be emitted. Only enforced when a full crate is
// actually built (needsRoCrate); the scaffold path uses the API fields directly.
const roCrateRootValid = computed(
  () => !needsRoCrate.value || Boolean(description.value.trim() && datePublished.value && license.value.trim()),
)

const canSubmit = computed(() => Boolean(
  currentUser.value
    && groupId.value
    && path.value.trim()
    && title.value.trim()
    && dataRefsValid.value
    && roCrateRootValid.value
    && !profileLoading.value
    && !profileLoadFailed.value
    && !profileCollisionKeys.value.length
    && !hasPartScalarCollisionKeys.value.length
    && !profileViolations.value.some((violation) => violation.severity === 'error')
    && !entityEntryErrorCount.value
    && !hasPartRequiredViolations.value.some((violation) => violation.severity === 'error'),
))

// Field-anchored blocking errors for the built-in scaffold inputs, derived from
// the same conditions as canSubmit so the two never drift. Rendered inline at
// each input; the footer line only summarizes counts and field-less reasons.
const scaffoldFieldErrors = computed<Record<string, string>>(() => {
  const errors: Record<string, string> = {}
  if (!groupId.value) errors.group = 'Choose a group for the dataset.'
  if (!title.value.trim()) errors.title = 'Enter a title.'
  if (!path.value.trim()) errors.path = 'Enter a document path.'
  if (needsRoCrate.value && !description.value.trim()) errors.description = 'Required for the RO-Crate root.'
  if (needsRoCrate.value && !datePublished.value) errors.datePublished = 'Required for the RO-Crate root.'
  if (needsRoCrate.value && !license.value.trim()) errors.license = 'Required for the RO-Crate root.'
  return errors
})

// Profile violations that target the built-in fields (a profile may validate
// name/description/datePublished/license too); attached to the scaffold inputs.
// Deep-validation findings mapped to these fields ride along (display-only,
// already deduplicated against the bespoke set).
const builtInViolations = computed<Record<string, ProfileViolation[]>>(() => {
  const map: Record<string, ProfileViolation[]> = {}
  for (const violation of profileViolations.value) {
    const fieldId = violation.fieldId ?? ''
    if (!builtInDatasetKeys.has(fieldId)) continue
    ;(map[fieldId] ??= []).push(violation)
  }
  for (const [fieldId, violations] of Object.entries(previewMapped.value.inline)) {
    if (builtInDatasetKeys.has(fieldId)) (map[fieldId] ??= []).push(...violations)
  }
  return map
})

// Invalid state for a scaffold input: a blocking scaffold error, else the
// strongest built-in profile violation. violationKey maps the input to its
// dataset property (Title → name).
function scaffoldInvalid(key: string, violationKey?: string): 'error' | 'warning' | undefined {
  if (scaffoldFieldErrors.value[key]) return 'error'
  const violations = builtInViolations.value[violationKey ?? key] ?? []
  if (violations.some((violation) => violation.severity === 'error')) return 'error'
  if (violations.length) return 'warning'
  return undefined
}

// The footer summary: field-anchored problems are marked inline at their
// inputs, so this only carries a count plus the reasons with no field anchor.
const submitBlockerSummary = computed<string[]>(() => {
  const parts: string[] = []
  const fieldErrorCount =
    Object.keys(scaffoldFieldErrors.value).length
    + profileViolations.value.filter((violation) => violation.severity === 'error' && !builtInDatasetKeys.has(violation.fieldId ?? '')).length
    + entityEntryErrorCount.value
    + hasPartRequiredViolations.value.filter((violation) => violation.severity === 'error').length
    + dataRefs.value.filter(dataRefUrlError).length
  if (fieldErrorCount) parts.push(`${fieldErrorCount} ${fieldErrorCount === 1 ? 'field needs' : 'fields need'} attention (marked at the inputs).`)
  if (profileLoading.value) parts.push('Waiting for the profile rules to finish loading.')
  if (profileLoadFailed.value) parts.push('The profile rules could not be loaded, retry above or choose "No profile reference".')
  return parts
})

// Authored profile fields whose valueName collides with a built-in scaffold key:
// the scaffold input claims the value, so the author's label, input kind and
// constraints are partially dropped. Surfaced as a visible warning. The license
// enum/select-url case is handled properly (licenseControl) and excluded.
const scaffoldClaimedKeys = computed(() =>
  profileControls.value
    .map((control) => control.property)
    .filter((property) => builtInDatasetKeys.has(property))
    .filter((property) => !(property === 'license' && licenseControl.value)),
)

// --- Server validation preview: the exact crate buildRoCrate would save, sent
// to the node's advisory preview endpoint. Debounced on every form change while
// a profile is active, plus the explicit "Run preview" action. Findings NEVER
// gate submission — the bespoke validator above stays the synchronous first
// line, and the write path validates authoritatively.
const {
  result: previewResult,
  running: previewRunning,
  unavailable: previewUnavailable,
  error: previewError,
  preview: previewDraft,
  previewNow: previewDraftNow,
  reset: previewReset,
} = useProfilePreview({ client: () => ({ baseUrl: apiBaseUrl.value, token: authToken.value }) })

const crateForValidation = computed(() => (profileId.value && !profileLoading.value ? buildRoCrate() : null))
watch(crateForValidation, (crate) => {
  if (!props.open || !crate) return
  previewDraft(crate)
})

function validateAgainstProfile() {
  if (!profileId.value) return
  previewDraftNow(buildRoCrate())
}

// Findings resolvable to a rendered Dataset control render inline next to it,
// deduplicated against the bespoke messages by field + severity; the rest
// lands in the preview panel below.
const previewMapped = computed(() =>
  mapPreviewFindings(previewResult.value?.findings ?? [], profileDatasetRules.value, profileViolations.value),
)
function previewViolationsFor(property: string): ProfileViolation[] {
  return previewMapped.value.inline[property] ?? []
}
const previewInlineCount = computed(() =>
  Object.values(previewMapped.value.inline).reduce((total, list) => total + list.length, 0),
)

// ── Import-crate mode ────────────────────────────────────────────────────────
// Very prominent alternative to authoring from scratch: an uploaded or pasted
// ro-crate-metadata.json becomes a NEW document (group + path + visibility
// chosen here; the crate is submitted verbatim). Validation and the preview
// summary come from the shared lib the detail-page import uses too.
const startTab = ref<'create' | 'import'>('create')
const importFileInput = ref<HTMLInputElement | null>(null)
const importPaste = ref('')
const importError = ref('')
const importPreview = ref<CrateImportPreview | null>(null)
const unrecognizedImportProfiles = computed(() =>
  (importPreview.value?.conformsToIds ?? []).filter(
    (iri) => !profiles.value.some(
      (profile) => profileReferenceIri(profile) === iri || profile.profileUri === iri || profile.graphIri === iri,
    ),
  ),
)
const importPath = ref('')
const importPathTouched = ref(false)

function importPreviewFrom(text: string, source: string) {
  importError.value = ''
  try {
    importPreview.value = analyzeCrateJson(text, source)
    // Prefill the document path from the crate's root name until edited.
    if (!importPathTouched.value || !importPath.value.trim()) {
      importPath.value = `datasets/${slugify(importPreview.value.rootName) || 'imported-crate'}`
      importPathTouched.value = false
    }
  } catch (err) {
    importPreview.value = null
    importError.value = err instanceof Error ? err.message : String(err)
  }
}

function onImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => importPreviewFrom(String(reader.result), file.name)
  reader.onerror = () => {
    importError.value = 'Could not read that file.'
  }
  reader.readAsText(file)
  // Reset so re-selecting the same file fires change again.
  input.value = ''
}

const canSubmitImport = computed(() =>
  Boolean(currentUser.value && groupId.value && importPath.value.trim() && importPreview.value),
)

function profileReferenceId(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const id = (value as Record<string, unknown>)['@id']
    return typeof id === 'string' ? id : ''
  }
  return ''
}

function withoutProfileTag(crate: unknown): unknown {
  const clone = structuredClone(crate)
  const rootId = crateRootId(clone)
  const root = rootId ? crateGraph(clone).find((entity) => entity['@id'] === rootId) : undefined
  if (!root?.conformsTo) return clone
  const references = Array.isArray(root.conformsTo) ? root.conformsTo : [root.conformsTo]
  const retained = references.filter((reference) => {
    const iri = profileReferenceId(reference)
    return !iri || classifyRoCrateSpecIri(iri).kind !== 'non-spec'
  })
  if (retained.length) root.conformsTo = retained
  else delete root.conformsTo
  return clone
}

function hasProfileTag(crate: unknown): boolean {
  const rootId = crateRootId(crate)
  const root = rootId ? crateGraph(crate).find((entity) => entity['@id'] === rootId) : undefined
  const references = Array.isArray(root?.conformsTo)
    ? root.conformsTo
    : root?.conformsTo
      ? [root.conformsTo]
      : []
  return references.some((reference) => {
    const iri = profileReferenceId(reference)
    return Boolean(iri && classifyRoCrateSpecIri(iri).kind === 'non-spec')
  })
}

function clearProfileWriteFailure() {
  submitError.value = null
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
  submitError.value = profiledWriteRejected.value
    ? unavailable
      ? 'The server did not save this profiled write because Profile validation is unavailable.'
      : 'The server rejected this profiled write.'
    : error instanceof Error
      ? error.message
      : String(error)
}

async function submitImport(unprofiled = false) {
  const pending = importPreview.value
  if (!pending || !canSubmitImport.value) return
  clearProfileWriteFailure()
  const rocrate = unprofiled ? withoutProfileTag(pending.crate) : pending.crate
  const profiled = hasProfileTag(rocrate)
  try {
    const created = await createMetadata({
      group_id: groupId.value,
      path: importPath.value.trim(),
      public: isPublic.value,
      rocrate,
    })
    const doc = metadata.value.find((item) => item.ulid === created.document_id) ?? {
      ulid: created.document_id,
      title: pending.rootName,
      description: '',
      type: 'Dataset',
      license: '',
      keywords: [],
      currentVersion: 1,
      versions: [],
      linkedObjects: [],
      primaryBucketId: '',
      realmId: created.group_id,
      createdAt: created.created_at,
      updatedAt: created.updated_at,
      author: currentUser.value?.name ?? '',
      organization: currentUser.value?.affiliation ?? '',
      nodeId: '',
      profileId: '',
      profileIds: [],
      contributors: [],
      roCrate: rocrate,
    }
    emit('created', doc)
    emit('update:open', false)
  } catch (err) {
    showProfileWriteFailure(err, profiled)
  }
}

function retryProfiledWrite() {
  if (startTab.value === 'import') void submitImport()
  else void submit()
}

function saveUnprofiled() {
  if (startTab.value === 'import') void submitImport(true)
  else void submit(true)
}

// Dialog discard guard: outside clicks never close the dialog; an explicit close
// (X, Escape, Cancel) while the form holds draft content asks before discarding.
// Cheap check over existing computeds only, no deep watching. Seeded defaults
// (group, date published, license, profile reference) are not treated as edits.
const confirmDiscardOpen = ref(false)
const hasDraftProgress = computed(() => Boolean(
  startTab.value === 'import'
    ? importPaste.value.trim() || importPreview.value
    : title.value.trim()
      || description.value.trim()
      || keywordList.value.length
      || creatorList.value.length
      || identifier.value.trim()
      || dataRefList.value.length
      || hasEntityEntries.value
      || Object.keys(generatedCreateValues.value).length
      || Object.keys(customFieldValues.value).length
      || subcrates.value.length,
))
function requestClose(next: boolean) {
  if (next) {
    emit('update:open', true)
    return
  }
  if (profileSwitchOpen.value) {
    cancelProfileSwitch()
    return
  }
  if (hasDraftProgress.value) {
    confirmDiscardOpen.value = true
    return
  }
  emit('update:open', false)
}
function discardDraft() {
  confirmDiscardOpen.value = false
  emit('update:open', false)
}

function snapshotProfileDraft(): ProfileDraftItem[] {
  const controls = new Map(profileControls.value.map((control) => [control.property, control]))
  const items: ProfileDraftItem[] = []
  for (const rule of profileDatasetRules.value) {
    if (builtInDatasetKeys.has(rule.valueName) || isHasPartUri(rule.propertyUri)) continue
    const control = controls.get(rule.valueName)
    if (!control) continue
    if (control.control === 'entity') {
      const entries = (entityEntries.value[control.property] ?? []).filter(entityDraftPopulated)
      if (!entries.length) continue
      items.push({
        property: control.property,
        propertyUri: rule.propertyUri,
        label: control.label,
        kind: 'entity',
        value: cloneDraftValue(entries),
        multiple: control.multiple,
        valueKind: control.kind,
      })
      continue
    }
    const raw = generatedValues.value[control.property]
    const value = control.control === 'select-object'
      ? cloneDraftValue(raw)
      : normalizeProfileValues({ [control.property]: raw }, [control], { omitEmpty: true })[control.property]
    if (!draftValuePopulated(value)) continue
    items.push({
      property: control.property,
      propertyUri: rule.propertyUri,
      label: control.label,
      kind: 'generated',
      value: cloneDraftValue(value),
      multiple: control.multiple,
      valueKind: control.kind,
    })
  }
  return items
}

async function requestProfileSwitch(nextId: string) {
  if (nextId === profileId.value || profileSwitchOpen.value) return
  const items = snapshotProfileDraft()
  if (!items.length) {
    commitProfileSwitch(nextId, { items, targetRules: [] })
    return
  }

  const token = ++profileSwitchToken
  pendingProfileId.value = nextId
  pendingProfileDraft.value = items
  pendingProfileTargetRules.value = []
  pendingProfileTargetEntityRules.value = []
  profileSwitchError.value = null
  profileSwitchLoading.value = true
  profileSwitchOpen.value = true

  const target = profiles.value.find((profile) => profile.id === nextId)
  try {
    if (!target) return
    if (target.documentId) {
      const parsed = await loadProfileCrate(target.documentId)
      if (token !== profileSwitchToken) return
      pendingProfileTargetRules.value = parsed.datasetPropertyRules
      pendingProfileTargetEntityRules.value = parsed.entityRules
    } else {
      pendingProfileTargetRules.value = target.propertyRules
      pendingProfileTargetEntityRules.value = target.entityRules
    }
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
  pendingProfileId.value = null
  pendingProfileDraft.value = []
}

function confirmProfileSwitch() {
  if (profileSwitchLoading.value || pendingProfileId.value === null) return
  const nextId = pendingProfileId.value
  const migration: ProfileDraftMigration = {
    items: cloneDraftValue(pendingProfileDraft.value),
    targetRules: cloneDraftValue(pendingProfileTargetRules.value),
  }
  cancelProfileSwitch()
  commitProfileSwitch(nextId, migration)
}

function commitProfileSwitch(nextId: string, migration: ProfileDraftMigration) {
  ++profileLoadToken
  resetGeneratedProfileFields()
  queuedProfileMigration = migration
  profileMigrationSummary.value = null
  profileId.value = nextId
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    confirmDiscardOpen.value = false
    ++profileSwitchToken
    profileSwitchOpen.value = false
    profileSwitchLoading.value = false
    profileSwitchError.value = null
    pendingProfileId.value = null
    pendingProfileDraft.value = []
    profileMigrationSummary.value = null
    queuedProfileMigration = undefined
    startTab.value = 'create'
    importPaste.value = ''
    importError.value = ''
    importPreview.value = null
    importPath.value = ''
    importPathTouched.value = false
    groupId.value = groups.value[0]?.id ?? ''
    profileId.value = props.defaultProfileId ?? currentUser.value?.preferredProfileId ?? ''
    path.value = ''
    title.value = ''
    description.value = ''
    datePublished.value = new Date().toISOString().slice(0, 10)
    license.value = 'https://creativecommons.org/licenses/by/4.0/'
    isPublic.value = false
    keywords.value = ''
    identifier.value = ''
    creators.value = []
    dataRefs.value = []
    customFields.value = []
    subcrates.value = []
    subcratePickerOpen.value = false
    clearProfileWriteFailure()
    resetGeneratedProfileFields()
    void loadProfileValidationCapabilities().catch(() => undefined)
    void loadSelectedProfileSchema()
  },
  { immediate: true },
)

watch(profileId, () => {
  const migration = queuedProfileMigration
  queuedProfileMigration = undefined
  if (props.open) void loadSelectedProfileSchema(false, migration)
})

function fillPath() {
  if (!title.value.trim() || path.value.trim()) return
  path.value = `datasets/${slugify(title.value)}`
}

async function loadSelectedProfileSchema(force = false, migration?: ProfileDraftMigration) {
  const token = ++profileLoadToken
  resetGeneratedProfileFields()
  const profile = selectedProfile.value
  if (!profile) {
    if (migration) applyProfileDraftMigration(migration, true)
    return
  }

  // Apply the summary-parsed rules immediately, then refine from the full crate.
  const cached = profile.documentId ? profileCrateParses.value[profile.documentId] : undefined
  applyParsedProfile(
    profile.entityRules,
    profile.propertyRules,
    profile.schema,
    profile.contextTerms,
    shapesList(profile.shapesText, profile.customShapesText),
    cloneLiftNotes(cached?.liftNotes ?? []),
    Boolean(migration),
  )
  profileLoadComplete.value = Boolean(!profile.documentId || cached)
  if (!profile.documentId) {
    if (migration) applyProfileDraftMigration(migration)
    return
  }

  profileLoading.value = true
  profileLoadError.value = null
  profileLoadFailed.value = false
  try {
    const parsed = await loadProfileCrate(profile.documentId, { force })
    if (token !== profileLoadToken) return
    applyParsedProfile(
      parsed.entityRules,
      parsed.datasetPropertyRules,
      parsed.schema,
      parsed.contextTerms,
      shapesList(parsed.shapesText, parsed.customShapesText),
      parsed.liftNotes,
      Boolean(migration),
    )
    profileLoadComplete.value = true
    if (migration) applyProfileDraftMigration(migration)
  } catch (err) {
    if (token !== profileLoadToken) return
    profileLoadError.value = err instanceof Error ? err.message : String(err)
    profileLoadFailed.value = true
    profileLoadComplete.value = false
    if (migration) applyProfileDraftMigration(migration, true)
  } finally {
    if (token === profileLoadToken) profileLoading.value = false
  }
}

function resetGeneratedProfileFields() {
  profileSchema.value = undefined
  profileControls.value = []
  profileDatasetRules.value = []
  profileEntityRules.value = []
  profileContextTerms.value = {}
  generatedValues.value = {}
  entityEntries.value = {}
  profileShapes.value = []
  profileAdditionalRequirements.value = []
  previewReset()
  profileLoadError.value = null
  profileLoadFailed.value = false
  profileLoadComplete.value = false
  // Clear the in-flight flag too, so switching to "No profile reference" mid-load
  // never leaves the Create button stuck behind a phantom loading state.
  profileLoading.value = false
}

function applyProfileDraftMigration(migration: ProfileDraftMigration, forceCustom = false) {
  const nextGenerated = { ...generatedValues.value }
  const nextEntities = { ...entityEntries.value }
  const preservedRows: CustomFieldRow[] = []
  let migrated = 0
  let preserved = 0

  for (const item of migration.items) {
    const target = forceCustom
      ? undefined
      : migrationTarget(item, migration.targetRules, profileControls.value)
    if (!target) {
      preservedRows.push(...customRowsForDraft(item))
      preserved += 1
      continue
    }
    if (item.kind === 'entity') {
      nextEntities[target.property] = cloneDraftValue(item.value as EntityEntry[])
    } else {
      const value = cloneDraftValue(item.value)
      nextGenerated[target.property] = target.multiple
        ? Array.isArray(value) ? value : [value]
        : Array.isArray(value) ? value[0] : value
    }
    migrated += 1
  }

  generatedValues.value = nextGenerated
  entityEntries.value = nextEntities
  if (preservedRows.length) customFields.value = [...customFields.value, ...preservedRows]
  if (migration.items.length) profileMigrationSummary.value = { migrated, preserved }
}

function shapesList(...texts: Array<string | undefined>): string[] {
  return [...new Set(texts.filter((text): text is string => Boolean(text?.trim())))]
}

function applyParsedProfile(
  entityRules: ProfileEntityRule[],
  datasetPropertyRules: ProfilePropertyRule[],
  schema: JsonSchema | undefined,
  contextTerms: Record<string, string> | undefined,
  shapes: string[],
  additionalRequirements: LiftNote[] = [],
  preserveDatasetFields = false,
) {
  profileShapes.value = shapes
  profileAdditionalRequirements.value = additionalRequirements
  profileSchema.value = schema
  profileDatasetRules.value = datasetPropertyRules
  profileEntityRules.value = entityRules
  profileContextTerms.value = contextTerms ?? {}
  const controls = controlsFromRules(datasetPropertyRules, entityRules)
  profileControls.value = controls
  const scalarControls = controls.filter((control) => control.control !== 'entity')
  generatedValues.value = defaultControlValues(scalarControls)
  // M3: when the profile constrains license to a fixed set (enum / select-url) and
  // the default license (seeded on open) isn't allowed, seed the first allowed
  // option so the Select doesn't open in an enum-error state.
  const licenseCtrl = controls.find((control) => control.property === 'license' && (control.kind === 'enum' || control.kind === 'select-url'))
  const allowedLicenses = licenseCtrl?.enumOptions ?? []
  if (!preserveDatasetFields && allowedLicenses.length && !allowedLicenses.includes(license.value.trim())) {
    license.value = allowedLicenses[0]
  }
  // Only ENTITY-kind hasPart rules bind to the Data references section (a non-entity
  // hasPart rule is a blocking collision, not a sub-form); scalar hasPart controls
  // must NOT be treated as bound here (M5).
  const hasPartProps = new Set(datasetPropertyRules.filter((rule) => isHasPartUri(rule.propertyUri) && rule.kind === 'entity').map((rule) => rule.valueName))
  // Seeding policy lives in seedEntries (shared with every nested depth);
  // hasPart rules bind to Data references and are never seeded here.
  const seeded: Record<string, EntityEntry[]> = {}
  for (const control of controls) {
    if (control.control !== 'entity' || builtInDatasetKeys.has(control.property) || hasPartProps.has(control.property)) continue
    const entries = seedEntries(control, entityRules, 1)
    if (entries.length) seeded[control.property] = entries
  }
  entityEntries.value = seeded
}

function coreProfileValues(): Record<string, unknown> {
  return {
    name: title.value.trim(),
    description: description.value.trim(),
    datePublished: datePublished.value,
    license: license.value.trim(),
  }
}

function setGeneratedValue(property: string, value: unknown) {
  generatedValues.value = { ...generatedValues.value, [property]: value }
}

function addEntityEntry(control: ProfileControl, source: 'new' | 'existing') {
  const entry = source === 'new' ? newEntityEntry(control, profileEntityRules.value, 1) : newRefEntry()
  const list = [...(entityEntries.value[control.property] ?? []), entry]
  entityEntries.value = { ...entityEntries.value, [control.property]: list }
}

function removeEntityEntry(property: string, index: number) {
  const list = [...(entityEntries.value[property] ?? [])]
  list.splice(index, 1)
  entityEntries.value = { ...entityEntries.value, [property]: list }
}

// Single-valued fields: switch the one entry between describe-new and reuse.
// The replaced entry's values are dropped deliberately (a fresh start per
// source keeps the emission unambiguous).
function switchEntityEntrySource(control: ProfileControl, index: number, source: 'new' | 'existing') {
  const list = [...(entityEntries.value[control.property] ?? [])]
  const current = list[index]
  if (!current || current.source === source) return
  list[index] = source === 'new' ? newEntityEntry(control, profileEntityRules.value, 1) : newRefEntry()
  entityEntries.value = { ...entityEntries.value, [control.property]: list }
}

function setEntityEntryValue(property: string, index: number, subProperty: string, value: unknown) {
  const list = [...(entityEntries.value[property] ?? [])]
  const entry = list[index]
  if (!entry || entry.source !== 'new') return
  list[index] = { ...entry, instance: { ...(entry.instance ?? {}), [subProperty]: value } }
  entityEntries.value = { ...entityEntries.value, [property]: list }
}

function setEntityEntryRef(property: string, index: number, value: string) {
  const list = [...(entityEntries.value[property] ?? [])]
  const entry = list[index]
  if (!entry || entry.source !== 'existing') return
  list[index] = { ...entry, ref: value }
  entityEntries.value = { ...entityEntries.value, [property]: list }
}

// Author-chosen @id override for a described-new entry (see normalizedCustomId).
function setEntityEntryCustomId(property: string, index: number, value: string) {
  const list = [...(entityEntries.value[property] ?? [])]
  const entry = list[index]
  if (!entry || entry.source !== 'new') return
  list[index] = { ...entry, customId: value }
  entityEntries.value = { ...entityEntries.value, [property]: list }
}

function buildRoCrate() {
  const dataset: Record<string, unknown> = {
    '@id': './',
    '@type': 'Dataset',
    name: title.value.trim(),
    description: description.value.trim(),
    datePublished: datePublished.value,
    license: { '@id': license.value.trim() },
  }
  for (const [key, value] of Object.entries(generatedCreateValues.value)) {
    dataset[key] = value
  }

  // Flattened contextual entities, deduplicated by @id (first wins, missing
  // props merged) so shared references (a repeated ORCID, the license) collapse.
  const contextualEntities: Array<Record<string, unknown>> = []
  const byId = new Map<string, Record<string, unknown>>()
  const usedSyntheticIds = new Set<string>()
  const addEntity = (entity: Record<string, unknown>) => {
    const id = String(entity['@id'])
    const existing = byId.get(id)
    if (existing) {
      for (const [key, value] of Object.entries(entity)) {
        if (existing[key] === undefined) existing[key] = value
      }
      return
    }
    byId.set(id, entity)
    contextualEntities.push(entity)
  }

  const profile = selectedProfile.value
  const profileUri = profileReferenceIri(profile)
  if (profileUri && profile) {
    dataset.conformsTo = [{ '@id': profileUri }]
    addEntity({
      '@id': profileUri,
      '@type': ['CreativeWork', DX_PROFILE],
      name: profile.name,
      version: profile.version,
    })
  }

  // The chosen license always gets a contextual CreativeWork entity.
  addEntity(licenseEntity(license.value.trim()))

  // Built-in scaffold fields are suppressed when the profile itself owns them.
  if (showKeywordsScaffold.value && keywordList.value.length) {
    dataset.keywords = keywordList.value
  }
  if (showIdentifierScaffold.value && identifier.value.trim()) {
    dataset.identifier = identifier.value.trim()
  }
  if (showAuthorsScaffold.value && creatorList.value.length) {
    dataset.author = creatorList.value.map((name, index) => {
      const id = uniqueId(`#person-${slugify(name) || String(index + 1)}`, usedSyntheticIds)
      const person: Record<string, unknown> = { '@id': id, '@type': 'Person', name }
      // The signed-in user's own entry carries their portal identity so the
      // detail view can link the author chip to /app/users/{id}.
      const me = currentUser.value
      if (me && name.trim() === me.name) {
        person.identifier = me.orcid ? [me.id, `https://orcid.org/${me.orcid}`] : me.id
        if (me.affiliation) person.affiliation = me.affiliation
      }
      addEntity(person)
      return { '@id': id }
    })
  }

  // Entity entries → described-new entries flatten into contextual entities +
  // {"@id"} refs, recursing through nested sub-forms; reuse entries contribute
  // bare {"@id"} refs (no inline entity). Repeated @ids dedupe within the
  // property (emitEntityEntries) and shared contextual entities collapse
  // crate-wide via addEntity, so reusing and describing the same entity never
  // duplicates it.
  const emitCtx = {
    entityRules: profileEntityRules.value,
    contextTerms: profileContextTerms.value,
    validCrateIds: crateIdSet.value,
    usedSyntheticIds,
    addEntity,
  }
  for (const control of entityControls.value) {
    const entries = entityEntries.value[control.property] ?? []
    if (!entries.length) continue
    const refs = emitEntityEntries(control, entries, emitCtx, 1)
    if (!refs.length) continue
    dataset[control.property] = control.multiple ? refs : refs[0]
  }

  // Profile select-object choices → the chosen option emitted verbatim as a
  // flattened contextual entity + a {"@id"} reference on the dataset property.
  for (const control of generatedScalarControls.value) {
    if (control.control !== 'select-object') continue
    const ref = emitSelectObject(control, generatedValues.value[control.property], addEntity)
    if (ref) dataset[control.property] = ref
  }

  if (dataRefList.value.length) {
    dataset.hasPart = dataRefList.value.map((entry) => ({ '@id': entry.url }))
    for (const entry of dataRefList.value) {
      addEntity(fileEntityForReference({
        id: entry.url,
        contentUrl: entry.contentUrl,
        identity: entry.identity,
      }, entry.label))
    }
  }

  // Typed additional fields (repeated keys already merged into arrays). Keys a
  // profile control or built-in scaffold already owns are skipped rather than
  // clobbered; validation stays open-world, so extras never break conformance.
  for (const [key, value] of Object.entries(customFieldValues.value)) {
    if (builtInDatasetKeys.has(key) || reservedDatasetKeys.has(key) || key in dataset) continue
    dataset[key] = value
  }

  const crate = {
    // Array-form @context (context URL + custom-term mappings) when the profile
    // has non-schema.org terms; the plain context URL otherwise.
    '@context': buildProfileContext([], profileContextTerms.value),
    '@graph': [
      {
        '@id': 'ro-crate-metadata.json',
        '@type': 'CreativeWork',
        conformsTo: { '@id': RO_CRATE_PROFILE },
        about: { '@id': './' },
      },
      dataset,
      ...contextualEntities,
    ],
  }
  // Subcrate references compose last: hasPart refs, Dataset entities and the
  // subjectOf CreativeWork fallback, per the spec-conformant helper.
  for (const link of subcrates.value) addSubcrateLink(crate, link)
  return crate
}

async function submit(unprofiled = false) {
  if (!canSubmit.value) return
  clearProfileWriteFailure()
  let profiled = false
  try {
    const builtCrate = needsRoCrate.value ? buildRoCrate() : undefined
    const roCrate = builtCrate && unprofiled ? withoutProfileTag(builtCrate) : builtCrate
    profiled = Boolean(roCrate && hasProfileTag(roCrate))
    const created = await createMetadata(
      roCrate
        ? {
            group_id: groupId.value,
            path: path.value.trim(),
            public: isPublic.value,
            rocrate: roCrate,
          }
        : {
            group_id: groupId.value,
            path: path.value.trim(),
            public: isPublic.value,
            name: title.value.trim(),
            description: description.value.trim(),
            date_published: datePublished.value,
            license: license.value.trim(),
          },
    )
    const doc = metadata.value.find((item) => item.ulid === created.document_id) ?? {
      ulid: created.document_id,
      title: title.value.trim(),
      description: description.value.trim(),
      type: 'Dataset',
      license: license.value,
      keywords: keywordList.value,
      currentVersion: 1,
      versions: [],
      linkedObjects: [],
      primaryBucketId: '',
      realmId: created.group_id,
      createdAt: created.created_at,
      updatedAt: created.updated_at,
      author: creatorList.value[0] ?? currentUser.value?.name ?? '',
      organization: currentUser.value?.affiliation ?? '',
      nodeId: '',
      profileId: unprofiled ? '' : profileId.value,
      profileIds: unprofiled || !profileId.value ? [] : [profileId.value],
      contributors: creatorList.value.map((name) => ({ name, role: 'Contributor', affiliation: undefined })),
      doi: identifier.value.trim() || undefined,
      roCrate: roCrate ?? {},
    }
    emit('created', doc)
    emit('update:open', false)
  } catch (err) {
    showProfileWriteFailure(err, profiled)
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="requestClose">
    <DialogContent class="max-w-3xl" @interact-outside="(event: Event) => event.preventDefault()">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <FileJson2 class="h-4 w-4 text-primary" /> Create Dataset
        </DialogTitle>
        <DialogDescription>
          Author a new RO-Crate Dataset, or import an existing crate as a new Dataset.
        </DialogDescription>
      </DialogHeader>

      <Tabs v-model="startTab">
        <TabsList>
          <TabsTrigger value="create"><Plus class="mr-1 size-3.5" /> Create new</TabsTrigger>
          <TabsTrigger value="import"><FileUp class="mr-1 size-3.5" /> Import RO-Crate</TabsTrigger>
        </TabsList>
      </Tabs>

      <div v-if="startTab === 'import'" class="max-h-[70vh] space-y-4 overflow-y-auto px-1 scrollbar-thin">
        <div v-if="!currentUser" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Sign in before creating metadata.
        </div>
        <p class="text-xs text-muted-foreground">
          Create a new document from an existing <code class="font-mono">ro-crate-metadata.json</code> instead of authoring it field by field. The crate is previewed before anything is created.
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <input ref="importFileInput" type="file" accept="application/json,application/ld+json,.json,.jsonld" class="hidden" @change="onImportFile" />
          <Button type="button" variant="outline" size="sm" @click="importFileInput?.click()">
            <Upload class="size-3.5" /> Upload file
          </Button>
          <span class="text-[11px] text-muted-foreground">or paste the JSON-LD below</span>
        </div>
        <div class="space-y-2">
          <Textarea v-model="importPaste" rows="6" class="font-mono text-xs" spellcheck="false" placeholder='{ "@context": "https://w3id.org/ro/crate/1.1/context", "@graph": [ … ] }' />
          <Button type="button" variant="outline" size="sm" :disabled="!importPaste.trim()" @click="importPreviewFrom(importPaste, 'pasted JSON')">Preview pasted JSON</Button>
        </div>
        <div v-if="importError" class="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{{ importError }}</span>
        </div>
        <template v-if="importPreview">
          <div class="space-y-2 rounded-md border border-border bg-card px-3 py-2 text-xs">
            <div class="flex items-center gap-2 font-medium text-foreground">
              <FileJson class="h-3.5 w-3.5 shrink-0 text-primary" />
              {{ importPreview.source }}: {{ importPreview.rootName }}
              <span v-if="importPreview.specVersion" class="ml-auto shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                RO-Crate {{ importPreview.specVersion }}
              </span>
            </div>
            <p class="text-muted-foreground">
              {{ importPreview.entityCount }} {{ importPreview.entityCount === 1 ? 'entity' : 'entities' }} in the graph,
              {{ importPreview.fileCount }} referenced data {{ importPreview.fileCount === 1 ? 'file' : 'files' }}.
            </p>
          </div>
          <div v-if="importPreview.unknownSpecVersion" class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>RO-Crate {{ importPreview.unknownSpecVersion }} is not recognized by this portal. The backend may reject this import.</span>
          </div>
          <div v-if="unrecognizedImportProfiles.length" class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              This crate declares conformance to {{ unrecognizedImportProfiles.length === 1 ? 'a profile that is' : 'profiles that are' }} not yet recognized:
              <code class="break-all font-mono">{{ unrecognizedImportProfiles.join(', ') }}</code>. Only registered Profile references can be saved. Remove the Profile tag and save unprofiled if the server rejects it.
            </span>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="text-xs font-medium text-foreground">Group</label>
              <Select v-model="groupId" :options="groupOptions" placeholder="Choose a group" class="mt-1" />
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Document path</label>
              <Input
                :model-value="importPath"
                class="mt-1"
                placeholder="datasets/my-dataset"
                @update:model-value="(value: string | number) => { importPath = String(value); importPathTouched = true }"
              />
              <p class="mt-1 text-[11px] text-muted-foreground">Stored as the Dataset path in Aruna.</p>
            </div>
          </div>
          <label class="flex items-center justify-between rounded-md border border-border p-3 text-sm">
            <span>
              Public metadata
              <span class="block text-[11px] text-muted-foreground">Public documents are visible without a bearer token.</span>
            </span>
            <Switch :checked="isPublic" @update:checked="(v: boolean) => (isPublic = v)" />
          </label>
        </template>
      </div>

      <div v-else class="max-h-[70vh] space-y-4 overflow-y-auto px-1 scrollbar-thin">
        <div v-if="!currentUser" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Sign in before creating metadata.
        </div>
        <div v-else-if="!groups.length" class="flex items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <span>You are not a member of any group yet; datasets belong to a group.</span>
          <Button variant="outline" size="sm" class="shrink-0" @click="createGroupOpen = true">
            <Plus class="h-3.5 w-3.5" /> Create a group
          </Button>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="text-xs font-medium text-foreground">Group</label>
            <Select v-model="groupId" :options="groupOptions" placeholder="Choose a group" class="mt-1" :invalid="scaffoldFieldErrors.group ? 'error' : undefined" />
            <p v-if="scaffoldFieldErrors.group" class="mt-1 text-[11px] text-destructive">{{ scaffoldFieldErrors.group }}</p>
          </div>
          <div>
            <label class="text-xs font-medium text-foreground">Profile reference</label>
            <Select v-model="profileSelection" :options="profileOptions" placeholder="Optional profile" class="mt-1" />
            <p v-if="selectedProfile" class="mt-1 text-[11px] text-muted-foreground">
              <template v-if="profileRuleState === 'loading'">Loading profile rules…</template>
              <template v-else-if="profileRuleState === 'unavailable'">Profile rules are unavailable. Retry below or choose "No profile reference".</template>
              <template v-else-if="profileInputCount">Adds {{ profileInputCount }} {{ profileInputCount === 1 ? 'field' : 'fields' }} below, <span class="text-destructive">*</span> marks required. The RO-Crate references {{ selectedProfile.name }} by its public Profile w3id.</template>
              <template v-else-if="profileRuleState === 'empty'">No rules are defined for this profile. The RO-Crate still references {{ selectedProfile.name }} by its public Profile w3id.</template>
              <template v-else>No controls could be generated, but the retained SHACL requirements still apply. The RO-Crate references {{ selectedProfile.name }} by its public Profile w3id.</template>
            </p>
            <p v-if="selectedProfile" class="mt-1 text-[11px] text-muted-foreground">
              Properties omitted by this profile remain allowed unless an explicit closed or other restricting SHACL rule constrains them.
            </p>
          </div>
        </div>

        <div v-if="profileId && profileRuleState === 'empty'" class="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          No rules are defined for this profile, so it adds no controls or validation requirements.
        </div>
        <div v-if="profileCollisionKeys.length" class="text-xs text-destructive">
          Profile field target collides with built-in dataset fields: {{ profileCollisionKeys.join(', ') }}.
        </div>
        <div v-if="scaffoldClaimedKeys.length" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          This profile defines {{ scaffoldClaimedKeys.join(', ') }}, those values come from the built-in inputs above, so the profile's own label, input kind and constraints for them are partially ignored.
        </div>
        <div v-if="hasPartScalarCollisionKeys.length" class="text-xs text-destructive">
          A hasPart rule must be an entity reference so it can bind to the Data references section. These hasPart rules use a scalar value and can't be applied: {{ hasPartScalarCollisionKeys.join(', ') }}.
        </div>

        <div>
          <label class="text-xs font-medium text-foreground">Title</label>
          <Input v-model="title" class="mt-1" placeholder="Dataset title" :invalid="scaffoldInvalid('title', 'name')" @blur="fillPath" />
          <p v-if="scaffoldFieldErrors.title" class="mt-1 text-[11px] text-destructive">{{ scaffoldFieldErrors.title }}</p>
          <template v-if="!scaffoldFieldErrors.title">
            <template v-for="violation in builtInViolations.name ?? []" :key="violation.ruleId + violation.pointer">
              <p class="mt-1 text-[11px]" :class="violation.severity === 'error' ? 'text-destructive' : 'text-amber-800 dark:text-amber-300'">{{ violation.message }}</p>
              <p v-if="violation.hint" class="text-[11px] text-muted-foreground">{{ violation.hint }}</p>
            </template>
          </template>
        </div>
        <div>
          <label class="text-xs font-medium text-foreground">Document path</label>
          <Input v-model="path" class="mt-1" placeholder="datasets/my-dataset" :invalid="scaffoldFieldErrors.path ? 'error' : undefined" />
          <p v-if="scaffoldFieldErrors.path" class="mt-1 text-[11px] text-destructive">{{ scaffoldFieldErrors.path }}</p>
          <p v-else class="mt-1 text-[11px] text-muted-foreground">Stored as the Dataset path in Aruna.</p>
        </div>
        <div>
          <label class="text-xs font-medium text-foreground">Description</label>
          <Textarea v-model="description" class="mt-1" rows="3" :invalid="scaffoldInvalid('description')" />
          <p v-if="scaffoldFieldErrors.description" class="mt-1 text-[11px] text-destructive">{{ scaffoldFieldErrors.description }}</p>
          <template v-if="!scaffoldFieldErrors.description">
            <template v-for="violation in builtInViolations.description ?? []" :key="violation.ruleId + violation.pointer">
              <p class="mt-1 text-[11px]" :class="violation.severity === 'error' ? 'text-destructive' : 'text-amber-800 dark:text-amber-300'">{{ violation.message }}</p>
              <p v-if="violation.hint" class="text-[11px] text-muted-foreground">{{ violation.hint }}</p>
            </template>
          </template>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="text-xs font-medium text-foreground">Date published</label>
            <Input v-model="datePublished" type="date" class="mt-1" :invalid="scaffoldInvalid('datePublished')" />
            <p v-if="scaffoldFieldErrors.datePublished" class="mt-1 text-[11px] text-destructive">{{ scaffoldFieldErrors.datePublished }}</p>
            <template v-if="!scaffoldFieldErrors.datePublished">
              <p
                v-for="violation in builtInViolations.datePublished ?? []"
                :key="violation.ruleId + violation.pointer"
                class="mt-1 text-[11px]"
                :class="violation.severity === 'error' ? 'text-destructive' : 'text-amber-800 dark:text-amber-300'"
              >{{ violation.message }}</p>
            </template>
          </div>
          <!-- M3: when the profile constrains license to a fixed set, render its
               Select (from ProfileControlField) in place of the free-text URL input,
               bound to the same `license` value crate emission uses. -->
          <div v-if="licenseControl">
            <ProfileControlField
              :control="licenseControl"
              :model-value="license"
              :violations="licenseControlViolations"
              @update:model-value="(value: unknown) => (license = String(value ?? ''))"
            />
          </div>
          <div v-else>
            <label class="text-xs font-medium text-foreground">License URL</label>
            <Input v-model="license" class="mt-1" :invalid="scaffoldInvalid('license')" />
            <p v-if="scaffoldFieldErrors.license" class="mt-1 text-[11px] text-destructive">{{ scaffoldFieldErrors.license }}</p>
            <template v-if="!scaffoldFieldErrors.license">
              <p
                v-for="violation in builtInViolations.license ?? []"
                :key="violation.ruleId + violation.pointer"
                class="mt-1 text-[11px]"
                :class="violation.severity === 'error' ? 'text-destructive' : 'text-amber-800 dark:text-amber-300'"
              >{{ violation.message }}</p>
            </template>
          </div>
        </div>

        <!-- Generated profile section. The summary parse structurally carries ZERO
             profile rules, so until the full crate refines them the form would be
             silently missing fields: show a skeleton while loading and a BLOCKING
             error panel (with Retry) when the full-crate load failed — never a
             silently-degraded form. -->
        <section v-if="profileAdditionalRequirements.length || serverRequiredConstraints.length" class="space-y-2 rounded-md border border-border p-3">
          <div>
            <h3 class="text-xs font-semibold text-foreground">Additional requirements</h3>
            <p class="mt-0.5 text-[11px] text-muted-foreground">Read-only SHACL requirements retained for authoritative validation.</p>
          </div>
          <div v-if="serverRequiredConstraints.length" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <p class="font-medium">Server validation required</p>
            <p class="mt-1">The browser cannot lift {{ serverRequiredConstraints.join(', ') }} into complete controls. The server checks these constraints when you save.</p>
          </div>
          <LiftNotesPanel :notes="profileAdditionalRequirements" attached />
        </section>

        <div v-if="profileId && profileRuleState === 'loading'" class="rounded-md border border-border p-3">
          <p class="text-[11px] text-muted-foreground">Loading the profile's fields…</p>
          <div class="mt-2 grid gap-3 sm:grid-cols-2">
            <Skeleton v-for="n in 4" :key="n" class="h-14" />
          </div>
        </div>
        <div v-else-if="profileRuleState === 'unavailable'" class="rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p class="text-xs font-medium text-destructive">The profile's rules are unavailable.</p>
          <p class="mt-1 text-[11px] text-destructive/90">{{ profileLoadError }}</p>
          <p class="mt-1 text-[11px] text-muted-foreground">
            Without these rules the form would be missing the profile's required fields, so creation is blocked.
            Retry, or switch to "No profile reference" to continue without them.
          </p>
          <Button variant="outline" size="sm" class="mt-2" @click="loadSelectedProfileSchema(true)">Retry</Button>
        </div>
        <template v-else>
          <div v-if="generatedScalarControls.length" class="grid gap-4 sm:grid-cols-2">
            <ProfileControlField
              v-for="control in generatedScalarControls"
              :key="control.property"
              :control="control"
              :model-value="generatedValues[control.property]"
              :violations="[...profileViolations.filter((item) => item.fieldId === control.property), ...previewViolationsFor(control.property)]"
              :class="control.control === 'textarea' || control.control === 'tags' ? 'sm:col-span-2' : ''"
              @update:model-value="(value: unknown) => setGeneratedValue(control.property, value)"
            />
          </div>
          <div v-for="control in entityControls" :key="control.property">
            <DatasetEntityInstances
              :control="control"
              :sub-controls="entitySubControls[control.property] ?? []"
              :entries="entityEntries[control.property] ?? []"
              :entry-violations="entityEntryViolations[control.property] ?? []"
              :presence-violations="[...profileViolations.filter((item) => item.fieldId === control.property), ...previewViolationsFor(control.property)]"
              :type-label="entityTypeLabelFor(control)"
              :crate-options="crateOptions"
              :entity-rules="profileEntityRules"
              :depth="1"
              @add-new="addEntityEntry(control, 'new')"
              @add-existing="addEntityEntry(control, 'existing')"
              @remove="(index: number) => removeEntityEntry(control.property, index)"
              @switch-source="(index: number, source: 'new' | 'existing') => switchEntityEntrySource(control, index, source)"
              @update="(index: number, subProperty: string, value: unknown) => setEntityEntryValue(control.property, index, subProperty, value)"
              @update-ref="(index: number, value: string) => setEntityEntryRef(control.property, index, value)"
              @update-custom-id="(index: number, value: string) => setEntityEntryCustomId(control.property, index, value)"
            />
          </div>
        </template>

        <div v-if="showKeywordsScaffold || showIdentifierScaffold" class="grid gap-4 sm:grid-cols-2">
          <div v-if="showKeywordsScaffold">
            <label class="text-xs font-medium text-foreground">Keywords</label>
            <Input v-model="keywords" class="mt-1" placeholder="genomics, proteomics" />
            <p class="mt-1 text-[11px] text-muted-foreground">Optional, comma-separated.</p>
          </div>
          <div v-if="showIdentifierScaffold">
            <label class="text-xs font-medium text-foreground">Identifier</label>
            <Input v-model="identifier" class="mt-1" placeholder="https://doi.org/10.1234/abcd" />
            <p class="mt-1 text-[11px] text-muted-foreground">Optional persistent identifier, e.g. a DOI URL.</p>
          </div>
        </div>
        <div v-if="showAuthorsScaffold">
          <div class="flex items-center justify-between gap-3">
            <label class="text-xs font-medium text-foreground">Authors</label>
            <div class="flex items-center gap-1.5">
              <Button
                v-if="currentUser && !creators.includes(currentUser.name)"
                variant="ghost"
                size="sm"
                @click="creators.push(currentUser.name)"
              >
                Add yourself
              </Button>
              <Button variant="outline" size="sm" @click="creators.push('')">
                <Plus class="size-3.5" /> Add author
              </Button>
            </div>
          </div>
          <div v-for="(creator, index) in creators" :key="index" class="mt-1 flex items-center gap-2">
            <Input v-model="creators[index]" placeholder="Ada Lovelace" />
            <Button variant="ghost" size="icon" aria-label="Remove author" @click="creators.splice(index, 1)">
              <X />
            </Button>
          </div>
        </div>
        <div>
          <DatasetFilesEditor v-model="filesModel" :detailed="false" />
          <div v-if="locationIdentityRefs.length" class="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
            <p class="font-medium">Location identity</p>
            <ul class="mt-1 space-y-1">
              <li v-for="entry in locationIdentityRefs" :key="entry.url">
                <code class="break-all font-mono">{{ entry.url }}</code> keeps its storage location as the File identifier because the content digest was unavailable.
              </li>
            </ul>
          </div>
          <!-- WS5: the profile's required contents for hasPart. A reference is
               matched by its @id (url) or name (label), the same way the File
               entities are emitted, so this checklist agrees with validation. -->
          <div v-if="hasPartRequirements.length" class="mt-2 rounded-md border border-border bg-card px-3 py-2">
            <p class="text-[11px] font-medium text-foreground">Required contents (from the profile)</p>
            <ul class="mt-1 space-y-1">
              <li v-for="requirement in hasPartRequirements" :key="requirement.key" class="text-[11px]">
                <span
                  class="flex items-center gap-1.5"
                  :class="requirement.satisfied ? 'text-muted-foreground' : requirement.severity === 'error' ? 'text-destructive' : 'text-amber-800 dark:text-amber-300'"
                >
                  <Check v-if="requirement.satisfied" class="size-3.5 shrink-0" />
                  <span v-else class="h-1.5 w-1.5 shrink-0 rounded-full" :class="requirement.severity === 'error' ? 'bg-destructive' : 'bg-amber-500'" />
                  <span class="truncate">{{ requirement.label }}<span v-if="!requirement.satisfied && requirement.severity === 'warning'"> (recommended)</span></span>
                </span>
                <span v-if="requirement.hint" class="ml-5 block text-muted-foreground">{{ requirement.hint }}</span>
              </li>
            </ul>
          </div>
          <p
            v-for="violation in hasPartSchemaViolations"
            :key="violation.ruleId + violation.pointer"
            class="mt-1 text-[11px]"
            :class="violation.severity === 'error' ? 'text-destructive' : 'text-amber-800 dark:text-amber-300'"
          >
            {{ violation.message }}
          </p>
        </div>

        <div v-if="profileMigrationSummary" class="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
          <p class="font-medium">Profile draft migrated.</p>
          <p class="mt-1 text-muted-foreground">
            {{ profileMigrationSummary.migrated }} {{ profileMigrationSummary.migrated === 1 ? 'field now uses' : 'fields now use' }} the new profile controls.
            <template v-if="profileMigrationSummary.preserved">
              {{ profileMigrationSummary.preserved }} unmatched {{ profileMigrationSummary.preserved === 1 ? 'field is' : 'fields are' }} preserved in Additional fields below for review.
            </template>
          </p>
        </div>

        <CustomFieldsEditor v-model:rows="customFields" />

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
              <Button variant="ghost" size="icon-sm" class="shrink-0 text-muted-foreground" :aria-label="`Unlink subcrate ${link.name}`" @click="removeSubcrate(link.iri)">
                <X class="h-3.5 w-3.5" />
              </Button>
            </li>
          </ul>
          <p class="mt-1 text-[11px] text-muted-foreground">
            References to other crates (RO-Crate 1.2), written as <code class="font-mono">hasPart</code> Dataset entities. Linked crates stay independent documents.
          </p>
        </div>
        <!-- Advisory server validation of the crate about to be saved;
             hidden when the node does not serve the preview endpoint. -->
        <ProfileValidationPreview
          v-if="profileId && !previewUnavailable"
          :result="previewResult"
          :running="previewRunning"
          :error="previewError"
          :findings="previewMapped.panel"
          :inline-count="previewInlineCount"
          @run="validateAgainstProfile"
        />

        <label class="flex items-center justify-between rounded-md border border-border p-3 text-sm">
          <span>
            Public metadata
            <span class="block text-[11px] text-muted-foreground">Public documents are visible without a bearer token.</span>
          </span>
          <Switch :checked="isPublic" @update:checked="(v: boolean) => (isPublic = v)" />
        </label>
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
          <Button type="button" variant="outline" size="sm" :disabled="saving" @click="retryProfiledWrite">Retry</Button>
          <Button type="button" variant="outline" size="sm" :disabled="saving" @click="saveUnprofiled">Remove Profile tag and save unprofiled</Button>
        </div>
      </section>
      <p v-else-if="submitError" class="text-xs text-destructive">{{ submitError }}</p>

      <div v-if="startTab === 'create' && !canSubmit && !saving && currentUser && submitBlockerSummary.length" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
        {{ submitBlockerSummary.join(' ') }}
      </div>

      <DialogFooter>
        <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
        <Button v-if="startTab === 'import'" :disabled="!canSubmitImport || saving" @click="submitImport()">
          {{ saving ? 'Importing…' : 'Import crate' }}
        </Button>
        <Button v-else :disabled="!canSubmit || saving" @click="submit()">
          {{ saving ? 'Creating…' : 'Create dataset' }}
        </Button>
      </DialogFooter>

      <CreateGroupDialog v-model:open="createGroupOpen" @created="(group) => (groupId = group.group_id)" />

      <SubcratePickerDialog
        v-model:open="subcratePickerOpen"
        :excluded-iris="subcrates.map((link) => link.iri)"
        @select="onSubcratesPicked"
      />

      <DiscardDraftConfirm :open="confirmDiscardOpen" @keep="confirmDiscardOpen = false" @discard="discardDraft" />

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
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="profile-switch-title"
            class="w-full max-w-lg rounded-lg border border-border bg-popover p-4 shadow-xl"
          >
            <h2 id="profile-switch-title" class="text-sm font-semibold text-foreground">Switch profile and migrate this draft?</h2>
            <p class="mt-1 text-xs text-muted-foreground">
              Review how profile-owned values will move from {{ selectedProfile?.name ?? 'No profile reference' }} to {{ pendingProfile?.name ?? 'No profile reference' }}.
              Dataset title, description, date, license, files, custom fields, and other profile-independent fields stay unchanged.
            </p>
            <p v-if="profileSwitchLoading" class="mt-3 text-xs text-muted-foreground">Preparing the migration preview…</p>
            <template v-else>
              <div v-if="profileSwitchError" class="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                The new profile's rules could not be loaded for this preview. Every populated profile field will be preserved in Additional fields for review. {{ profileSwitchError }}
              </div>
              <ul class="mt-3 max-h-64 space-y-2 overflow-y-auto">
                <li v-for="({ item, target }, index) in profileSwitchPreview" :key="`${item.propertyUri}:${index}`" class="rounded-md border border-border bg-card px-3 py-2 text-xs">
                  <p class="font-medium text-foreground">{{ item.label }}</p>
                  <p class="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">{{ item.propertyUri }}</p>
                  <p class="mt-1 text-muted-foreground">Draft value: {{ draftItemPreview(item) }}</p>
                  <p v-if="target" class="mt-1 text-foreground">Moves into the new {{ target.label }} control because the property URI matches.</p>
                  <p v-else class="mt-1 text-foreground">Preserved in Additional fields for review. Nothing is cleared.</p>
                </li>
              </ul>
            </template>
            <div class="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" @click="cancelProfileSwitch">Keep current profile</Button>
              <Button size="sm" :disabled="profileSwitchLoading" @click="confirmProfileSwitch">Switch and migrate</Button>
            </div>
          </div>
        </div>
      </Transition>
    </DialogContent>
  </Dialog>
</template>
