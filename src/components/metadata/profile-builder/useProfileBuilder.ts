import { computed, reactive, ref, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { buildProfileCrate, safeIdSegment } from '@/lib/profiles/rocrate'
import { schemaFromEntityRules } from '@/lib/profiles/schema'
import { PROFILE_OBLIGATION_LABELS, PROFILE_VALUE_KIND_LABELS } from '@/lib/profiles/labels'
import type {
  ProfileBasics,
  ProfileEntityRule,
  ProfileObligation,
  ProfilePropertyRule,
  ProfileValueKind,
} from '@/lib/profiles/types'

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
  kind: ProfileValueKind
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
}

export interface DraftEntityRule {
  // Stable, non-editable identity used only to key the editor in the UI so a
  // captured/stale prop can never point at a different entity. Not serialized.
  uid: number
  id: string
  label: string
  description: string
  type: string
  obligation: ProfileObligation
  exampleId: string
  properties: DraftPropertyRule[]
}

// ---------------------------------------------------------------------------
// Shared, instance-free option lists and helpers (imported by step components
// so they render the same choices the builder validates against).
// ---------------------------------------------------------------------------

export const OBLIGATION_ORDER: ProfileObligation[] = ['MUST', 'SHOULD', 'MAY']

export const OBLIGATION_OPTIONS = OBLIGATION_ORDER.map((value) => ({
  value,
  label: `${value} · ${PROFILE_OBLIGATION_LABELS[value].label}`,
}))

export const VALUE_KIND_OPTIONS = (
  Object.entries(PROFILE_VALUE_KIND_LABELS) as [ProfileValueKind, string][]
).map(([value, label]) => ({ value, label }))

export function obligationBadgeVariant(obligation: ProfileObligation): 'royal' | 'warn' | 'secondary' {
  if (obligation === 'MUST') return 'royal'
  if (obligation === 'SHOULD') return 'warn'
  return 'secondary'
}

// Short, human-facing type label, e.g. "http://schema.org/Dataset" -> "Dataset".
export function shortTypeName(type: string): string {
  const text = toText(type).trim()
  if (!text) return 'Thing'
  const segment = text.split('/').filter(Boolean).pop() ?? text
  return segment || 'Thing'
}

// Plain names map to schema.org; full URIs pass through unchanged.
export function normalizeTypeInput(value: unknown): string {
  const text = trimmed(value)
  if (!text) return ''
  if (text.startsWith('http://') || text.startsWith('https://')) return text
  return `http://schema.org/${text}`
}

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

// Turn a label / id into a camelCase RO-Crate property name.
export function propertyName(value: string): string {
  const words = value.split(/[^a-zA-Z0-9]+/).filter(Boolean)
  return words
    .map((word, index) => (index ? word.charAt(0).toUpperCase() + word.slice(1) : word.toLowerCase()))
    .join('')
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

function isDatasetType(type: string): boolean {
  return type === 'Dataset' || type.endsWith('/Dataset')
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
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
    obligation: input.obligation ?? 'MAY',
    exampleId: input.exampleId ?? '',
    properties: input.properties ?? [],
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
    kind: input.kind ?? 'text',
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
  }
}

// Seeded starting point: a Dataset entity every profile MUST have, plus an
// optional contributor Person. Mirrors the previous single-form defaults.
function defaultEntities(): DraftEntityRule[] {
  return [
    draftEntity({
      id: 'dataset',
      label: 'Root Dataset',
      type: 'http://schema.org/Dataset',
      obligation: 'MUST',
      exampleId: './',
      description: 'The root RO-Crate dataset entity described by ro-crate-metadata.json about.',
      properties: [
        draftProperty({ id: 'name', label: 'Name', valueName: 'name', obligation: 'MUST', description: 'Human readable dataset title.', example: 'Proteomics run 42' }),
        draftProperty({ id: 'description', label: 'Description', valueName: 'description', kind: 'longtext', obligation: 'SHOULD', description: 'Plain-language summary of the dataset.' }),
        draftProperty({ id: 'date-published', label: 'Date published', valueName: 'datePublished', kind: 'date', obligation: 'SHOULD', description: 'Publication date in ISO date format.' }),
        draftProperty({ id: 'license', label: 'License', valueName: 'license', kind: 'license', obligation: 'SHOULD', description: 'License URL.', example: 'https://creativecommons.org/licenses/by/4.0/' }),
        draftProperty({ id: 'organism', label: 'Organism', valueName: 'organism', obligation: 'MUST', description: 'Scientific organism name.', pattern: '^[A-Z][a-z]+ [a-z]+$', example: 'Homo sapiens' }),
        draftProperty({ id: 'assay-type', label: 'Assay Type', valueName: 'assayType', kind: 'enum', obligation: 'SHOULD', description: 'Primary assay modality.', enumOptions: 'LC-MS, MALDI-TOF' }),
      ],
    }),
    draftEntity({
      id: 'person',
      label: 'Contributor Person',
      type: 'http://schema.org/Person',
      obligation: 'MAY',
      exampleId: '#person-ada-lovelace',
      description: 'Optional contextual Person entities referenced from Dataset author/creator/contributor properties.',
      properties: [
        draftProperty({ id: 'name', label: 'Name', valueName: 'name', obligation: 'MUST', description: 'Contributor display name.', example: 'Ada Lovelace' }),
        draftProperty({ id: 'identifier', label: 'Identifier', valueName: 'identifier', kind: 'url', obligation: 'SHOULD', description: 'Persistent contributor identifier such as ORCID.' }),
      ],
    }),
  ]
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
    entities.value = defaultEntities()
    selectedEntityIndex.value = 0
  }

  function setSlug(value: string | number) {
    slug.value = toText(value)
    slugTouched.value = true
  }

  const selectedEntity = computed<DraftEntityRule | undefined>(() => entities.value[selectedEntityIndex.value])

  function selectEntity(index: number) {
    selectedEntityIndex.value = index
  }

  function addEntity() {
    entities.value.push(draftEntity())
    selectedEntityIndex.value = entities.value.length - 1
  }

  function removeEntity(index: number) {
    entities.value.splice(index, 1)
    if (selectedEntityIndex.value >= entities.value.length) {
      selectedEntityIndex.value = Math.max(0, entities.value.length - 1)
    }
  }

  function addProperty(entity: DraftEntityRule) {
    entity.properties.push(draftProperty())
  }

  function removeProperty(entity: DraftEntityRule, index: number) {
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
    const type = normalizeTypeInput(entity.type)
    if (!id || !label || !type) return undefined
    return {
      id,
      label,
      description: trimmed(entity.description),
      type,
      obligation: entity.obligation,
      exampleId: trimmed(entity.exampleId) || undefined,
      position: index + 1,
      propertyRules: entity.properties
        .map((property, propertyIndex) => normalizeProperty(property, id, propertyIndex))
        .filter((property): property is ProfilePropertyRule => Boolean(property)),
    }
  }

  function normalizeProperty(
    property: DraftPropertyRule,
    entityId: string,
    index: number,
  ): ProfilePropertyRule | undefined {
    const id = safeIdSegment(toText(property.id) || toText(property.label) || `property-${index + 1}`)
    const label = trimmed(property.label)
    const valueName = (trimmed(property.valueName) || propertyName(id)).replace(/[^A-Za-z0-9_.:-]/g, '')
    if (!id || !label || !valueName) return undefined
    return {
      id,
      label,
      description: trimmed(property.description),
      kind: property.kind,
      valueName,
      obligation: property.obligation,
      entityId,
      defaultValue: trimmed(property.defaultValue) || undefined,
      example: trimmed(property.example) || undefined,
      enumOptions: property.kind === 'enum' ? splitOptions(property.enumOptions) : undefined,
      pattern: trimmed(property.pattern) || undefined,
      minLength: parseNumber(property.minLength),
      maxLength: parseNumber(property.maxLength),
      minValue: parseNumber(property.minValue),
      maxValue: parseNumber(property.maxValue),
      stepValue: parseNumber(property.stepValue),
      multipleValues: property.multipleValues || property.kind === 'keyword-list' || property.kind === 'person-list',
      position: index + 1,
    }
  }

  const groupOptions = computed(() => groups.value.map((group) => ({ value: group.id, label: group.name })))
  const normalizedEntities = computed(() =>
    entities.value.map(normalizeEntity).filter((entity): entity is ProfileEntityRule => Boolean(entity)),
  )
  const datasetEntity = computed(() => normalizedEntities.value.find((entity) => isDatasetType(entity.type)))
  const generatedSchema = computed(() => schemaFromEntityRules(profileBasics(), normalizedEntities.value))
  const generatedSchemaText = computed(() => JSON.stringify(generatedSchema.value, null, 2))
  const generatedCrate = computed(() => buildProfileCrate({ ...profileBasics(), entityRules: normalizedEntities.value }))
  const generatedCrateText = computed(() => JSON.stringify(generatedCrate.value, null, 2))

  // Same condition basicsErrors uses for the bearer-token requirement, exposed
  // as a boolean so the UI can gate the token banner without string matching.
  const needsToken = computed(() => !currentUser.value)

  // Step-scoped validation so each step can gate its own "Next" button.
  const basicsErrors = computed(() => {
    const errors: string[] = []
    if (needsToken.value) errors.push('Add a bearer token in Settings before creating profiles.')
    if (!groupId.value) errors.push('Choose a group.')
    if (!/^[a-z0-9_-]+$/.test(trimmed(slug.value))) errors.push('Slug must use lowercase letters, digits, dashes, or underscores.')
    if (!trimmed(name.value)) errors.push('Name is required.')
    if (!trimmed(description.value)) errors.push('Description is required.')
    if (!trimmed(version.value)) errors.push('Version is required.')
    else if (!/^\d+\.\d+\.\d+([-.+][0-9A-Za-z.-]+)?$/.test(trimmed(version.value))) errors.push('Version should look like semver, for example 0.1.0.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(toText(datePublished.value).trim())) errors.push('Date published must be a valid date, for example 2024-01-31.')
    if (!trimmed(license.value)) errors.push('License URL is required.')
    return errors
  })

  const rulesErrors = computed(() => {
    const errors: string[] = []
    if (!normalizedEntities.value.length) errors.push('Add at least one entity rule.')
    if (!datasetEntity.value) errors.push('Add a Dataset entity rule so dataset metadata inputs can be generated.')

    // Validate the raw drafts too: label-less drafts are dropped by
    // normalizeEntity/normalizeProperty, so without this an added-but-blank
    // entity or property would silently vanish while Next stays enabled.
    entities.value.forEach((entity, entityIndex) => {
      if (!trimmed(entity.label)) errors.push(`Entity rule ${entityIndex + 1} needs a label.`)
      const entityName = trimmed(entity.label) || `Entity rule ${entityIndex + 1}`
      entity.properties.forEach((property, propertyIndex) => {
        if (!trimmed(property.label)) errors.push(`${entityName} / property ${propertyIndex + 1} needs a label.`)
      })
    })

    const entityIds = new Set<string>()
    for (const entity of normalizedEntities.value) {
      // Duplicate derived entity ids collide on the crate `@id` and lose rules on reparse.
      if (entityIds.has(entity.id)) errors.push(`Duplicate entity id "${entity.id}" — rename one entity.`)
      entityIds.add(entity.id)
      if (!entity.propertyRules.length) errors.push(`${entity.label} needs at least one property rule.`)

      const properties = new Set<string>()
      const propertyIds = new Set<string>()
      for (const property of entity.propertyRules) {
        if (properties.has(property.valueName)) errors.push(`${entity.label} has a duplicate property: ${property.valueName}.`)
        properties.add(property.valueName)
        // Two labels that slugify identically derive the same crate `@id`; block
        // it so a rule is not silently overwritten and lost on reparse.
        if (propertyIds.has(property.id)) errors.push(`${entity.label} has two properties that derive the same id "${property.id}" — rename one.`)
        propertyIds.add(property.id)
        if (property.kind === 'enum' && !property.enumOptions?.length) errors.push(`${entity.label} / ${property.label} needs at least one allowed value.`)
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
    // options
    groupOptions,
    // derived artifacts
    normalizedEntities,
    datasetEntity,
    generatedSchema,
    generatedSchemaText,
    generatedCrate,
    generatedCrateText,
    // validation
    needsToken,
    basicsErrors,
    rulesErrors,
    allErrors,
    // methods
    reset,
    setSlug,
    selectEntity,
    addEntity,
    removeEntity,
    addProperty,
    removeProperty,
    profileBasics,
  })
}

export type ProfileBuilder = ReturnType<typeof useProfileBuilder>
