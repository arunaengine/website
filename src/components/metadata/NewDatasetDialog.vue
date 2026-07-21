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
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import CreateGroupDialog from '@/components/groups/CreateGroupDialog.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import DatasetFilesEditor from '@/components/metadata/DatasetFilesEditor.vue'
import DatasetEntityInstances from '@/components/metadata/DatasetEntityInstances.vue'
import ProfileControlField from '@/components/metadata/ProfileControlField.vue'
import { computed, ref, watch } from 'vue'
import { Check, FileJson2, Plus, X } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import type { DataEntity } from '@/lib/dataEntities'
import type { MetadataDoc } from '@/data/types'
import { controlsFromRules, defaultControlValues, normalizeProfileValues } from '@/lib/profiles/controls'
import { emitEntityEntries, emitSelectObject, isHasPartUri, slugify, uniqueId } from '@/lib/profiles/emit'
import {
  effectiveEntryValues,
  entryRefInvalid,
  entrySourcePolicy,
  type EntityEntry,
} from '@/lib/profiles/entityEntries'
import { licenseEntity, parseProfileCrate } from '@/lib/profiles/rocrate'
import { schemaFromPropertyRules } from '@/lib/profiles/schema'
import { buildProfileContext, isSchemaOrgUri } from '@/lib/profiles/propertyCatalog'
import { entityTypeLabel } from '@/lib/profiles/entityTypes'
import { isAbsoluteUri, isInvalidReferenceUri, REFERENCE_URI_MESSAGE } from '@/lib/profiles/uri'
import { validateProfileData, validateRequiredInstances } from '@/lib/profiles/validate'
import {
  DX_PROFILE,
  RO_CRATE_PROFILE,
  type JsonSchema,
  type ProfileBasics,
  type ProfileControl,
  type ProfileEntityRule,
  type ProfilePropertyRule,
  type ProfileViolation,
} from '@/lib/profiles/types'

// The sub-form seeded for an entity reference whose target type has no entity
// rule in the profile — a single Name (Text) field so instances aren't fieldless.
const MINIMAL_ENTITY_RULE: ProfilePropertyRule = {
  id: 'name',
  label: 'Name',
  description: '',
  kind: 'text',
  propertyUri: 'http://schema.org/name',
  valueName: 'name',
  obligation: 'MAY',
}

// Monotonic per-entry identity so entity-entry cards key on a stable uid
// rather than their array index (mirrors the builder draft uid discipline).
let entityEntryUid = 0

const props = defineProps<{
  open: boolean
  defaultProfileId?: string
}>()

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'created', doc: MetadataDoc): void
}>()

const { groups, profiles, metadata, createMetadata, loadRoCrate, saving, currentUser } = useAruna()

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
const dataRefs = ref<Array<{ label: string; url: string }>>([])
const submitError = ref<string | null>(null)
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
const profileLoading = ref(false)
const profileLoadError = ref<string | null>(null)
// True when the full-crate load (or its S3 artifact resolution) FAILED — as
// opposed to the informational "profile has no machine-readable rules" case.
// The initial summary parse structurally contains zero profile rules (the
// backend summary strips File entities), so a failed refinement means the form
// is silently missing fields; that state blocks the generated section AND
// submission until a retry succeeds or the profile is deselected.
const profileLoadFailed = ref(false)
let profileLoadToken = 0

const builtInDatasetKeys = new Set(['name', 'description', 'datePublished', 'license'])
// `hasPart` is NOT reserved: a profile hasPart rule binds to the always-present
// Data references section (which owns hasPart emission) instead of colliding.
const reservedDatasetKeys = new Set(['@id', '@type', 'conformsTo'])

const groupOptions = computed(() => groups.value.map((group) => ({ value: group.id, label: group.name })))
const profileOptions = computed(() => [
  { value: '', label: 'No profile reference' },
  ...profiles.value.map((profile) => {
    // Count every entity rule's properties — the same total ProfilesView shows —
    // not just the root Dataset rules.
    const count = profile.entityRules.length
      ? profile.entityRules.reduce((sum, rule) => sum + rule.propertyRules.length, 0)
      : profile.propertyRules.length
    return { value: profile.id, label: `${profile.name}${count ? ` (${count} properties)` : ''}` }
  }),
])
const selectedProfile = computed(() => profiles.value.find((profile) => profile.id === profileId.value))

const keywordList = computed(() => keywords.value.split(',').map((keyword) => keyword.trim()).filter(Boolean))
const creatorList = computed(() => creators.value.map((name) => name.trim()).filter(Boolean))
const dataRefList = computed(() =>
  dataRefs.value
    .map((entry) => ({ label: entry.label.trim(), url: entry.url.trim() }))
    .filter((entry) => entry.url),
)
// Bridge the shared files editor onto the existing {label,url} model so buildRoCrate
// keeps emitting hasPart File entities from `dataRefs`; per-file details are omitted
// here (`detailed: false`) because the create emit shape carries only id + name.
const filesModel = computed<DataEntity[]>({
  get: () => dataRefs.value.map((entry) => ({ id: entry.url, name: entry.label, types: ['File'] })),
  set: (next) => {
    dataRefs.value = next.map((file) => ({ label: file.name, url: file.id }))
  },
})
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
// Sub-form controls per entity control, generated from the target entity rule.
// When the referenced type has no entity rule, fall back to a minimal Name field
// so instances are never fieldless.
const entitySubControls = computed<Record<string, ProfileControl[]>>(() => {
  const map: Record<string, ProfileControl[]> = {}
  for (const control of entityControls.value) {
    map[control.property] = control.entityRule
      ? controlsFromRules(control.entityRule.propertyRules, profileEntityRules.value)
      : controlsFromRules([MINIMAL_ENTITY_RULE], profileEntityRules.value)
  }
  return map
})
// Per-entity JSON Schema used for per-instance scalar validation.
const entitySchemas = computed<Record<string, JsonSchema | undefined>>(() => {
  const map: Record<string, JsonSchema | undefined> = {}
  for (const control of entityControls.value) {
    map[control.property] = control.entityRule
      ? schemaFromPropertyRules(entityBasics(control.entityRule), control.entityRule.propertyRules)
      : schemaFromPropertyRules({ name: entityTypeLabelFor(control), description: '' }, [MINIMAL_ENTITY_RULE])
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

// Per-entry violations for every entity control, keyed by control property;
// outer array index aligns with the entry index. Described-new entries get the
// target shape's scalar validation plus nested reference-format checks; reuse
// entries get the reference-format check ONLY (reuse-by-URI is never
// re-validated against the shape — plan 5.4, stated in the UI).
const entityEntryViolations = computed<Record<string, ProfileViolation[][]>>(() => {
  const map: Record<string, ProfileViolation[][]> = {}
  for (const control of entityControls.value) {
    const policy = entrySourcePolicy(control.entitySources)
    const subControls = entitySubControls.value[control.property] ?? []
    const schema = entitySchemas.value[control.property]
    const entries = entityEntries.value[control.property] ?? []
    map[control.property] = entries.map((entry) => {
      if (entry.source === 'new') {
        return [
          ...validateProfileData(schema, instanceValidationValues(entry.instance ?? {}, subControls)),
          ...referenceUriViolations(entry.instance ?? {}, subControls),
        ]
      }
      return entryRefInvalid(entry, policy, crateIdSet.value)
        ? [{
            ruleId: 'format.uri',
            pointer: `/${control.property}`,
            fieldId: control.property,
            message: REFERENCE_URI_MESSAGE,
            severity: 'error' as const,
          }]
        : []
    })
  }
  return map
})

// Nested (depth-1) entity references are plain URI inputs; a non-empty value that
// is not an absolute URI is a blocking field error (it would emit a broken
// `{"@id"}` reference). Surfaced inline via entityInstanceViolations and counted
// in entityInstanceErrorCount so it gates submit.
function referenceUriViolations(instance: Record<string, unknown>, subControls: ProfileControl[]): ProfileViolation[] {
  const violations: ProfileViolation[] = []
  for (const control of subControls) {
    if (control.control !== 'entity') continue
    const raw = instance[control.property]
    // Multiple references validate every entry; single validates the one value.
    const entries = control.multiple ? (Array.isArray(raw) ? raw : []) : [raw]
    entries.forEach((entry, entryIndex) => {
      if (typeof entry === 'string' && isInvalidReferenceUri(entry)) {
        violations.push({
          ruleId: 'format.uri',
          pointer: control.multiple ? `/${control.property}/${entryIndex}` : `/${control.property}`,
          fieldId: control.property,
          message: REFERENCE_URI_MESSAGE,
          severity: 'error',
        })
      }
    })
  }
  return violations
}
const entityEntryErrorCount = computed(() => {
  let count = 0
  for (const perEntry of Object.values(entityEntryViolations.value)) {
    for (const violations of perEntry) count += violations.filter((violation) => violation.severity === 'error').length
  }
  return count
})

// Schema presence / cardinality violations that target a hasPart rule, surfaced at
// the Data references section (hasPart has no generic control of its own).
const hasPartSchemaViolations = computed(() =>
  profileViolations.value.filter((violation) => hasPartProperties.value.has(violation.fieldId ?? '')),
)

const profileInputCount = computed(() => generatedScalarControls.value.length + entityControls.value.length)

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

// Anything beyond the scaffold fields requires submitting a full RO-Crate.
const needsRoCrate = computed(() =>
  Boolean(
    profileId.value
      || (showKeywordsScaffold.value && keywordList.value.length)
      || (showAuthorsScaffold.value && creatorList.value.length)
      || (showIdentifierScaffold.value && identifier.value.trim())
      || dataRefList.value.length
      || hasEntityEntries.value
      || Object.keys(generatedCreateValues.value).length,
  ),
)

// A profile schema that fails to load (legacy/external profile, or a transient
// CrateNotReadyError) is non-blocking: we cannot generate/validate inputs, but
// the dataset can still be created and will reference the profile via
// conformsTo when a URI is available. So profileLoadError is NOT in canSubmit —
// only the in-flight load, hard error-severity violations, and collisions gate.
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
const builtInViolations = computed<Record<string, ProfileViolation[]>>(() => {
  const map: Record<string, ProfileViolation[]> = {}
  for (const violation of profileViolations.value) {
    const fieldId = violation.fieldId ?? ''
    if (!builtInDatasetKeys.has(fieldId)) continue
    ;(map[fieldId] ??= []).push(violation)
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

watch(
  () => props.open,
  (open) => {
    if (!open) return
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
    submitError.value = null
    resetGeneratedProfileFields()
    void loadSelectedProfileSchema()
  },
  { immediate: true },
)

watch(profileId, () => {
  if (props.open) void loadSelectedProfileSchema()
})

function fillPath() {
  if (!title.value.trim() || path.value.trim()) return
  path.value = `datasets/${slugify(title.value)}`
}

async function loadSelectedProfileSchema() {
  const token = ++profileLoadToken
  resetGeneratedProfileFields()
  const profile = selectedProfile.value
  if (!profile) return

  // Apply the summary-parsed rules immediately, then refine from the full crate.
  applyParsedProfile(profile.entityRules, profile.propertyRules, profile.schema, profile.contextTerms)
  if (!profile.documentId) return

  profileLoading.value = true
  profileLoadError.value = null
  profileLoadFailed.value = false
  try {
    const rocrate = await loadRoCrate(profile.documentId)
    if (token !== profileLoadToken) return
    const parsed = parseProfileCrate(rocrate)
    applyParsedProfile(parsed.entityRules, parsed.datasetPropertyRules, parsed.schema, parsed.contextTerms)
    if (!parsed.schema && !parsed.entityRules.length) profileLoadError.value = 'Selected profile has no machine-readable rules.'
  } catch (err) {
    if (token !== profileLoadToken) return
    profileLoadError.value = err instanceof Error ? err.message : String(err)
    profileLoadFailed.value = true
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
  profileLoadError.value = null
  profileLoadFailed.value = false
  // Clear the in-flight flag too, so switching to "No profile reference" mid-load
  // never leaves the Create button stuck behind a phantom loading state.
  profileLoading.value = false
}

function applyParsedProfile(
  entityRules: ProfileEntityRule[],
  datasetPropertyRules: ProfilePropertyRule[],
  schema: JsonSchema | undefined,
  contextTerms: Record<string, string> | undefined,
) {
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
  if (allowedLicenses.length && !allowedLicenses.includes(license.value.trim())) {
    license.value = allowedLicenses[0]
  }
  // Only ENTITY-kind hasPart rules bind to the Data references section (a non-entity
  // hasPart rule is a blocking collision, not a sub-form); scalar hasPart controls
  // must NOT be treated as bound here (M5).
  const hasPartProps = new Set(datasetPropertyRules.filter((rule) => isHasPartUri(rule.propertyUri) && rule.kind === 'entity').map((rule) => rule.valueName))
  // Seeding: a required (MUST) rule that allows describing a new entity starts
  // with one described-new entry so its sub-form shows up immediately; the
  // entry's own required sub-fields then flag inline what still needs filling.
  // SHOULD/MAY rules keep the explicit Add so an untouched form never emits (or
  // silently satisfies a recommendation with) an empty entity. Reuse-only
  // single-valued rules seed one empty reference entry (the input shows right
  // away; a blank never emits); reuse-only lists start empty. hasPart rules
  // bind to Data references and are never seeded here.
  const seeded: Record<string, EntityEntry[]> = {}
  for (const control of controls) {
    if (control.control !== 'entity' || builtInDatasetKeys.has(control.property) || hasPartProps.has(control.property)) continue
    const policy = entrySourcePolicy(control.entitySources)
    if (policy.allowNew) {
      if (!control.required) continue
      const subControls = control.entityRule
        ? controlsFromRules(control.entityRule.propertyRules, entityRules)
        : controlsFromRules([MINIMAL_ENTITY_RULE], entityRules)
      seeded[control.property] = [newEntityEntry(subControls)]
    } else if (!control.multiple) {
      seeded[control.property] = [newRefEntry()]
    }
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

// Display label of an entity reference: the resolved entity rule's type, else the
// first target type URI — never the literal 'entity' unless nothing is set.
function entityTypeLabelFor(control: ProfileControl): string {
  const type = control.entityRule?.type ?? control.entityTypes?.[0] ?? ''
  return entityTypeLabel(type) || 'entity'
}

// @type of an EMITTED entity instance: the resolved entity rule's canonical
// className — the JSON-LD compact alias mapped in the crate @context (D3), so an
// imported alias (e.g. `Specimen` over an OBO PURL) survives instead of being
// re-derived from the type URI. For a ruleless target: a schema.org type emits its
// bare label (resolvable via the base context); a custom type emits its context
// token when one is mapped, else the FULL type URI (M1) so @type is never an
// undefined JSON-LD term. No literal 'entity' fallback.
function entityTypeName(control: ProfileControl): string {
  if (control.entityRule?.className) return control.entityRule.className
  const target = control.entityTypes?.[0] ?? ''
  if (!target) return 'Thing'
  if (isSchemaOrgUri(target)) return entityTypeLabel(target)
  const token = Object.keys(profileContextTerms.value).find((key) => profileContextTerms.value[key] === target)
  return token || target
}

// A minimal ProfileBasics carrier so schemaFromPropertyRules can title the
// per-entity schema; only name/description are read.
function entityBasics(rule: ProfileEntityRule): Pick<ProfileBasics, 'name' | 'description'> {
  return { name: rule.label, description: rule.description }
}

// A fresh instance record for a described-new entry: scalar controls seeded
// from defaults, nested entity references seeded as empty URI strings (depth-1
// reference input).
function newEntityInstance(subControls: ProfileControl[]): Record<string, unknown> {
  const values = defaultControlValues(subControls)
  for (const control of subControls) {
    // Single reference → one URI string; multiple → a list of URI strings (D5).
    if (control.control === 'entity') values[control.property] = control.multiple ? [] : ''
  }
  return values
}

function newEntityEntry(subControls: ProfileControl[]): EntityEntry {
  return { __uid: ++entityEntryUid, source: 'new', instance: newEntityInstance(subControls) }
}

function newRefEntry(): EntityEntry {
  return { __uid: ++entityEntryUid, source: 'existing', ref: '' }
}

// Values for per-instance validation: scalar controls normalized (keeping empty
// keys so presence checks fire), nested entity references kept as their raw URI
// string so their required/recommended membership is checked.
function instanceValidationValues(instance: Record<string, unknown>, subControls: ProfileControl[]): Record<string, unknown> {
  const values = normalizeProfileValues(instance, subControls)
  for (const control of subControls) {
    // Entity refs and select-object choices are skipped by normalizeProfileValues
    // (they are references, not scalars); surface their raw value so presence
    // checks fire. Multiple entity refs stay an array so an empty list = missing.
    if (control.control === 'entity') {
      const raw = instance[control.property]
      values[control.property] = control.multiple
        // M5: drop blank rows before the presence check so an empty repeatable row
        // cannot satisfy a required nested-multiple reference.
        ? (Array.isArray(raw) ? raw.map((entry) => String(entry).trim()).filter(Boolean) : [])
        : (typeof raw === 'string' ? raw : '')
    } else if (control.control === 'select-object') {
      values[control.property] = instance[control.property]
    }
  }
  return values
}

function addEntityEntry(control: ProfileControl, source: 'new' | 'existing') {
  const entry = source === 'new' ? newEntityEntry(entitySubControls.value[control.property] ?? []) : newRefEntry()
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
  list[index] = source === 'new' ? newEntityEntry(entitySubControls.value[control.property] ?? []) : newRefEntry()
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
  const profileUri = profile?.profileUri || profile?.graphIri
  if (profileUri) {
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
  // {"@id"} refs; reuse entries contribute bare {"@id"} refs (no inline
  // entity). Repeated @ids dedupe within the property (emitEntityEntries) and
  // shared contextual entities collapse crate-wide via addEntity, so reusing
  // and describing the same entity never duplicates it.
  for (const control of entityControls.value) {
    const entries = entityEntries.value[control.property] ?? []
    if (!entries.length) continue
    const refs = emitEntityEntries(
      entries,
      entrySourcePolicy(control.entitySources),
      crateIdSet.value,
      entitySubControls.value[control.property] ?? [],
      // The emitted @type; the label slugs the synthetic @id (typeName may be a
      // full URI, M1, which would make an ugly @id).
      entityTypeName(control),
      entityTypeLabelFor(control),
      usedSyntheticIds,
      addEntity,
    )
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
      addEntity({ '@id': entry.url, '@type': 'File', name: entry.label || entry.url })
    }
  }
  return {
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
}

async function submit() {
  if (!canSubmit.value) return
  submitError.value = null
  try {
    const roCrate = needsRoCrate.value ? buildRoCrate() : undefined
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
      profileId: profileId.value,
      profileIds: profileId.value ? [profileId.value] : [],
      contributors: creatorList.value.map((name) => ({ name, role: 'Contributor', affiliation: undefined })),
      doi: identifier.value.trim() || undefined,
      roCrate: roCrate ?? {},
    }
    emit('created', doc)
    emit('update:open', false)
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-3xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <FileJson2 class="h-4 w-4 text-primary" /> New metadata document
        </DialogTitle>
        <DialogDescription>
          Creates a real RO-Crate metadata document through the Aruna API.
        </DialogDescription>
      </DialogHeader>

      <div class="max-h-[70vh] space-y-4 overflow-y-auto px-1 scrollbar-thin">
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
            <Select v-model="profileId" :options="profileOptions" placeholder="Optional profile" class="mt-1" />
            <p v-if="selectedProfile" class="mt-1 text-[11px] text-muted-foreground">
              <template v-if="profileLoading">Loading profile rules…</template>
              <template v-else-if="profileInputCount">Adds {{ profileInputCount }} {{ profileInputCount === 1 ? 'field' : 'fields' }} below, <span class="text-destructive">*</span> marks required. The RO-Crate references {{ selectedProfile.name }} by its saved graph IRI.</template>
              <template v-else>No additional fields, the RO-Crate references {{ selectedProfile.name }} by its saved graph IRI (conformance only).</template>
            </p>
          </div>
        </div>

        <div v-if="profileId && profileLoadError && !profileLoadFailed" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          {{ profileLoadError }} You can still create the dataset, it will reference this profile via <code>conformsTo</code> when a profile URI is available.
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
          <p v-else class="mt-1 text-[11px] text-muted-foreground">Stored as the metadata document path in Aruna.</p>
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
        <div v-if="profileId && profileLoading" class="rounded-md border border-border p-3">
          <p class="text-[11px] text-muted-foreground">Loading the profile's fields…</p>
          <div class="mt-2 grid gap-3 sm:grid-cols-2">
            <Skeleton v-for="n in 4" :key="n" class="h-14" />
          </div>
        </div>
        <div v-else-if="profileLoadFailed" class="rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p class="text-xs font-medium text-destructive">The profile's fields could not be loaded.</p>
          <p class="mt-1 text-[11px] text-destructive/90">{{ profileLoadError }}</p>
          <p class="mt-1 text-[11px] text-muted-foreground">
            Without these rules the form would be missing the profile's required fields, so creation is blocked.
            Retry, or switch to "No profile reference" to continue without them.
          </p>
          <Button variant="outline" size="sm" class="mt-2" @click="loadSelectedProfileSchema">Retry</Button>
        </div>
        <template v-else>
          <div v-if="generatedScalarControls.length" class="grid gap-4 sm:grid-cols-2">
            <ProfileControlField
              v-for="control in generatedScalarControls"
              :key="control.property"
              :control="control"
              :model-value="generatedValues[control.property]"
              :violations="profileViolations.filter((item) => item.fieldId === control.property)"
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
              :presence-violations="profileViolations.filter((item) => item.fieldId === control.property)"
              :type-label="entityTypeLabelFor(control)"
              :crate-options="crateOptions"
              @add-new="addEntityEntry(control, 'new')"
              @add-existing="addEntityEntry(control, 'existing')"
              @remove="(index: number) => removeEntityEntry(control.property, index)"
              @switch-source="(index: number, source: 'new' | 'existing') => switchEntityEntrySource(control, index, source)"
              @update="(index: number, subProperty: string, value: unknown) => setEntityEntryValue(control.property, index, subProperty, value)"
              @update-ref="(index: number, value: string) => setEntityEntryRef(control.property, index, value)"
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
        <label class="flex items-center justify-between rounded-md border border-border p-3 text-sm">
          <span>
            Public metadata
            <span class="block text-[11px] text-muted-foreground">Public documents are visible without a bearer token.</span>
          </span>
          <Switch :checked="isPublic" @update:checked="(v: boolean) => (isPublic = v)" />
        </label>
        <div v-if="submitError" class="text-xs text-destructive">{{ submitError }}</div>
      </div>

      <div v-if="!canSubmit && !saving && currentUser && submitBlockerSummary.length" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
        {{ submitBlockerSummary.join(' ') }}
      </div>

      <DialogFooter>
        <DialogClose><Button variant="outline">Cancel</Button></DialogClose>
        <Button :disabled="!canSubmit || saving" @click="submit">
          {{ saving ? 'Creating…' : 'Create metadata' }}
        </Button>
      </DialogFooter>

      <CreateGroupDialog v-model:open="createGroupOpen" @created="(group) => (groupId = group.group_id)" />
    </DialogContent>
  </Dialog>
</template>
