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
import SelectDataDialog from '@/components/data/SelectDataDialog.vue'
import DatasetEntityInstances from '@/components/metadata/DatasetEntityInstances.vue'
import ProfileControlField from '@/components/metadata/ProfileControlField.vue'
import { computed, ref, watch } from 'vue'
import { Check, FileJson2, Plus, X } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import type { MetadataDoc } from '@/data/types'
import { controlsFromRules, defaultControlValues, normalizeProfileValues } from '@/lib/profiles/controls'
import { buildEntityInstance, emitEntityReference, emitSelectObject, isHasPartUri, slugify, uniqueId } from '@/lib/profiles/emit'
import { licenseEntity, parseProfileCrate } from '@/lib/profiles/rocrate'
import { schemaFromPropertyRules } from '@/lib/profiles/schema'
import { buildProfileContext, isSchemaOrgUri } from '@/lib/profiles/propertyCatalog'
import { entityTypeLabel } from '@/lib/profiles/entityTypes'
import { isAbsoluteUri, isInvalidReferenceUri, REFERENCE_URI_MESSAGE } from '@/lib/profiles/uri'
import { validateProfileData, validateRequiredInstances } from '@/lib/profiles/validate'
import { entityClassKey, scopeViolations, scopedViolation, type ViolationScope } from '@/lib/profiles/evaluate'
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

// Monotonic per-instance identity so entity-instance cards key on a stable uid
// rather than their array index (mirrors the builder draft uid discipline).
let entityInstanceUid = 0

const props = defineProps<{
  open: boolean
  defaultProfileId?: string
}>()

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'created', doc: MetadataDoc): void
}>()

const { groups, profiles, metadata, createMetadata, loadRoCrate, saving, currentUser } = useAruna()
const { writesDisabled } = useConnectivity()

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
const selectDataOpen = ref(false)
const profileSchema = ref<JsonSchema | undefined>()
const profileControls = ref<ProfileControl[]>([])
// The raw Dataset property rules behind profileControls, kept so hasPart rules can
// be detected by propertyUri (isHasPartUri) and their requiredInstances validated
// — ProfileControl carries neither propertyUri nor a way back to the rule.
const profileDatasetRules = ref<ProfilePropertyRule[]>([])
const profileEntityRules = ref<ProfileEntityRule[]>([])
const profileContextTerms = ref<Record<string, string>>({})
const generatedValues = ref<Record<string, unknown>>({})
// Inline entity-ref instance state, keyed by the entity control property
// (valueName). Each instance is a record of scalar/URI values keyed by sub-control
// property. Only `referenceMode: inline` (or absent) controls use this.
const entityInstances = ref<Record<string, Array<Record<string, unknown>>>>({})
// External/crate entity-ref values, keyed by control property: a single reference
// holds a URI/id string, a multiple reference a string array. Emitted via
// emitEntityReference (bare `{"@id"}` refs, no inline entity).
const entityRefValues = ref<Record<string, unknown>>({})
const profileLoading = ref(false)
const profileLoadError = ref<string | null>(null)
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
// inline (or absent) entity controls render a sub-form (DatasetEntityInstances);
// external / crate controls render a URI input / crate picker (ProfileControlField).
const inlineEntityControls = computed(() => entityControls.value.filter((control) => !isReferenceMode(control)))
const referenceEntityControls = computed(() => entityControls.value.filter(isReferenceMode))
function isReferenceMode(control: ProfileControl): boolean {
  return control.referenceMode === 'external' || control.referenceMode === 'crate'
}
// Crate-local pick options for `referenceMode: 'crate'` controls: the current data
// references, whose `{"@id"}` is the reference url (the same id the hasPart File
// entity carries), so a crate reference resolves to that entity.
const crateOptions = computed(() => dataRefList.value.map((entry) => ({ value: entry.url, label: entry.label || entry.url })))

// Data references as `{ id, name }` candidates for hasPart required-instance
// matching. Built EXACTLY the way buildRoCrate names/ids the hasPart File entities
// (@id = url, name = label || url) so validation agrees with emission.
const hasPartEntries = computed(() => dataRefList.value.map((entry) => ({ id: entry.url, name: entry.label || entry.url })))
// Blocking (MUST) / warning (SHOULD) violations for each required instance a
// hasPart rule does not find among the data references.
const hasPartRequiredViolations = computed<ProfileViolation[]>(() =>
  scopeViolations(
    { profileSlug: profileId.value, entity: 'Dataset' },
    hasPartRules.value.flatMap((rule) => validateRequiredInstances(rule, hasPartEntries.value)),
  ),
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
  for (const control of inlineEntityControls.value) {
    map[control.property] = control.entityRule
      ? controlsFromRules(control.entityRule.propertyRules, profileEntityRules.value)
      : controlsFromRules([MINIMAL_ENTITY_RULE], profileEntityRules.value)
  }
  return map
})
// Per-entity JSON Schema used for per-instance scalar validation.
const entitySchemas = computed<Record<string, JsonSchema | undefined>>(() => {
  const map: Record<string, JsonSchema | undefined> = {}
  for (const control of inlineEntityControls.value) {
    map[control.property] = control.entityRule
      ? schemaFromPropertyRules(entityBasics(control.entityRule), control.entityRule.propertyRules)
      : schemaFromPropertyRules({ name: entityTypeLabelFor(control), description: '' }, [MINIMAL_ENTITY_RULE])
  }
  return map
})

// The reference value a control actually contributes, reconciled with the current
// form state so validation and emission never disagree: external blanks are dropped
// so an empty repeatable row can't satisfy required/minItems and then emit nothing
// (H1); crate ids no longer present in the data references are dropped so a removed
// data reference resurfaces its MUST/minItems violation instead of emitting a
// dangling `{"@id"}` (M4). Mirrors instanceValidationValues' nested-ref trimming.
function effectiveEntityRefValue(control: ProfileControl): unknown {
  const raw = entityRefValues.value[control.property]
  if (control.referenceMode === 'crate') {
    const valid = new Set(dataRefList.value.map((entry) => entry.url))
    return control.multiple
      ? (Array.isArray(raw) ? raw.map(String) : []).filter((id) => valid.has(id))
      : (typeof raw === 'string' && valid.has(raw) ? raw : '')
  }
  return control.multiple
    ? (Array.isArray(raw) ? raw.map((entry) => String(entry).trim()).filter(Boolean) : [])
    : (typeof raw === 'string' ? raw.trim() : '')
}

// The values record fed to the Dataset schema validator: scalar profile values
// plus each entity control's instance array (so isEmptyValue([]) drives the
// required/recommended presence checks on entity references).
const normalizedGeneratedValues = computed(() => {
  const values: Record<string, unknown> = {
    ...coreProfileValues(),
    ...normalizeProfileValues(generatedValues.value, generatedScalarControls.value),
  }
  // Inline entity refs: the instance array drives presence + list cardinality on
  // the reference itself (isEmptyValue([]) → missing, length → min/maxItems).
  for (const control of inlineEntityControls.value) {
    values[control.property] = entityInstances.value[control.property] ?? []
  }
  // External/crate refs: the effective URI/id string (single) or string array
  // (multiple) — blanks and stale crate ids pruned (effectiveEntityRefValue) so the
  // schema's presence + cardinality checks fire on what will actually be emitted.
  // Format is checked separately (validate.ts does not enforce iri / iri-reference).
  for (const control of referenceEntityControls.value) {
    values[control.property] = effectiveEntityRefValue(control)
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
const profileViolations = computed(() =>
  scopeViolations({ profileSlug: profileId.value, entity: 'Dataset' }, validateProfileData(profileSchema.value, normalizedGeneratedValues.value)),
)
const profileCollisionKeys = computed(() => profileControls.value.map((control) => control.property).filter((property) => reservedDatasetKeys.has(property)))

// Per-instance scalar violations for every entity control, keyed by control
// property. Outer array index aligns with the instance index.
const entityInstanceViolations = computed<Record<string, ProfileViolation[][]>>(() => {
  const map: Record<string, ProfileViolation[][]> = {}
  for (const control of inlineEntityControls.value) {
    const subControls = entitySubControls.value[control.property] ?? []
    const schema = entitySchemas.value[control.property]
    const instances = entityInstances.value[control.property] ?? []
    map[control.property] = instances.map((instance, index) => {
      const scope: ViolationScope = { profileSlug: profileId.value, entity: entityClassKey(control.entityRule, control.entityTypes), instance: index }
      return [
        ...scopeViolations(scope, validateProfileData(schema, instanceValidationValues(instance, subControls))),
        ...referenceUriViolations(scope, instance, subControls),
      ]
    })
  }
  return map
})

// Nested (depth-1) entity references are plain URI inputs; a non-empty value that
// is not an absolute URI is a blocking field error (it would emit a broken
// `{"@id"}` reference). Surfaced inline via entityInstanceViolations and counted
// in entityInstanceErrorCount so it gates submit.
function referenceUriViolations(scope: ViolationScope, instance: Record<string, unknown>, subControls: ProfileControl[]): ProfileViolation[] {
  const violations: ProfileViolation[] = []
  for (const control of subControls) {
    if (control.control !== 'entity') continue
    const raw = instance[control.property]
    // Multiple references validate every entry; single validates the one value.
    const entries = control.multiple ? (Array.isArray(raw) ? raw : []) : [raw]
    entries.forEach((entry, entryIndex) => {
      if (typeof entry === 'string' && isInvalidReferenceUri(entry)) {
        violations.push(
          scopedViolation(
            scope,
            'format.uri',
            control.property,
            REFERENCE_URI_MESSAGE,
            'error',
            control.multiple ? `/${control.property}/${entryIndex}` : `/${control.property}`,
          ),
        )
      }
    })
  }
  return violations
}
const entityInstanceErrorCount = computed(() => {
  let count = 0
  for (const perInstance of Object.values(entityInstanceViolations.value)) {
    for (const violations of perInstance) count += violations.filter((violation) => violation.severity === 'error').length
  }
  return count
})

// External references are absolute URIs typed by the author; a non-empty value
// that is not one is a blocking error (it would emit a broken `{"@id"}`). Mirrors
// referenceUriViolations for nested refs; crate references are picked from a list
// so they need no format check. Shown inline by ProfileControlField (single) /
// per-row; these feed submit gating (canSubmit + the footer count).
const entityReferenceFormatViolations = computed<ProfileViolation[]>(() => {
  const out: ProfileViolation[] = []
  for (const control of referenceEntityControls.value) {
    if (control.referenceMode !== 'external') continue
    const raw = entityRefValues.value[control.property]
    const entries = control.multiple ? (Array.isArray(raw) ? raw : []) : [raw]
    entries.forEach((entry, index) => {
      if (typeof entry === 'string' && isInvalidReferenceUri(entry)) {
        out.push(
          scopedViolation(
            { profileSlug: profileId.value, entity: 'Dataset' },
            'format.uri',
            control.property,
            REFERENCE_URI_MESSAGE,
            'error',
            control.multiple ? `/${control.property}/${index}` : `/${control.property}`,
          ),
        )
      }
    })
  }
  return out
})

// Violations rendered on a reference control: schema presence / cardinality always,
// plus the single-reference URI-format error (a multiple reference shows its format
// errors per-row inside ProfileControlField, so they are not passed again here).
function referenceControlViolations(control: ProfileControl): ProfileViolation[] {
  const base = profileViolations.value.filter((violation) => violation.fieldId === control.property)
  if (control.multiple) return base
  return [...base, ...entityReferenceFormatViolations.value.filter((violation) => violation.fieldId === control.property)]
}

function setEntityRefValue(property: string, value: unknown) {
  entityRefValues.value = { ...entityRefValues.value, [property]: value }
}

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
    out.unshift(scopedViolation({ profileSlug: profileId.value, entity: 'Dataset' }, 'required', 'license', scaffoldFieldErrors.value.license))
  }
  return out
})
const hasEntityInstances = computed(() =>
  inlineEntityControls.value.some((control) => (entityInstances.value[control.property] ?? []).length),
)
const hasEntityReferences = computed(() =>
  referenceEntityControls.value.some((control) => {
    const value = entityRefValues.value[control.property]
    return Array.isArray(value) ? value.some((entry) => String(entry).trim()) : Boolean(String(value ?? '').trim())
  }),
)

// Anything beyond the scaffold fields requires submitting a full RO-Crate.
const needsRoCrate = computed(() =>
  Boolean(
    profileId.value
      || (showKeywordsScaffold.value && keywordList.value.length)
      || (showAuthorsScaffold.value && creatorList.value.length)
      || (showIdentifierScaffold.value && identifier.value.trim())
      || dataRefList.value.length
      || hasEntityInstances.value
      || hasEntityReferences.value
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
    && !profileCollisionKeys.value.length
    && !hasPartScalarCollisionKeys.value.length
    && !profileViolations.value.some((violation) => violation.severity === 'error')
    && !entityInstanceErrorCount.value
    && !entityReferenceFormatViolations.value.length
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
    + entityInstanceErrorCount.value
    + entityReferenceFormatViolations.value.length
    + hasPartRequiredViolations.value.filter((violation) => violation.severity === 'error').length
    + dataRefs.value.filter(dataRefUrlError).length
  if (fieldErrorCount) parts.push(`${fieldErrorCount} ${fieldErrorCount === 1 ? 'field needs' : 'fields need'} attention (marked at the inputs).`)
  if (profileLoading.value) parts.push('Waiting for the profile rules to finish loading.')
  return parts
})

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
  try {
    const rocrate = await loadRoCrate(profile.documentId)
    if (token !== profileLoadToken) return
    const parsed = parseProfileCrate(rocrate)
    applyParsedProfile(parsed.entityRules, parsed.datasetPropertyRules, parsed.schema, parsed.contextTerms)
    if (!parsed.schema && !parsed.entityRules.length) profileLoadError.value = 'Selected profile has no machine-readable rules.'
  } catch (err) {
    if (token !== profileLoadToken) return
    profileLoadError.value = err instanceof Error ? err.message : String(err)
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
  entityInstances.value = {}
  entityRefValues.value = {}
  profileLoadError.value = null
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
  // Required (MUST) inline entity references start with one instance so their
  // sub-form shows up immediately instead of hiding behind an "Add" click; the
  // instance's own required sub-fields then flag inline what still needs filling.
  // SHOULD/MAY entities keep the explicit Add so an untouched form never emits (or
  // silently satisfies a recommendation with) an empty entity. External/crate and
  // hasPart references have no sub-form and are seeded below / bound to Data references.
  const seeded: Record<string, Array<Record<string, unknown>>> = {}
  const seededRefs: Record<string, unknown> = {}
  for (const control of controls) {
    if (control.control !== 'entity' || builtInDatasetKeys.has(control.property) || hasPartProps.has(control.property)) continue
    if (control.referenceMode === 'external' || control.referenceMode === 'crate') {
      seededRefs[control.property] = control.multiple ? [] : ''
      continue
    }
    if (!control.required) continue
    const subControls = control.entityRule
      ? controlsFromRules(control.entityRule.propertyRules, entityRules)
      : controlsFromRules([MINIMAL_ENTITY_RULE], entityRules)
    seeded[control.property] = [newEntityInstance(subControls)]
  }
  entityInstances.value = seeded
  entityRefValues.value = seededRefs
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

// A fresh instance for an entity control: scalar controls seeded from defaults,
// nested entity references seeded as empty URI strings (depth-1 reference input).
function newEntityInstance(subControls: ProfileControl[]): Record<string, unknown> {
  const values = defaultControlValues(subControls)
  for (const control of subControls) {
    // Single reference → one URI string; multiple → a list of URI strings (D5).
    if (control.control === 'entity') values[control.property] = control.multiple ? [] : ''
  }
  // Stable per-instance key for card/collapse state (not a control property, so
  // it is ignored by normalization and never emitted into the crate).
  values.__uid = ++entityInstanceUid
  return values
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

function addEntityInstance(control: ProfileControl) {
  const subControls = entitySubControls.value[control.property] ?? []
  const list = [...(entityInstances.value[control.property] ?? []), newEntityInstance(subControls)]
  entityInstances.value = { ...entityInstances.value, [control.property]: list }
}

function removeEntityInstance(property: string, index: number) {
  const list = [...(entityInstances.value[property] ?? [])]
  list.splice(index, 1)
  entityInstances.value = { ...entityInstances.value, [property]: list }
}

function setEntityInstanceValue(property: string, index: number, subProperty: string, value: unknown) {
  const list = [...(entityInstances.value[property] ?? [])]
  if (!list[index]) return
  list[index] = { ...list[index], [subProperty]: value }
  entityInstances.value = { ...entityInstances.value, [property]: list }
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
      addEntity({ '@id': id, '@type': 'Person', name })
      return { '@id': id }
    })
  }

  // Inline entity references → flattened contextual entities + {"@id"} refs.
  for (const control of inlineEntityControls.value) {
    const instances = entityInstances.value[control.property] ?? []
    if (!instances.length) continue
    const subControls = entitySubControls.value[control.property] ?? []
    const typeName = entityTypeName(control)
    // A short label for the synthetic @id slug — typeName may be a full URI (M1),
    // which would make an ugly `@id`, so slug from the human label instead.
    const typeLabel = entityTypeLabelFor(control)
    const refs: Array<Record<string, unknown>> = []
    const seenRefs = new Set<string>()
    instances.forEach((instance, index) => {
      const entity = buildEntityInstance(instance, subControls, typeName, typeLabel, index, usedSyntheticIds, addEntity)
      addEntity(entity)
      const id = String(entity['@id'])
      if (seenRefs.has(id)) return
      seenRefs.add(id)
      refs.push({ '@id': id })
    })
    if (!refs.length) continue
    dataset[control.property] = control.multiple ? refs : refs[0]
  }

  // External / crate entity references → bare {"@id"} reference(s), no inline entity.
  // External values are absolute URIs; crate values are crate-local ids passed
  // through from the data-reference picker (they resolve to hasPart File entities).
  for (const control of referenceEntityControls.value) {
    // Emit the effective value (blanks + stale crate ids pruned) so a removed data
    // reference never leaves a dangling `{"@id"}` behind (M4), matching validation.
    const ref = emitEntityReference(control, effectiveEntityRefValue(control))
    if (ref) dataset[control.property] = ref
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
              <template v-else-if="profileInputCount">Adds {{ profileInputCount }} {{ profileInputCount === 1 ? 'field' : 'fields' }} below — <span class="text-destructive">*</span> marks required. The RO-Crate references {{ selectedProfile.name }} by its saved graph IRI.</template>
              <template v-else>No additional fields — the RO-Crate references {{ selectedProfile.name }} by its saved graph IRI (conformance only).</template>
            </p>
          </div>
        </div>

        <div v-if="profileId && profileLoadError" class="flex items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <span>
            Profile inputs can't be generated or validated ({{ profileLoadError }}). You can still create the dataset — it will reference this profile via <code>conformsTo</code> when a profile URI is available.
          </span>
          <Button variant="outline" size="sm" class="shrink-0" @click="loadSelectedProfileSchema">Try again</Button>
        </div>
        <div v-if="profileCollisionKeys.length" class="text-xs text-destructive">
          Profile field target collides with built-in dataset fields: {{ profileCollisionKeys.join(', ') }}.
        </div>
        <div v-if="hasPartScalarCollisionKeys.length" class="text-xs text-destructive">
          A hasPart rule must be an entity reference so it can bind to the Data references section. These hasPart rules use a scalar value and can't be applied: {{ hasPartScalarCollisionKeys.join(', ') }}.
        </div>

        <div>
          <label class="text-xs font-medium text-foreground">Title</label>
          <Input v-model="title" class="mt-1" placeholder="Dataset title" :invalid="scaffoldInvalid('title', 'name')" @blur="fillPath" />
          <p v-if="scaffoldFieldErrors.title" class="mt-1 text-[11px] text-destructive">{{ scaffoldFieldErrors.title }}</p>
          <template v-if="!scaffoldFieldErrors.title">
            <template v-for="violation in builtInViolations.name ?? []" :key="violation.constraint + violation.pointer">
              <p class="mt-1 text-[11px]" :title="violation.ruleId" :class="violation.severity === 'error' ? 'text-destructive' : 'text-amber-800 dark:text-amber-300'">{{ violation.message }}</p>
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
            <template v-for="violation in builtInViolations.description ?? []" :key="violation.constraint + violation.pointer">
              <p class="mt-1 text-[11px]" :title="violation.ruleId" :class="violation.severity === 'error' ? 'text-destructive' : 'text-amber-800 dark:text-amber-300'">{{ violation.message }}</p>
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
                :key="violation.constraint + violation.pointer"
                class="mt-1 text-[11px]"
                :title="violation.ruleId"
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
                :key="violation.constraint + violation.pointer"
                class="mt-1 text-[11px]"
                :title="violation.ruleId"
                :class="violation.severity === 'error' ? 'text-destructive' : 'text-amber-800 dark:text-amber-300'"
              >{{ violation.message }}</p>
            </template>
          </div>
        </div>

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
        <div v-for="control in inlineEntityControls" :key="control.property">
          <DatasetEntityInstances
            :control="control"
            :sub-controls="entitySubControls[control.property] ?? []"
            :instances="entityInstances[control.property] ?? []"
            :instance-violations="entityInstanceViolations[control.property] ?? []"
            :presence-violations="profileViolations.filter((item) => item.fieldId === control.property)"
            :type-label="entityTypeLabelFor(control)"
            @add="addEntityInstance(control)"
            @remove="(index: number) => removeEntityInstance(control.property, index)"
            @update="(index: number, subProperty: string, value: unknown) => setEntityInstanceValue(control.property, index, subProperty, value)"
          />
        </div>
        <div v-for="control in referenceEntityControls" :key="control.property">
          <ProfileControlField
            :control="control"
            :model-value="entityRefValues[control.property]"
            :violations="referenceControlViolations(control)"
            :crate-options="control.referenceMode === 'crate' ? crateOptions : undefined"
            @update:model-value="(value: unknown) => setEntityRefValue(control.property, value)"
          />
        </div>

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
            <Button variant="outline" size="sm" @click="creators.push('')">
              <Plus class="size-3.5" /> Add author
            </Button>
          </div>
          <div v-for="(creator, index) in creators" :key="index" class="mt-1 flex items-center gap-2">
            <Input v-model="creators[index]" placeholder="Ada Lovelace" />
            <Button variant="ghost" size="icon" aria-label="Remove author" @click="creators.splice(index, 1)">
              <X />
            </Button>
          </div>
        </div>
        <div>
          <div class="flex items-center justify-between gap-3">
            <label class="text-xs font-medium text-foreground">Data references</label>
            <Button variant="outline" size="sm" @click="selectDataOpen = true">
              <Plus class="size-3.5" /> Add data reference
            </Button>
          </div>
          <p class="mt-1 text-[11px] text-muted-foreground">Each reference becomes a hasPart File entity in the RO-Crate.</p>
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
            :key="violation.constraint + violation.pointer"
            class="mt-1 text-[11px]"
            :title="violation.ruleId"
            :class="violation.severity === 'error' ? 'text-destructive' : 'text-amber-800 dark:text-amber-300'"
          >
            {{ violation.message }}
          </p>
          <div v-for="(entry, index) in dataRefs" :key="index" class="mt-1">
            <div class="flex items-center gap-2">
              <Input v-model="entry.label" placeholder="Label" class="w-2/5" />
              <Input v-model="entry.url" placeholder="s3://bucket/key or https://..." class="flex-1" :invalid="dataRefUrlError(entry) ? 'error' : undefined" />
              <Button variant="ghost" size="icon" aria-label="Remove data reference" @click="dataRefs.splice(index, 1)">
                <X />
              </Button>
            </div>
            <p v-if="dataRefUrlError(entry)" class="mt-1 text-[11px] text-destructive">
              {{ entry.url.trim() ? 'Use a valid absolute URL (http(s)://, s3://, …).' : 'Add a URL for this labelled reference, or remove it.' }}
            </p>
          </div>
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

      <div v-if="writesDisabled" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
        You're offline — creating metadata needs connectivity.
      </div>

      <DialogFooter>
        <DialogClose><Button variant="outline">Cancel</Button></DialogClose>
        <Button :disabled="!canSubmit || saving || writesDisabled" :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined" @click="submit">
          {{ saving ? 'Creating…' : 'Create metadata' }}
        </Button>
      </DialogFooter>

      <CreateGroupDialog v-model:open="createGroupOpen" @created="(group) => (groupId = group.group_id)" />
      <SelectDataDialog v-model:open="selectDataOpen" @add="(entry) => dataRefs.push(entry)" />
    </DialogContent>
  </Dialog>
</template>
