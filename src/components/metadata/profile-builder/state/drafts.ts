import type { ModeFile } from '@/lib/profiles/mode'
import { OBLIGATION_ORDER, PROFILE_OBLIGATION_LABELS, PROFILE_VALUE_KIND_LABELS } from '@/lib/profiles/labels'
import { sameSchemaOrgType, SCHEMA_ORG } from '@/lib/profiles/uri'
import type {
  ProfileBasics,
  ProfileEntityRule,
  ProfileEntitySource,
  ProfileObligation,
  ProfileValueKind,
} from '@/lib/profiles/types'
// Type-only: lift.ts carries the RDF stack and is never imported for value here.
import type { LiftNote } from '@/lib/shacl/lift'

// Two levels of builder-session lock on a baseline draft rule. `full` is the old
// all-or-nothing read-only (the Root dataset entity itself). `structural` fixes a
// rule's identity: it cannot be removed and its propertyUri/valueName/label stay
// put, while leaving the specific affordances the RO-Crate baseline allows open
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

export const DEFAULT_LICENSE = 'https://creativecommons.org/licenses/by/4.0/'

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
  // Entity-kind fulfilment policy: which sources may satisfy the property
  // (describe new / reuse external URI / reuse crate entity). Absent = ['new']
  // (the legacy inline default; stays byte-stable). Meaningless on scalar
  // kinds; normalize drops it.
  entitySources?: ProfileEntitySource[]
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
  // Never serialized; normalizeProperty drops it (there is no profile-edit flow).
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
  // Builder-session only: the fixed Root dataset entity (`full`). Never serialized.
  lock?: DraftLock
  // Builder-session only: the rule arrived with an import rather than being added
  // here. An imported shape that nothing references is the source file's own
  // structure, not the "you forgot to link it" mistake the hint warns about.
  imported?: boolean
}

// Shape ImportProfileSection hands to applyImport: basics + strict lib entity
// rules + the raw mode file (kept for verbatim re-export), plus import-event
// metadata for the persistent summary chip.
export interface ProfileImportResult {
  basics?: Partial<ProfileBasics>
  entityRules: ProfileEntityRule[]
  mode?: ModeFile | null
  kind?: 'mode' | 'crate' | 'shacl'
  preservedKeys?: string[]
  // Imported expert SHACL source preserved inside the unified shapes.ttl.
  customShapesText?: string
  customShapesName?: string
  // What a SHACL import could not turn into an editable rule (see lift.ts).
  // Kept on the builder so the Rules and Review steps can say which parts of
  // the file generate no input.
  liftNotes?: LiftNote[]
}

// What was imported, lifted into the builder so the confirmation survives step
// and tab navigation (the import section unmounts when hidden).
export interface ImportSummary {
  kind: 'mode' | 'crate' | 'shacl'
  name?: string
  entityCount: number
  propertyCount: number
  preservedKeys: string[]
}

// Display metadata for the imported source section in shapes.ttl.
export interface CustomShapesMeta {
  fileName: string
  shapeCount?: number
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
// is lowercased; a derived name always passes validation.
export function propertyName(value: string): string {
  const words = value.split(/[^a-zA-Z0-9]+/).filter(Boolean)
  const camel = words
    .map((word, index) => (index ? word.charAt(0).toUpperCase() + word.slice(1) : word.toLowerCase()))
    .join('')
    .replace(/^[^a-zA-Z]+/, '')
  return camel ? camel.charAt(0).toLowerCase() + camel.slice(1) : ''
}

export function splitOptions(value: unknown): string[] {
  return toText(value)
    .split(',')
    .map((option) => option.trim())
    .filter(Boolean)
}

export function parseNumber(value: unknown): number | undefined {
  const text = trimmed(value)
  if (!text) return undefined
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

// L1: a select-url whose imported options include ANY non-string value is preserved
// verbatim and read-only (mirroring select-object); we never coerce structured
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
export function isBaselineRootTerm(propertyUri: string): boolean {
  return BASELINE_ROOT_TERMS.some((term) => sameSchemaOrgType(propertyUri, term))
}

// UI mirror of clampBaselineObligation, shared by every obligation editor (the
// row Select today) so the control never offers a choice the emitted profile
// would silently override: name/description are fixed MUST, license and
// datePublished float between MUST and SHOULD, unlocked rules keep all three.
export function obligationEditDisabled(property: DraftPropertyRule): boolean {
  if (property.lock === 'full') return true
  if (property.lock !== 'structural') return false
  const uri = trimmed(property.propertyUri)
  return !(sameSchemaOrgType(uri, `${SCHEMA_ORG}license`) || sameSchemaOrgType(uri, `${SCHEMA_ORG}datePublished`))
}

export function obligationOptionsFor(property: DraftPropertyRule): typeof OBLIGATION_OPTIONS {
  return property.lock === 'structural'
    ? OBLIGATION_OPTIONS.filter((option) => option.value !== 'MAY')
    : OBLIGATION_OPTIONS
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
    entitySources: input.entitySources,
    requiredInstances: input.requiredInstances ?? [],
    urlOptions: input.urlOptions ?? [],
    valueOptions: input.valueOptions,
    lock: input.lock,
  }
}

// Seeded starting point: only the fixed RO-Crate Root Data Entity and its four
// baseline property rules. The entity is fully locked; the four property rules are
// `structural` (not removable, identity fixed) because the RO-Crate specification
// mandates them: "The Root Data Entity MUST have all of the properties listed
// below", a presence requirement, so they default to obligation MUST. RO-Crate
// 1.2 treats datePublished/license as SHOULD, so their obligation is author-
// selectable (MUST↔SHOULD, portal default MUST); name/description stay MUST.
// License kind is switchable url↔select-url. Authors extend from here with their
// own rules and the opt-in templates below.
export function defaultEntities(): DraftEntityRule[] {
  return [
    draftEntity({
      id: 'dataset',
      label: 'Root dataset',
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
        description: 'Optional contextual Person entities referenced from dataset author/creator/contributor properties.',
        properties: [
          draftProperty({ id: 'name', label: 'Name', valueName: 'name', propertyUri: 'http://schema.org/name', obligation: 'MUST', description: 'Contributor display name.', example: 'Ada Lovelace' }),
          draftProperty({ id: 'identifier', label: 'Identifier', valueName: 'identifier', propertyUri: 'http://schema.org/identifier', kind: 'url', obligation: 'SHOULD', description: 'Persistent contributor identifier such as ORCID.' }),
        ],
      }),
  },
]

// Smallest suffix (>= 2) that makes `baseId` collision-free against `taken`, or 0
// when no suffix is needed. Used to uniquify repeated template inserts.
export function uniquifyDraftId(taken: Set<string>, baseId: string): number {
  if (!taken.has(baseId)) return 0
  let n = 2
  while (taken.has(`${baseId}-${n}`)) n++
  return n
}
