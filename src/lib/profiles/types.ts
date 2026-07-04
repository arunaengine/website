export const DX_PROFILE = 'http://www.w3.org/ns/dx/prof#Profile'
export const DX_RESOURCE_DESCRIPTOR = 'http://www.w3.org/ns/dx/prof#ResourceDescriptor'
export const DX_HAS_RESOURCE = 'http://www.w3.org/ns/dx/prof#hasResource'
export const DX_HAS_ROLE = 'http://www.w3.org/ns/dx/prof#hasRole'
export const DX_HAS_ARTIFACT = 'http://www.w3.org/ns/dx/prof#hasArtifact'
export const DX_ROLE_VALIDATION = 'http://www.w3.org/ns/dx/prof/role/validation'
export const DX_ROLE_SPECIFICATION = 'http://www.w3.org/ns/dx/prof/role/specification'
export const RO_CRATE_PROFILE = 'https://w3id.org/ro/crate/1.2'
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
  | 'person-list'
  | 'license'
  | 'enum'
  | 'file-reference'

// A single property rule on an entity rule: "each <entity> <obligation> have
// <label> (<kind>)". `obligation` is authoritative; the serialized crate derives
// `valueRequired = obligation === 'MUST'` from it.
export interface ProfilePropertyRule {
  id: string
  label: string
  description: string
  kind: ProfileValueKind
  valueName: string
  obligation: ProfileObligation
  entityId?: string
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
  position?: number
}

// A rule about which RO-Crate entity types MUST/SHOULD/MAY exist, and the
// property rules that apply to entities of that type.
export interface ProfileEntityRule {
  id: string
  label: string
  description: string
  type: string
  obligation: ProfileObligation
  exampleId?: string
  position?: number
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

// `x-*` keys are internal portal hints used to round-trip the profile builder
// UI through the generated JSON Schema. They are NOT part of JSON Schema and are
// ignored by standard validators; they must never affect required-ness or
// validation semantics on their own.
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
  'x-aruna-control'?: 'textarea' | 'tags'
  'x-obligation'?: ProfileObligation
  'x-value-kind'?: ProfileValueKind
}

export interface JsonSchema {
  $schema?: string
  $id?: string
  title?: string
  description?: string
  type?: JsonSchemaType
  required?: string[]
  properties?: Record<string, JsonSchemaProperty>
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
}

export interface ProfileViolation {
  ruleId: string
  pointer: string
  fieldId?: string
  message: string
  severity: 'error' | 'warning'
}

export interface ParsedProfileCrate {
  name: string
  description: string
  version?: string
  datePublished?: string
  license?: string
  schema?: JsonSchema
  datasetPropertyRules: ProfilePropertyRule[]
  entityRules: ProfileEntityRule[]
}
