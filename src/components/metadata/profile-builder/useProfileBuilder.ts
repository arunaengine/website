import { computed, reactive, ref, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { buildProfileCrate, safeIdSegment } from '@/lib/profiles/rocrate'
import { schemaFromEntityRules } from '@/lib/profiles/schema'
import { deriveEntityObligation, referencesToType, type ModeFile } from '@/lib/profiles/mode'
import { CURATED_PROPERTY_TERMS, isSchemaOrgUri, mintTermUri } from '@/lib/profiles/propertyCatalog'
import { CURATED_ENTITY_TYPES, entityTypeLabel } from '@/lib/profiles/entityTypes'
import { isHasPartUri } from '@/lib/profiles/emit'
import {
  isAbsoluteUri,
  isDatasetType,
  isValidClassName,
  isValidPropertyTermName,
  normalizeTypeUri,
  sameSchemaOrgType,
  SCHEMA_ORG,
  termNameFromUri,
} from '@/lib/profiles/uri'
import { OBLIGATION_ORDER, PROFILE_OBLIGATION_LABELS, PROFILE_VALUE_KIND_LABELS } from '@/lib/profiles/labels'
import type {
  ProfileBasics,
  ProfileEntityRule,
  ProfileObligation,
  ProfilePropertyRule,
  ProfileReferenceMode,
  ProfileRequiredInstance,
  ProfileValueKind,
} from '@/lib/profiles/types'

// Two levels of builder-session lock on a baseline draft rule. `full` is the old
// all-or-nothing read-only (the Root Dataset entity itself). `structural` fixes a
// rule's identity — it cannot be removed and its propertyUri/valueName/label stay
// put — while leaving the specific affordances the RO-Crate baseline allows open
// (name/description obligation stays MUST; license/datePublished obligation is
// MUST↔SHOULD; license kind switches url↔select-url). Never serialized.
export type DraftLock = 'full' | 'structural'

// One "required contents" row (WS5): match a required list entry by exact name or
// exact @id, with optional author guidance. Maps to ProfileRequiredInstance on
// normalize. `match` picks which of name/id the value binds to.
export interface DraftRequiredInstance {
  match: 'name' | 'id'
  value: string
  hint: string
}

const DEFAULT_LICENSE = 'https://creativecommons.org/licenses/by/4.0/'

// ---------------------------------------------------------------------------
// Draft types: what the builder UI edits. Numeric constraints are held as
// strings while the user types (empty string = unset) and coerced to real
// numbers only during normalization to the strict lib types.
// ---------------------------------------------------------------------------

export interface DraftPropertyRule {
  // Stable, non-editable identity used only to key list items in the UI, so the
  // editor and property cards never bind to the wrong draft after reorders or
  // removals. Never serialized into the crate.
  uid: number
  id: string
  label: string
  description: string
  valueName: string
  // Absolute URI of the property term (mode input `id`). Empty = a custom term
  // whose URI is minted from the live slug + valueName at normalization time.
  propertyUri: string
  kind: ProfileValueKind
  // Target entity type URIs for kind 'entity'; ignored for scalar kinds.
  entityTypes: string[]
  obligation: ProfileObligation
  defaultValue: string | number
  example: string | number
  enumOptions: string
  pattern: string
  minLength: string | number
  maxLength: string | number
  minValue: string | number
  maxValue: string | number
  stepValue: string | number
  multipleValues: boolean
  // List cardinality for multi-valued rules (WS2). Held as strings while typing
  // (empty = unset); coerced to numbers at normalization and emitted only when the
  // rule is multi-valued. min >= 1, max >= min (validated in rulesErrors).
  minItems: string | number
  maxItems: string | number
  // Entity-kind reference mode (WS4): how a `{"@id"}` reference is realised.
  // Absent = 'inline' (the legacy default; stays byte-stable). Meaningless on
  // scalar kinds — normalize drops it.
  referenceMode?: ProfileReferenceMode
  // Entity-kind + multi-valued "required contents" (WS5): specific instances the
  // list MUST/SHOULD contain (e.g. a hasPart File named index.html).
  requiredInstances: DraftRequiredInstance[]
  // Authorable allowed-URL set for the `select-url` kind (WS3): a pick-list of
  // absolute URLs. Normalize re-emits these as the rule's `valueOptions`; the
  // draft hydrates them from an imported select-url's `valueOptions`.
  urlOptions: string[]
  // Raw Describo/Crate-O SelectObject options, imported-only and kept VERBATIM so a
  // preserved select-object rule re-exports its options unchanged (rendered as a
  // read-only summary card). select-url options travel through `urlOptions` instead.
  valueOptions?: unknown[]
  // Builder-session only: baseline RO-Crate rules render read-only (see DraftLock).
  // Never serialized — normalizeProperty drops it (there is no profile-edit flow).
  lock?: DraftLock
}

export interface DraftEntityRule {
  // Stable, non-editable identity used only to key the editor in the UI so a
  // captured/stale prop can never point at a different entity. Not serialized.
  uid: number
  id: string
  label: string
  description: string
  type: string
  // Canonical class short name (mode `classes` key / JSON-LD alias). For
  // schema.org types it is derived (display-only, `termNameFromUri(type)`); for
  // custom types it is editable and auto-filled. normalizeEntity resolves the
  // effective value; an empty draft className falls back to the derived name.
  className: string
  // No stored obligation: an entity's obligation is derived from which property
  // rules reference its type (see deriveEntityObligation / entityObligation).
  properties: DraftPropertyRule[]
  // Builder-session only: the fixed Root Dataset entity (`full`). Never serialized.
  lock?: DraftLock
}

// Shape ImportProfileSection hands to applyImport: basics + strict lib entity
// rules + the raw mode file (kept for verbatim re-export), plus import-event
// metadata for the persistent summary chip.
export interface ProfileImportResult {
  basics?: Partial<ProfileBasics>
  entityRules: ProfileEntityRule[]
  mode?: ModeFile | null
  kind?: 'mode' | 'crate'
  preservedKeys?: string[]
}

// What was imported, lifted into the builder so the confirmation survives step
// and tab navigation (the import section unmounts when hidden).
export interface ImportSummary {
  kind: 'mode' | 'crate'
  name?: string
  entityCount: number
  propertyCount: number
  preservedKeys: string[]
}

// A basics validation error anchored to the input it belongs to, so the step
// renders it inline. fieldId 'token' anchors to the bearer-token banner;
// undefined means callout-only.
export interface BasicsFieldError {
  fieldId?: string
  message: string
}

// ---------------------------------------------------------------------------
// Shared, instance-free option lists and helpers (imported by step components
// so they render the same choices the builder validates against).
// ---------------------------------------------------------------------------

// Human label only ("Required"/"Recommended"/"Optional"); the RFC-2119 keyword
// stays visible via an obligation Badge in the card/editor header, so the Select
// trigger stays compact in narrow grid cells.
export const OBLIGATION_OPTIONS = OBLIGATION_ORDER.map((value) => ({
  value,
  label: PROFILE_OBLIGATION_LABELS[value].label,
}))

export const VALUE_KIND_OPTIONS = (
  Object.entries(PROFILE_VALUE_KIND_LABELS) as [ProfileValueKind, string][]
).map(([value, label]) => ({ value, label }))

// Defensive string coercion: numeric inputs can emit numbers, so we never call
// `.trim()` on an unknown directly.
export function toText(value: unknown): string {
  if (value === undefined || value === null) return ''
  return String(value)
}

export function trimmed(value: unknown): string {
  return toText(value).trim()
}

export function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// Turn a label / id into a lower-camelCase RO-Crate property name. The result
// must satisfy isValidPropertyTermName (`^[a-z][A-Za-z0-9]*$`), so leading
// non-letters are stripped ("3D scan" -> "dScan") and the first surviving letter
// is lowercased — a derived name always passes validation.
export function propertyName(value: string): string {
  const words = value.split(/[^a-zA-Z0-9]+/).filter(Boolean)
  const camel = words
    .map((word, index) => (index ? word.charAt(0).toUpperCase() + word.slice(1) : word.toLowerCase()))
    .join('')
    .replace(/^[^a-zA-Z]+/, '')
  return camel ? camel.charAt(0).toLowerCase() + camel.slice(1) : ''
}

function splitOptions(value: unknown): string[] {
  return toText(value)
    .split(',')
    .map((option) => option.trim())
    .filter(Boolean)
}

function parseNumber(value: unknown): number | undefined {
  const text = trimmed(value)
  if (!text) return undefined
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : undefined
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

// L1: a select-url whose imported options include ANY non-string value is preserved
// verbatim and read-only (mirroring select-object) — we never coerce structured
// values to "[object Object]". All-string option sets stay fully authorable.
export function hasPreservedUrlOptions(options: readonly unknown[] | undefined): boolean {
  return Boolean(options?.some((option) => typeof option !== 'string'))
}

// L2: the four RO-Crate root-Dataset baseline property terms (schema.org).
// Recognized by URI (http/https-insensitive) so an imported/edited root rule can be
// re-locked and obligation-clamped independent of its label or id.
const BASELINE_ROOT_TERMS = [
  `${SCHEMA_ORG}name`,
  `${SCHEMA_ORG}description`,
  `${SCHEMA_ORG}datePublished`,
  `${SCHEMA_ORG}license`,
]
function isBaselineRootTerm(propertyUri: string): boolean {
  return BASELINE_ROOT_TERMS.some((term) => sameSchemaOrgType(propertyUri, term))
}

// L2: enforce the RO-Crate obligation floor on the re-locked root baseline rules at
// normalize time (not just in the UI): name/description are always MUST; license and
// datePublished floor at SHOULD (a stray MAY from an import becomes SHOULD). Only
// touches structurally-locked baseline rules, so authored rules pass through.
function clampBaselineObligation(property: DraftPropertyRule): ProfileObligation {
  if (property.lock !== 'structural') return property.obligation
  const uri = trimmed(property.propertyUri)
  if (sameSchemaOrgType(uri, `${SCHEMA_ORG}name`) || sameSchemaOrgType(uri, `${SCHEMA_ORG}description`)) {
    return 'MUST'
  }
  if (sameSchemaOrgType(uri, `${SCHEMA_ORG}license`) || sameSchemaOrgType(uri, `${SCHEMA_ORG}datePublished`)) {
    return property.obligation === 'MAY' ? 'SHOULD' : property.obligation
  }
  return property.obligation
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

// Monotonic counter for draft identity keys. Module-level so every draft ever
// created in this session gets a distinct, stable uid for Vue list keying.
let draftUidCounter = 0
function nextDraftUid(): number {
  return ++draftUidCounter
}

export function draftEntity(input: Partial<DraftEntityRule> = {}): DraftEntityRule {
  return {
    uid: input.uid ?? nextDraftUid(),
    id: input.id ?? '',
    label: input.label ?? '',
    description: input.description ?? '',
    type: input.type ?? 'http://schema.org/Dataset',
    className: input.className ?? '',
    properties: input.properties ?? [],
    lock: input.lock,
  }
}

export function draftProperty(input: Partial<DraftPropertyRule> = {}): DraftPropertyRule {
  const id = input.id ?? ''
  return {
    uid: input.uid ?? nextDraftUid(),
    id,
    label: input.label ?? '',
    description: input.description ?? '',
    valueName: input.valueName ?? propertyName(id),
    propertyUri: input.propertyUri ?? '',
    kind: input.kind ?? 'text',
    entityTypes: input.entityTypes ?? [],
    obligation: input.obligation ?? 'MAY',
    defaultValue: input.defaultValue ?? '',
    example: input.example ?? '',
    enumOptions: input.enumOptions ?? '',
    pattern: input.pattern ?? '',
    minLength: input.minLength ?? '',
    maxLength: input.maxLength ?? '',
    minValue: input.minValue ?? '',
    maxValue: input.maxValue ?? '',
    stepValue: input.stepValue ?? '',
    multipleValues: input.multipleValues ?? false,
    minItems: input.minItems ?? '',
    maxItems: input.maxItems ?? '',
    referenceMode: input.referenceMode,
    requiredInstances: input.requiredInstances ?? [],
    urlOptions: input.urlOptions ?? [],
    valueOptions: input.valueOptions,
    lock: input.lock,
  }
}

// Reverse of normalizeProperty/normalizeEntity: hydrate editable drafts from the
// strict lib rules produced by an import (mode file or profile crate). Numeric
// constraints come back as numbers, enum options as a comma-separated string.
export function draftFromPropertyRule(rule: ProfilePropertyRule, isRootEntity = false): DraftPropertyRule {
  // L1: a select-url that imported non-string options is preserved verbatim, so those
  // options are NOT lifted into the editable urlOptions list (they would coerce to
  // "[object Object]"); normalize re-emits the original valueOptions untouched.
  const preservedUrl = rule.kind === 'select-url' && hasPreservedUrlOptions(rule.valueOptions)
  return draftProperty({
    id: rule.id,
    label: rule.label,
    description: rule.description,
    valueName: rule.valueName,
    propertyUri: rule.propertyUri,
    kind: rule.kind,
    entityTypes: rule.entityTypes ? [...rule.entityTypes] : [],
    obligation: rule.obligation,
    defaultValue: rule.defaultValue ?? '',
    example: rule.example ?? '',
    enumOptions: (rule.enumOptions ?? []).join(', '),
    pattern: rule.pattern ?? '',
    minLength: rule.minLength ?? '',
    maxLength: rule.maxLength ?? '',
    minValue: rule.minValue ?? '',
    maxValue: rule.maxValue ?? '',
    stepValue: rule.stepValue ?? '',
    multipleValues: rule.multipleValues ?? false,
    minItems: rule.minItems ?? '',
    maxItems: rule.maxItems ?? '',
    referenceMode: rule.referenceMode,
    requiredInstances: (rule.requiredInstances ?? []).map(draftRequiredInstance),
    // All-string select-url options round-trip as the authorable URL list; preserved
    // (non-string) select-url and select-object keep their raw options on valueOptions.
    urlOptions: rule.kind === 'select-url' && !preservedUrl ? (rule.valueOptions ?? []).map((option) => toText(option)) : [],
    valueOptions: rule.valueOptions ? [...rule.valueOptions] : undefined,
    // L2: re-apply the RO-Crate structural lock to the root Dataset's baseline four
    // rules so an import/edit round-trip restores their fixed identity + obligation
    // floor instead of leaving them fully editable/removable.
    lock: isRootEntity && isBaselineRootTerm(rule.propertyUri) ? 'structural' : undefined,
  })
}

// Rehydrate a required-instance row from a strict lib instance. `id` takes
// precedence (when both are present only `id` survives the schema round-trip, see
// ProfileRequiredInstance), so an id-bearing instance matches by @id.
function draftRequiredInstance(instance: ProfileRequiredInstance): DraftRequiredInstance {
  const byId = instance.id !== undefined && instance.id !== ''
  return {
    match: byId ? 'id' : 'name',
    value: byId ? (instance.id ?? '') : (instance.name ?? ''),
    hint: instance.hint ?? '',
  }
}

export function draftFromEntityRule(rule: ProfileEntityRule, isRoot = false): DraftEntityRule {
  return draftEntity({
    id: rule.id,
    label: rule.label,
    description: rule.description,
    type: rule.type,
    // Keep the imported class alias so it round-trips instead of being re-derived.
    className: rule.className,
    // L2: forward the root flag so the Dataset root's baseline rules re-lock.
    properties: rule.propertyRules.map((property) => draftFromPropertyRule(property, isRoot)),
  })
}

// Seeded starting point: only the fixed RO-Crate Root Data Entity and its four
// baseline property rules. The entity is fully locked; the four property rules are
// `structural` (not removable, identity fixed) because the RO-Crate specification
// mandates them: "The Root Data Entity MUST have all of the properties listed
// below" — a presence requirement, so they default to obligation MUST. RO-Crate
// 1.2 treats datePublished/license as SHOULD, so their obligation is author-
// selectable (MUST↔SHOULD, portal default MUST); name/description stay MUST.
// License kind is switchable url↔select-url. Authors extend from here with their
// own rules and the opt-in templates below.
function defaultEntities(): DraftEntityRule[] {
  return [
    draftEntity({
      id: 'dataset',
      label: 'Root Dataset',
      type: 'http://schema.org/Dataset',
      description: 'The root RO-Crate dataset entity described by ro-crate-metadata.json about.',
      lock: 'full',
      properties: [
        draftProperty({ id: 'name', label: 'Name', valueName: 'name', propertyUri: 'http://schema.org/name', obligation: 'MUST', description: 'Human readable dataset title.', example: 'Proteomics run 42', lock: 'structural' }),
        draftProperty({ id: 'description', label: 'Description', valueName: 'description', propertyUri: 'http://schema.org/description', kind: 'longtext', obligation: 'MUST', description: 'Plain-language summary of the dataset.', lock: 'structural' }),
        draftProperty({ id: 'date-published', label: 'Date published', valueName: 'datePublished', propertyUri: 'http://schema.org/datePublished', kind: 'date', obligation: 'MUST', description: 'Publication date in ISO date format.', lock: 'structural' }),
        draftProperty({ id: 'license', label: 'License', valueName: 'license', propertyUri: 'http://schema.org/license', kind: 'url', obligation: 'MUST', description: 'License URL.', example: 'https://creativecommons.org/licenses/by/4.0/', lock: 'structural' }),
      ],
    }),
  ]
}

// ---------------------------------------------------------------------------
// Opt-in templates: example rules inserted on demand as fully editable (unlocked)
// drafts. Labels/ids are uniquified against the target on insert (see
// addPropertyTemplate/addEntityTemplate) so repeating a template never collides
// on the derived crate `@id`.
// ---------------------------------------------------------------------------

export interface PropertyRuleTemplate {
  key: string
  label: string
  create: () => DraftPropertyRule
}

export const PROPERTY_RULE_TEMPLATES: PropertyRuleTemplate[] = [
  {
    key: 'organism',
    label: 'Organism',
    create: () =>
      draftProperty({ id: 'organism', label: 'Organism', valueName: 'organism', obligation: 'MUST', description: 'Scientific organism name.', pattern: '^[A-Z][a-z]+ [a-z]+$', example: 'Homo sapiens' }),
  },
  {
    key: 'assay-type',
    label: 'Assay type',
    create: () =>
      draftProperty({ id: 'assay-type', label: 'Assay Type', valueName: 'assayType', kind: 'enum', obligation: 'SHOULD', description: 'Primary assay modality.', enumOptions: 'LC-MS, MALDI-TOF' }),
  },
]

export interface EntityRuleTemplate {
  key: string
  label: string
  create: () => DraftEntityRule
}

export const ENTITY_RULE_TEMPLATES: EntityRuleTemplate[] = [
  {
    key: 'person',
    label: 'Contributor Person',
    create: () =>
      draftEntity({
        id: 'person',
        label: 'Contributor Person',
        type: 'http://schema.org/Person',
        description: 'Optional contextual Person entities referenced from Dataset author/creator/contributor properties.',
        properties: [
          draftProperty({ id: 'name', label: 'Name', valueName: 'name', propertyUri: 'http://schema.org/name', obligation: 'MUST', description: 'Contributor display name.', example: 'Ada Lovelace' }),
          draftProperty({ id: 'identifier', label: 'Identifier', valueName: 'identifier', propertyUri: 'http://schema.org/identifier', kind: 'url', obligation: 'SHOULD', description: 'Persistent contributor identifier such as ORCID.' }),
        ],
      }),
  },
]

// Smallest suffix (>= 2) that makes `baseId` collision-free against `taken`, or 0
// when no suffix is needed. Used to uniquify repeated template inserts.
function uniquifyDraftId(taken: Set<string>, baseId: string): number {
  if (!taken.has(baseId)) return 0
  let n = 2
  while (taken.has(`${baseId}-${n}`)) n++
  return n
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export function useProfileBuilder() {
  const { groups, currentUser } = useAruna()

  const groupId = ref('')
  const name = ref('')
  const slug = ref('')
  const slugTouched = ref(false)
  const description = ref('')
  const version = ref('0.1.0')
  const datePublished = ref(todayIso())
  const license = ref(DEFAULT_LICENSE)
  const isPublic = ref(false)
  const entities = ref<DraftEntityRule[]>(defaultEntities())
  const selectedEntityIndex = ref(0)
  const submitError = ref<string | null>(null)
  // Raw imported mode file, preserved verbatim and re-emitted by buildProfileCrate
  // so features the builder does not model (layouts, lookup, localisation…) survive.
  const importedMode = ref<ModeFile | null>(null)
  // Summary of the last successful import (survives tab/step navigation).
  const importSummary = ref<ImportSummary | null>(null)
  // uid of a property draft just added by a quick action (M2). PropertyRuleCard
  // watches this to scroll the freshly-created card into view and briefly flash it,
  // then clears it, so a one-click "Add reference" lands the author on the new rule.
  const highlightPropertyUid = ref<number | null>(null)

  // Keep the slug in sync with the name until the author edits the slug directly.
  watch(name, (value) => {
    if (!slugTouched.value) slug.value = slugify(toText(value))
  })

  function reset() {
    groupId.value = groups.value[0]?.id ?? ''
    name.value = ''
    slug.value = ''
    slugTouched.value = false
    description.value = ''
    version.value = '0.1.0'
    datePublished.value = todayIso()
    license.value = DEFAULT_LICENSE
    isPublic.value = false
    submitError.value = null
    importedMode.value = null
    importSummary.value = null
    highlightPropertyUid.value = null
    entities.value = defaultEntities()
    selectedEntityIndex.value = 0
  }

  // True once the author has typed content or changed the rule set, so an
  // import can warn before it replaces the draft wholesale.
  const hasEdits = computed(() => {
    if (importSummary.value) return true
    if (trimmed(name.value) || trimmed(description.value)) return true
    const defaults = defaultEntities()
    if (entities.value.length !== defaults.length) return true
    const root = entities.value[0]
    const defaultRoot = defaults[0]
    return Boolean(root && defaultRoot && root.properties.length !== defaultRoot.properties.length)
  })

  // Populate the builder from an imported profile (mode file or profile crate).
  // Imported rules land as fully editable drafts; the raw mode is kept for
  // verbatim re-export. Missing basics fields are left as-is.
  function applyImport(result: ProfileImportResult) {
    const basics = result.basics ?? {}
    if (basics.name !== undefined) name.value = basics.name
    if (basics.description !== undefined) description.value = basics.description
    if (basics.version) version.value = basics.version
    if (basics.datePublished) datePublished.value = basics.datePublished
    if (basics.license) license.value = basics.license
    if (!slugTouched.value && basics.name) slug.value = slugify(basics.name)
    // L2: the first Dataset-typed rule is the RO-Crate root — only its baseline four
    // rules re-lock as structural (a nested Dataset sub-entity is left untouched).
    const rootIndex = result.entityRules.findIndex((entity) => isDatasetType(normalizeTypeUri(entity.type)))
    entities.value = result.entityRules.length
      ? result.entityRules.map((entity, index) => draftFromEntityRule(entity, index === rootIndex))
      : defaultEntities()
    selectedEntityIndex.value = 0
    importedMode.value = result.mode ?? null
    importSummary.value = {
      kind: result.kind ?? 'crate',
      name: result.basics?.name,
      entityCount: result.entityRules.length,
      propertyCount: result.entityRules.reduce((total, entity) => total + entity.propertyRules.length, 0),
      preservedKeys: result.preservedKeys ?? [],
    }
    submitError.value = null
  }

  function setSlug(value: string | number) {
    slug.value = toText(value)
    slugTouched.value = true
  }

  const selectedEntity = computed<DraftEntityRule | undefined>(() => entities.value[selectedEntityIndex.value])

  function selectEntity(index: number) {
    selectedEntityIndex.value = index
  }

  // A property valueName unique within `owner`, suffixing 2,3,… on collision, so a
  // prefilled quick-add never lands on a duplicate name that would gate Next.
  function uniqueValueName(base: string, owner: DraftEntityRule): string {
    const taken = new Set(owner.properties.map((property) => trimmed(property.valueName)))
    if (!taken.has(base)) return base
    let n = 2
    while (taken.has(`${base}${n}`)) n++
    return `${base}${n}`
  }

  // New entity rules default to Person (H2), not Dataset: a second Dataset rule
  // duplicates the root's class name and traps first-timers, whereas Person lands
  // them on the guided "not referenced yet" path.
  function addEntity() {
    entities.value.push(draftEntity({ type: `${SCHEMA_ORG}Person` }))
    selectedEntityIndex.value = entities.value.length - 1
  }

  // Quick action (D6): create an entity rule for a referenced target type and
  // select it. If a rule for the type already exists, select that one instead of
  // adding a colliding duplicate. className is derived here for schema.org types
  // (left blank so the editor keeps deriving it) and set for custom types. The new
  // rule is seeded with a MUST name property (M2) so it does not instantly gate
  // Next with "needs at least one property rule".
  function addEntityRuleForType(type: string, label?: string) {
    const uri = normalizeTypeUri(type)
    if (!uri) return
    const existing = entities.value.findIndex((entity) => sameSchemaOrgType(normalizeTypeUri(entity.type), uri))
    if (existing >= 0) {
      selectedEntityIndex.value = existing
      return
    }
    entities.value.push(
      draftEntity({
        type: uri,
        label: trimmed(label) || entityTypeLabel(uri),
        className: isSchemaOrgUri(uri) ? '' : termNameFromUri(uri),
        properties: [
          draftProperty({
            id: 'name',
            label: 'Name',
            valueName: 'name',
            propertyUri: `${SCHEMA_ORG}name`,
            obligation: 'MUST',
            description: `The name of the ${trimmed(label) || entityTypeLabel(uri)}.`,
          }),
        ],
      }),
    )
    selectedEntityIndex.value = entities.value.length - 1
  }

  // Referenced-by quick action (D6): append a prefilled entity-reference property
  // on `owner` that targets `target`, then navigate to the owner so the new rule
  // is visible. Makes an unreferenced entity rule take effect in one click. For a
  // Person/Organization target the prefill uses schema.org `contributor` (M2)
  // rather than minting a term off the label; other targets mint from the label.
  function addReferenceProperty(owner: DraftEntityRule, target: DraftEntityRule) {
    const targetType = normalizeTypeUri(target.type)
    const isPersonOrOrg =
      sameSchemaOrgType(targetType, `${SCHEMA_ORG}Person`) || sameSchemaOrgType(targetType, `${SCHEMA_ORG}Organization`)
    const draft = isPersonOrOrg
      ? draftProperty({
          label: 'Contributor',
          valueName: uniqueValueName('contributor', owner),
          propertyUri: `${SCHEMA_ORG}contributor`,
          kind: 'entity',
          entityTypes: [targetType],
          obligation: 'MAY',
        })
      : draftProperty({
          label: trimmed(target.label),
          valueName: uniqueValueName(propertyName(trimmed(target.label)) || 'reference', owner),
          kind: 'entity',
          entityTypes: [targetType],
          obligation: 'MAY',
        })
    owner.properties.push(draft)
    const ownerIndex = entities.value.indexOf(owner)
    if (ownerIndex >= 0) selectedEntityIndex.value = ownerIndex
    // Flag the new card so PropertyRuleCard scrolls it into view and flashes it.
    highlightPropertyUid.value = draft.uid
  }

  function removeEntity(index: number) {
    // Defense in depth: locked (RO-Crate baseline) entities are never removable.
    if (entities.value[index]?.lock) return
    entities.value.splice(index, 1)
    if (selectedEntityIndex.value >= entities.value.length) {
      selectedEntityIndex.value = Math.max(0, entities.value.length - 1)
    }
  }

  function addProperty(entity: DraftEntityRule) {
    const draft = draftProperty()
    entity.properties.push(draft)
    highlightPropertyUid.value = draft.uid
  }

  function addPropertyTemplate(entity: DraftEntityRule, template: PropertyRuleTemplate) {
    const draft = template.create()
    const n = uniquifyDraftId(new Set(entity.properties.map((property) => property.id)), draft.id)
    if (n) {
      draft.id = `${draft.id}-${n}`
      draft.label = `${draft.label} ${n}`
      draft.valueName = `${draft.valueName}${n}`
    }
    entity.properties.push(draft)
    highlightPropertyUid.value = draft.uid
  }

  function addEntityTemplate(template: EntityRuleTemplate) {
    const draft = template.create()
    const n = uniquifyDraftId(new Set(entities.value.map((entity) => entity.id)), draft.id)
    if (n) {
      draft.id = `${draft.id}-${n}`
      draft.label = `${draft.label} ${n}`
    }
    entities.value.push(draft)
    selectedEntityIndex.value = entities.value.length - 1
  }

  function removeProperty(entity: DraftEntityRule, index: number) {
    // Defense in depth: locked (RO-Crate baseline) rules are never removable.
    if (entity.properties[index]?.lock) return
    entity.properties.splice(index, 1)
  }

  function profileBasics(): ProfileBasics {
    return {
      slug: trimmed(slug.value),
      name: trimmed(name.value),
      description: trimmed(description.value),
      version: trimmed(version.value) || undefined,
      datePublished: toText(datePublished.value),
      license: trimmed(license.value),
    }
  }

  function normalizeEntity(entity: DraftEntityRule, index: number): ProfileEntityRule | undefined {
    const id = safeIdSegment(toText(entity.id) || toText(entity.label) || `entity-${index + 1}`)
    const label = trimmed(entity.label)
    const type = normalizeTypeUri(entity.type)
    if (!id || !label || !type) return undefined
    // className (D3/H4): preserve the draft's className for ALL types, including
    // schema.org, falling back to the derived name only when empty — mirrors
    // rocrate.ts normalizeEntityRules so an imported schema.org-typed alias (e.g. a
    // Person class keyed `Author`) survives a builder normalize→export cycle
    // instead of being flattened back to termNameFromUri(type).
    const className = trimmed(entity.className) || termNameFromUri(type)
    return {
      id,
      label,
      description: trimmed(entity.description),
      type,
      className,
      propertyRules: entity.properties
        .map((property, propertyIndex) => normalizeProperty(property, propertyIndex))
        .filter((property): property is ProfilePropertyRule => Boolean(property)),
    }
  }

  function normalizeProperty(property: DraftPropertyRule, index: number): ProfilePropertyRule | undefined {
    const id = safeIdSegment(toText(property.id) || toText(property.label) || `property-${index + 1}`)
    const label = trimmed(property.label)
    // Validate the value name exactly as typed (D2): auto-derive from the id/label
    // ONLY when the field is empty, and never strip characters from a typed name —
    // an invalid name surfaces as a blocking rulesErrors entry instead of being
    // silently rewritten ("assay type" -> "assaytype").
    const valueName = trimmed(property.valueName) || propertyName(id)
    if (!id || !label || !valueName) return undefined
    // An explicit URI (curated or external) passes through; an empty one is a
    // custom term whose URI is minted from the live slug so it tracks slug edits.
    const explicitUri = trimmed(property.propertyUri)
    const propertyUri = explicitUri || mintTermUri(trimmed(slug.value) || 'profile', valueName)
    const isEntity = property.kind === 'entity'
    const isMulti = property.multipleValues || property.kind === 'keyword-list'
    // Required contents (WS5/M2): only for MULTI-VALUED entity references — a single
    // reference has no list to constrain, and emitting them for a non-multiple rule
    // would strand rows that the editor no longer shows. Empty-value rows are dropped
    // (an empty match can never be satisfied).
    const requiredInstances = isEntity && isMulti
      ? property.requiredInstances
          .map(normalizeRequiredInstance)
          .filter((instance): instance is ProfileRequiredInstance => Boolean(instance))
      : []
    // Reference mode (WS4) only carries for inline-shaped entity references. When
    // the list is content-shaped instead (requiredInstances, or hasPart which the
    // dataset dialog binds to its data-references section), schema.json encodes the
    // `contains`, so a referenceMode would not survive the round-trip — drop it.
    const referenceMode =
      isEntity && !requiredInstances.length && !isHasPartUri(propertyUri) ? property.referenceMode : undefined
    return {
      id,
      label,
      description: trimmed(property.description),
      kind: property.kind,
      propertyUri,
      valueName,
      // L2: floor the re-locked root baseline rules' obligation (name/description →
      // MUST, license/datePublished → SHOULD); every other rule passes through.
      obligation: clampBaselineObligation(property),
      defaultValue: trimmed(property.defaultValue) || undefined,
      example: trimmed(property.example) || undefined,
      enumOptions: property.kind === 'enum' ? splitOptions(property.enumOptions) : undefined,
      pattern: trimmed(property.pattern) || undefined,
      minLength: parseNumber(property.minLength),
      maxLength: parseNumber(property.maxLength),
      minValue: parseNumber(property.minValue),
      maxValue: parseNumber(property.maxValue),
      stepValue: parseNumber(property.stepValue),
      multipleValues: isMulti,
      // List cardinality is meaningful only on multi-valued rules.
      minItems: isMulti ? parseNumber(property.minItems) : undefined,
      maxItems: isMulti ? parseNumber(property.maxItems) : undefined,
      referenceMode,
      requiredInstances: requiredInstances.length ? requiredInstances : undefined,
      // Target types are meaningful only for entity references.
      entityTypes: isEntity ? property.entityTypes.filter(Boolean) : undefined,
      // Authored select-url URLs re-emit as string options; a preserved (non-string)
      // select-url and select-object keep their raw imported options verbatim (L1).
      valueOptions:
        property.kind === 'select-url'
          ? hasPreservedUrlOptions(property.valueOptions)
            ? property.valueOptions
            : property.urlOptions.map((option) => trimmed(option)).filter(Boolean)
          : property.kind === 'select-object'
            ? property.valueOptions
            : undefined,
    }
  }

  // One draft "required contents" row → a strict ProfileRequiredInstance, or
  // undefined when it has no value to match on. `id` and `name` are exclusive per
  // row (the author picks which); `hint` travels when set.
  function normalizeRequiredInstance(row: DraftRequiredInstance): ProfileRequiredInstance | undefined {
    const value = trimmed(row.value)
    if (!value) return undefined
    const instance: ProfileRequiredInstance = row.match === 'id' ? { id: value } : { name: value }
    const hint = trimmed(row.hint)
    if (hint) instance.hint = hint
    return instance
  }

  const groupOptions = computed(() => groups.value.map((group) => ({ value: group.id, label: group.name })))
  const normalizedEntities = computed(() =>
    entities.value.map(normalizeEntity).filter((entity): entity is ProfileEntityRule => Boolean(entity)),
  )
  const datasetEntity = computed(() => normalizedEntities.value.find((entity) => isDatasetType(entity.type)))
  const generatedSchema = computed(() => schemaFromEntityRules(profileBasics(), normalizedEntities.value))
  const generatedSchemaText = computed(() => JSON.stringify(generatedSchema.value, null, 2))
  const generatedCrate = computed(() =>
    buildProfileCrate({ ...profileBasics(), entityRules: normalizedEntities.value, importedMode: importedMode.value ?? undefined }),
  )
  const generatedCrateText = computed(() => JSON.stringify(generatedCrate.value, null, 2))

  // Read-only derived obligation for an entity type: MUST/SHOULD/MAY plus the
  // referencing property that explains the derivation (for the editor badge).
  function entityObligation(entityType: string) {
    return deriveEntityObligation(normalizeTypeUri(entityType), normalizedEntities.value)
  }

  // Every entity-reference property that points at this type (L8) — the single
  // shared traversal behind the editor's "Referenced by" panel and the master
  // list's unreferenced-rule warning. An empty result means the rule is inert.
  function entityReferences(entityType: string) {
    return referencesToType(normalizeTypeUri(entityType), normalizedEntities.value)
  }

  // Non-blocking authoring hints. Two kinds:
  //  - a custom (non-schema.org) term whose compact name only *resembles* a
  //    curated schema.org property (different case) — suggest the schema.org term;
  //    an exact-name shadow is a blocking error instead (see rulesErrors).
  //  - an entity-reference target type with no entity rule in this profile, so no
  //    sub-form gets generated for it.
  const rulesHints = computed(() => {
    const hints: string[] = []
    const curatedNames = new Set(CURATED_PROPERTY_TERMS.map((term) => term.name))
    const curatedByLower = new Map(CURATED_PROPERTY_TERMS.map((term) => [term.name.toLowerCase(), term.name]))
    for (const entity of normalizedEntities.value) {
      for (const rule of entity.propertyRules) {
        if (!isSchemaOrgUri(rule.propertyUri) && !curatedNames.has(rule.valueName)) {
          const canonical = curatedByLower.get(rule.valueName.toLowerCase())
          if (canonical) hints.push(`${entity.label} / ${rule.label}: "${rule.valueName}" resembles the schema.org "${canonical}" term, consider using it.`)
        }
        if (rule.kind === 'entity') {
          for (const target of rule.entityTypes ?? []) {
            if (!normalizedEntities.value.some((candidate) => sameSchemaOrgType(candidate.type, target))) {
              hints.push(`${entity.label} / ${rule.label} references ${entityTypeLabel(target)}, but no entity rule defines it, no sub-form will be generated for ${entityTypeLabel(target)}.`)
            }
          }
        }
      }
    }
    // H1: an entity rule that nothing references is inert — it generates no dataset
    // inputs and no validation. Surface each unreferenced non-Dataset rule loudly so
    // the "entity rule ignored" trap is unmissable at review.
    for (const entity of normalizedEntities.value) {
      if (isDatasetType(entity.type)) continue
      if (!referencesToType(entity.type, normalizedEntities.value).length) {
        hints.push(`"${entity.label}" is not referenced by any property, it will generate no dataset inputs or validation. Open it and use "Add reference", or add an entity-reference property that targets it.`)
      }
    }
    // L10: two entity rules sharing one type URI serialize entity references with
    // the LAST rule's class token (buildModeContext / classNameByType are last-wins).
    const seenTypes = new Map<string, ProfileEntityRule>()
    const reportedTypeCollisions = new Set<string>()
    for (const entity of normalizedEntities.value) {
      const prior = [...seenTypes.entries()].find(([type]) => sameSchemaOrgType(type, entity.type))
      if (prior && !reportedTypeCollisions.has(entity.type)) {
        reportedTypeCollisions.add(entity.type)
        hints.push(`Two entity rules use the type ${entityTypeLabel(entity.type)}, entity references to ${entityTypeLabel(entity.type)} will use class "${entity.className}".`)
      }
      seenTypes.set(entity.type, entity)
    }
    return hints
  })

  // Same condition basicsErrors uses for the bearer-token requirement, exposed
  // as a boolean so the UI can gate the token banner without string matching.
  const needsToken = computed(() => !currentUser.value)

  // Step-scoped validation so each step can gate its own "Next" button.
  // Basics errors carry a fieldId anchor so ProfileBasicsStep renders each one
  // inline at its input ('token' anchors to the bearer-token banner); the step
  // callout only shows entries with no anchor.
  const basicsFieldErrors = computed<BasicsFieldError[]>(() => {
    const errors: BasicsFieldError[] = []
    if (needsToken.value) errors.push({ fieldId: 'token', message: 'Add a bearer token in Settings before creating profiles.' })
    if (!groupId.value) errors.push({ fieldId: 'group', message: 'Choose a group.' })
    const slugValue = trimmed(slug.value)
    if (!slugValue) errors.push({ fieldId: 'slug', message: 'Slug is required.' })
    else if (!/^[a-z0-9_-]+$/.test(slugValue)) errors.push({ fieldId: 'slug', message: 'Slug must use lowercase letters, digits, dashes, or underscores.' })
    if (!trimmed(name.value)) errors.push({ fieldId: 'name', message: 'Name is required.' })
    if (!trimmed(description.value)) errors.push({ fieldId: 'description', message: 'Description is required.' })
    if (!trimmed(version.value)) errors.push({ fieldId: 'version', message: 'Version is required.' })
    else if (!/^\d+\.\d+\.\d+([-.+][0-9A-Za-z.-]+)?$/.test(trimmed(version.value))) errors.push({ fieldId: 'version', message: 'Version should look like semver, for example 0.1.0.' })
    const dateValue = toText(datePublished.value).trim()
    if (!dateValue) errors.push({ fieldId: 'datePublished', message: 'Date published is required.' })
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) errors.push({ fieldId: 'datePublished', message: 'Date published must be a valid date, for example 2024-01-31.' })
    if (!trimmed(license.value)) errors.push({ fieldId: 'license', message: 'License URL is required.' })
    return errors
  })

  const basicsErrors = computed(() => basicsFieldErrors.value.map((error) => error.message))

  const rulesErrors = computed(() => {
    const errors: string[] = []
    if (!normalizedEntities.value.length) errors.push('Add at least one entity rule.')
    if (!datasetEntity.value) errors.push('Add a Dataset entity rule so dataset metadata inputs can be generated.')

    // Class short names across the normalized rules, for the property-vs-class
    // collision guard below (case-insensitive, defense in depth per D2).
    const classNamesLower = new Set(normalizedEntities.value.map((entity) => entity.className.toLowerCase()))

    // Validate the RAW drafts (D2): label-less drafts are dropped and typed value
    // names are no longer stripped by normalization, so an added-but-blank or
    // malformed entry must be caught here on exactly what the author typed.
    entities.value.forEach((entity, entityIndex) => {
      const entityName = trimmed(entity.label) || `Entity rule ${entityIndex + 1}`
      if (!trimmed(entity.label)) errors.push(`Entity rule ${entityIndex + 1} needs a label.`)
      // Custom (non-schema.org) types carry an editable class name; it must be
      // upper camel case so it never collides with a lower-camel property term.
      const entityType = normalizeTypeUri(entity.type)
      if (entityType && !isSchemaOrgUri(entityType)) {
        const className = trimmed(entity.className) || termNameFromUri(entityType)
        if (!isValidClassName(className)) {
          errors.push(`${entityName}: class name "${className}" must start with a capital letter, then letters or digits only, e.g. Specimen.`)
        }
      }
      entity.properties.forEach((property, propertyIndex) => {
        const propLabel = trimmed(property.label) || `property ${propertyIndex + 1}`
        if (!trimmed(property.label)) errors.push(`${entityName} / property ${propertyIndex + 1} needs a label.`)
        // A typed value name is validated as-is; an empty one is auto-derived from
        // the label (always valid), so only validate when the author typed one.
        const typedValueName = trimmed(property.valueName)
        if (typedValueName && !isValidPropertyTermName(typedValueName)) {
          errors.push(`${entityName} / ${propLabel}: property name "${typedValueName}" must have a lowercase first letter and use only letters and digits, e.g. assayType.`)
        }
        // M6: when nothing is typed and the label auto-derives to nothing usable
        // (all non-ASCII, or digits-only), normalization would silently fall back to
        // the generic `field` name (or drop the rule). Block it instead of exporting
        // a meaningless term.
        if (!typedValueName && trimmed(property.label) && !propertyName(trimmed(property.label))) {
          errors.push(`${entityName} / ${propLabel}: add a property name (letters and digits, starting lowercase).`)
        }
        // Property terms and class names must stay distinct (case-insensitively)
        // so the merged @context can never shadow a type with a property.
        if (typedValueName && classNamesLower.has(typedValueName.toLowerCase())) {
          errors.push(`${entityName} / ${propLabel}: property name "${typedValueName}" collides with an entity class name, rename it so property and class names stay distinct.`)
        }
        // WS5/M2: only validate the required-contents rows that would actually be
        // emitted — entity references that are multi-valued. Otherwise a row hidden by
        // a multiple-off toggle could still gate Next with an invisible error.
        if (property.kind === 'entity' && property.multipleValues) {
          property.requiredInstances.forEach((row, rowIndex) => {
            if (!trimmed(row.value)) {
              errors.push(`${entityName} / ${propLabel}: required item ${rowIndex + 1} needs a value to match.`)
            }
          })
        }
      })
    })

    const curatedNames = new Set(CURATED_PROPERTY_TERMS.map((term) => term.name))
    const entityIds = new Set<string>()
    // Two entity rules that serialize to the same class name collide (last-wins)
    // in mode.classes and $defs; block it on the canonical className (D3).
    const classNames = new Set<string>()
    const reportedClassNames = new Set<string>()
    // A compact term can bind to only one URI in the crate @context: track which
    // propertyUri each valueName maps to across ALL entity rules.
    const uriByValueName = new Map<string, string>()
    const reportedUriConflicts = new Set<string>()

    for (const entity of normalizedEntities.value) {
      // Duplicate derived entity ids collide on the crate `@id` and lose rules on reparse.
      if (entityIds.has(entity.id)) errors.push(`Duplicate entity id "${entity.id}", rename one entity.`)
      entityIds.add(entity.id)
      if (classNames.has(entity.className) && !reportedClassNames.has(entity.className)) {
        errors.push(`Two entity rules use the same class name "${entity.className}", give them distinct class names or types.`)
        reportedClassNames.add(entity.className)
      }
      classNames.add(entity.className)
      // H5: a class name that (case-insensitively) matches a curated entity type
      // while its type URI differs would redefine that standard type's alias in the
      // crate @context — block it.
      const curatedShadow = CURATED_ENTITY_TYPES.find(
        (curated) => curated.label.toLowerCase() === entity.className.toLowerCase(),
      )
      if (curatedShadow && !sameSchemaOrgType(curatedShadow.uri, entity.type)) {
        errors.push(`Class name "${entity.className}" would redefine the standard ${curatedShadow.label} type, rename the class or use the schema.org type.`)
      }
      if (!entity.propertyRules.length) errors.push(`${entity.label} needs at least one property rule.`)

      const properties = new Set<string>()
      const propertyIds = new Set<string>()
      const propertyUris = new Set<string>()
      for (const property of entity.propertyRules) {
        if (properties.has(property.valueName)) errors.push(`${entity.label} has a duplicate property: ${property.valueName}.`)
        properties.add(property.valueName)
        // Two labels that slugify identically derive the same crate `@id`; block
        // it so a rule is not silently overwritten and lost on reparse.
        if (propertyIds.has(property.id)) errors.push(`${entity.label} has two properties that derive the same id "${property.id}", rename one.`)
        propertyIds.add(property.id)
        // Every term must resolve via @context: an absolute URI (minted or external).
        if (!isAbsoluteUri(property.propertyUri)) {
          errors.push(`${entity.label} / ${property.label} needs a valid absolute property URI.`)
        }
        if (propertyUris.has(property.propertyUri)) errors.push(`${entity.label} has two properties using the same term URI (${property.propertyUri}).`)
        propertyUris.add(property.propertyUri)
        // Cross-entity: one compact term mapped to two different URIs cannot both
        // resolve in @context.
        const priorUri = uriByValueName.get(property.valueName)
        if (priorUri === undefined) {
          uriByValueName.set(property.valueName, property.propertyUri)
        } else if (priorUri !== property.propertyUri && !reportedUriConflicts.has(property.valueName)) {
          errors.push(`Property name "${property.valueName}" maps to two different term URIs (${priorUri} and ${property.propertyUri}), a compact term can bind to only one URI in @context.`)
          reportedUriConflicts.add(property.valueName)
        }
        // A non-schema.org term whose compact name exactly matches a curated
        // schema.org property shadows that base-context term — a hard error.
        if (!isSchemaOrgUri(property.propertyUri) && curatedNames.has(property.valueName)) {
          errors.push(`${entity.label} / ${property.label}: "${property.valueName}" maps to a non-schema.org URI but shadows the schema.org "${property.valueName}" term in the base @context, use the schema.org term or rename the property.`)
        }
        if (property.kind === 'entity' && !property.entityTypes?.length) {
          errors.push(`${entity.label} / ${property.label} is an entity reference and needs at least one target type.`)
        }
        // M5: hasPart values are always crate entity references (attached files /
        // datasets); a scalar kind would emit a bare literal the dataset dialog's
        // data-references section cannot represent, bricking it. Block it.
        if (isHasPartUri(property.propertyUri) && property.kind !== 'entity') {
          errors.push(`${entity.label} / ${property.label}: hasPart must be an entity reference.`)
        }
        // select-url is authorable: it needs at least one allowed URL and every
        // option must be an absolute URL, or it can never be picked/validate (WS3).
        // A preserved (non-string) imported option set is read-only and skips the
        // absolute-URL gate (L1). select-object stays import-only; an empty one is a
        // dead-end.
        if (property.kind === 'select-url') {
          if (!property.valueOptions?.length) {
            errors.push(`${entity.label} / ${property.label}: add at least one allowed URL.`)
          } else if (!hasPreservedUrlOptions(property.valueOptions) && property.valueOptions.some((option) => typeof option !== 'string' || !isAbsoluteUri(option))) {
            errors.push(`${entity.label} / ${property.label}: every allowed value must be an absolute URL, e.g. https://….`)
          }
        } else if (property.kind === 'select-object' && !property.valueOptions?.length) {
          errors.push(`${entity.label} / ${property.label}: preserved choice property has no options, remove it or re-import.`)
        }
        if (property.kind === 'enum' && !property.enumOptions?.length) errors.push(`${entity.label} / ${property.label} needs at least one allowed value.`)
        // WS2: list cardinality — min >= 1, max >= min. minItems/maxItems are only
        // set on multi-valued rules (normalizeProperty guards that).
        if (property.minItems !== undefined && property.minItems < 1) {
          errors.push(`${entity.label} / ${property.label}: minimum entries must be at least 1.`)
        }
        if (property.maxItems !== undefined && property.maxItems < 1) {
          errors.push(`${entity.label} / ${property.label}: maximum entries must be at least 1.`)
        }
        if (property.minItems !== undefined && property.maxItems !== undefined && property.maxItems < property.minItems) {
          errors.push(`${entity.label} / ${property.label}: maximum entries cannot be less than minimum entries.`)
        }
        if (property.stepValue !== undefined && property.stepValue <= 0) {
          errors.push(`${entity.label} / ${property.label}: step must be greater than 0.`)
        }
        if (property.pattern) {
          try {
            new RegExp(property.pattern)
          } catch {
            errors.push(`${entity.label} / ${property.label} has an invalid pattern.`)
          }
        }
      }
    }
    return errors
  })

  const allErrors = computed(() => [...basicsErrors.value, ...rulesErrors.value])

  return reactive({
    // basics state
    groupId,
    name,
    slug,
    description,
    version,
    datePublished,
    license,
    isPublic,
    // rules state
    entities,
    selectedEntityIndex,
    selectedEntity,
    submitError,
    importedMode,
    importSummary,
    hasEdits,
    highlightPropertyUid,
    // options
    groupOptions,
    // derived artifacts
    normalizedEntities,
    datasetEntity,
    generatedSchema,
    generatedSchemaText,
    generatedCrate,
    generatedCrateText,
    entityObligation,
    entityReferences,
    // validation
    needsToken,
    basicsFieldErrors,
    basicsErrors,
    rulesErrors,
    rulesHints,
    allErrors,
    // methods
    reset,
    applyImport,
    setSlug,
    selectEntity,
    addEntity,
    addEntityRuleForType,
    addReferenceProperty,
    addEntityTemplate,
    removeEntity,
    addProperty,
    addPropertyTemplate,
    removeProperty,
    profileBasics,
  })
}

export type ProfileBuilder = ReturnType<typeof useProfileBuilder>
