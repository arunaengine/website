import type { ModeFile } from './mode'

export const DX_PROFILE = 'http://www.w3.org/ns/dx/prof/Profile'
export const DX_RESOURCE_DESCRIPTOR = 'http://www.w3.org/ns/dx/prof/ResourceDescriptor'
export const DX_HAS_RESOURCE = 'http://www.w3.org/ns/dx/prof/hasResource'
export const DX_HAS_ROLE = 'http://www.w3.org/ns/dx/prof/hasRole'
export const DX_HAS_ARTIFACT = 'http://www.w3.org/ns/dx/prof/hasArtifact'
export const DX_ROLE_SPECIFICATION = 'http://www.w3.org/ns/dx/prof/role/specification'
export const DX_ROLE_SCHEMA = 'http://www.w3.org/ns/dx/prof/role/schema'
export const DX_ROLE_GUIDANCE = 'http://www.w3.org/ns/dx/prof/role/guidance'
export const RO_CRATE_PROFILE = 'https://w3id.org/ro/crate/1.2'
export const RO_CRATE_CONTEXT = 'https://w3id.org/ro/crate/1.2/context'
export const JSON_SCHEMA_DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema'

export type ProfileObligation = 'MUST' | 'SHOULD' | 'MAY'

export type ProfileValueKind =
  | 'text'
  | 'longtext'
  | 'integer'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'url'
  | 'email'
  | 'keyword-list'
  | 'enum'
  | 'entity'
  // Describo/Crate-O `SelectURL` / `SelectObject` inputs, preserved verbatim.
  // `select-url` chooses from a fixed set of URL strings; `select-object` chooses
  // from a fixed set of raw JSON-LD objects (each becoming a flattened contextual
  // entity + `{"@id"}` reference). Their raw options live in `valueOptions`.
  | 'select-url'
  | 'select-object'

// How an `entity`-kind property's value is realised in the dataset crate.
// `inline` (the legacy default when absent) fills a sub-form that flattens into a
// contextual entity + `{"@id"}` reference; `external` emits ONLY a `{"@id"}`
// reference to an absolute URI (ORCID / ROR / DOI…), never an inline entity;
// `crate` emits a `{"@id"}` reference to another entity in the same crate (e.g.
// an attached File), its id passed through from the data-reference picker.
export type ProfileReferenceMode = 'inline' | 'external' | 'crate'

// A specific entity a list-valued `entity` rule MUST/SHOULD contain (e.g. a
// `hasPart` File named `index.html`). Matched by exact `name` OR exact `@id`; at
// least one of `name` / `id` is set. `id` is a crate-local path (`index.html`)
// or an absolute URI. When both are set schema.json encodes the `@id` match (id
// takes the `const` slot), so only `id` survives that round-trip.
export interface ProfileRequiredInstance {
  name?: string
  id?: string
  hint?: string
}

// A single property rule on an entity rule: "each <entity> <obligation> have
// <label> (<kind>)". `propertyUri` is the absolute URI of the property term
// (mode input `id`); `valueName` is the compact JSON key (mode input `name`).
// For `entity` kind, `entityTypes` lists the target entity type URIs the value
// references; the referenced entity's own rule supplies its sub-form.
export interface ProfilePropertyRule {
  id: string
  label: string
  description: string
  kind: ProfileValueKind
  propertyUri: string
  valueName: string
  obligation: ProfileObligation
  defaultValue?: string
  example?: string
  enumOptions?: string[]
  pattern?: string
  minLength?: number
  maxLength?: number
  minValue?: number
  maxValue?: number
  stepValue?: number
  multipleValues?: boolean
  entityTypes?: string[]
  // List cardinality for multi-valued properties (keyword-list or multipleValues).
  // Emitted on the array schema only when set; `minItems >= 1`, `maxItems >=
  // minItems`. Meaningless (ignored) on single-valued rules.
  minItems?: number
  maxItems?: number
  // `entity` kind only: how the reference is emitted (see ProfileReferenceMode).
  // Absent === 'inline' (the legacy default), which stays byte-stable.
  referenceMode?: ProfileReferenceMode
  // `entity` kind + multipleValues (e.g. `hasPart`): specific instances the list
  // MUST/SHOULD contain. Emitted as JSON Schema `contains` (single) / an `allOf`
  // of `contains` (several); validated by validateRequiredInstances.
  requiredInstances?: ProfileRequiredInstance[]
  // Raw mode `values` for `select-url` / `select-object` kinds, kept VERBATIM
  // (never `String()`-coerced). Internal only: `valueOptions` is NEVER serialized
  // into schema.json `properties`. For `select-url` the schema derives a string
  // `enum`; for `select-object` no scalar property is emitted at all.
  valueOptions?: unknown[]
}

// A rule about an RO-Crate entity type and the property rules that apply to
// entities of that type. Obligation is NOT stored: it is derived from which
// property rules reference the type (see deriveEntityObligation in mode.ts).
// Order is array order everywhere — there is no stored position.
export interface ProfileEntityRule {
  id: string
  label: string
  description: string
  type: string
  // Canonical class short name: the mode `classes` key / JSON-LD compact alias
  // for this entity type (e.g. `Specimen` even when the context maps it to an OBO
  // PURL). ALL exports key on it — mode.classes, schema `$defs`, the context
  // className→type mapping, the rawImport class-preservation lookup, and dataset
  // `@type` emission — so an imported alias survives a round-trip instead of being
  // re-derived from the type URI. `normalizeEntityRules` defaults an empty
  // className to `termNameFromUri(type)`; the builder default is the same and is
  // shown/editable for custom types.
  className: string
  propertyRules: ProfilePropertyRule[]
}

export interface ProfileBasics {
  slug: string
  name: string
  description: string
  version?: string
  datePublished: string
  license: string
}

export type JsonSchemaType = 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object'

export interface JsonSchemaProperty {
  type?: JsonSchemaType | JsonSchemaType[]
  title?: string
  description?: string
  format?: string
  enum?: string[]
  default?: unknown
  examples?: unknown[]
  pattern?: string
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  multipleOf?: number
  items?: JsonSchemaProperty
  minItems?: number
  maxItems?: number
  // `const` pins a value — used inside a `contains` object subschema to match a
  // required instance by `name` or `@id`. `contains` / `minContains` /
  // `maxContains` assert a list contains matching items; `allOf` composes several
  // such assertions. `properties` / `required` shape the `contains` object.
  const?: string
  contains?: JsonSchemaProperty
  minContains?: number
  maxContains?: number
  allOf?: JsonSchemaProperty[]
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
}

// `recommended` is an array of SHOULD-level property names, a sibling of
// `required` (the Bioschemas profile convention). Standard validators ignore
// it; the portal reads it to raise non-blocking warnings. The root schema
// describes the Dataset entity; non-Dataset entity rules serialize as `$defs`
// entries keyed by class short name. Entity-kind property rules appear in the
// presence arrays only — they are `{"@id"}` references, not scalar keys, so
// they get no `properties` entry (valid JSON Schema: `required` may list names
// that have no matching `properties` entry).
export interface JsonSchema {
  $schema?: string
  $id?: string
  title?: string
  description?: string
  type?: JsonSchemaType
  required?: string[]
  recommended?: string[]
  properties?: Record<string, JsonSchemaProperty>
  $defs?: Record<string, JsonSchema>
}

export type ProfileControlKind =
  | 'text'
  | 'textarea'
  | 'integer'
  | 'number'
  | 'checkbox'
  | 'date'
  | 'datetime-local'
  | 'url'
  | 'email'
  | 'select'
  | 'tags'
  | 'entity'
  // A pick-list over raw JSON-LD objects (`select-object` value kind). The chosen
  // option is emitted as a flattened contextual entity + `{"@id"}` reference, so
  // it is managed like an entity control, not a scalar. Wave C renders it; its
  // options travel on `ProfileControl.valueOptions`.
  | 'select-object'

export interface ProfileControl {
  property: string
  label: string
  description: string
  control: ProfileControlKind
  required: boolean
  obligation?: ProfileObligation
  enumOptions?: string[]
  schema: JsonSchemaProperty
  defaultValue?: unknown
  kind: ProfileValueKind
  multiple: boolean
  // Target entity type URIs for `kind === 'entity'` controls. The @type and label
  // of emitted instances derive from `entityTypes[0]` even when no matching entity
  // rule is present in the profile (so the reference still gets a real type).
  entityTypes?: string[]
  // Resolved target entity rule for `kind === 'entity'` controls (the sub-form),
  // when the profile actually defines a rule for one of the target types.
  entityRule?: ProfileEntityRule
  // Raw option objects/strings for `select-object` (and the raw options a
  // `select-url` derives its string `enumOptions` from). Carried verbatim so wave
  // C can render each option's `name` / `@id`.
  valueOptions?: unknown[]
  // Threaded from the property rule so wave B forms render without re-deriving:
  // `referenceMode` picks the entity input (sub-form / URI / crate picker);
  // `minItems`/`maxItems` drive list-count validation; `requiredInstances` lists
  // the entries a list MUST/SHOULD contain (see validateRequiredInstances).
  referenceMode?: ProfileReferenceMode
  minItems?: number
  maxItems?: number
  requiredInstances?: ProfileRequiredInstance[]
}

export interface ProfileViolation {
  ruleId: string
  pointer: string
  fieldId?: string
  message: string
  severity: 'error' | 'warning'
  hint?: string
}

export interface ParsedProfileCrate {
  name: string
  description: string
  version?: string
  datePublished?: string
  license?: string
  schema?: JsonSchema
  // Raw Describo/Crate-O mode file parsed from the mode.json artifact, kept for
  // verbatim round-trip of features the portal does not model.
  mode?: ModeFile
  // Term → URI mappings recovered from the crate @context / mode that the base
  // RO-Crate context does not already provide: non-schema.org terms plus alias
  // terms over schema.org URIs (e.g. `Author` → schema.org/Person).
  contextTerms?: Record<string, string>
  entityRules: ProfileEntityRule[]
  datasetPropertyRules: ProfilePropertyRule[]
}
