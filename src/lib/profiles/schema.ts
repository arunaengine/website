import {
  JSON_SCHEMA_DRAFT_2020_12,
  type JsonSchema,
  type JsonSchemaProperty,
  type ProfileBasics,
  type ProfileEntityRule,
  type ProfilePropertyRule,
  type ProfileValueKind,
} from './types'

const PROFILE_VALUE_KINDS: readonly ProfileValueKind[] = [
  'text',
  'longtext',
  'integer',
  'number',
  'boolean',
  'date',
  'datetime',
  'url',
  'email',
  'keyword-list',
  'person-list',
  'license',
  'enum',
  'file-reference',
]

function isProfileValueKind(value: unknown): value is ProfileValueKind {
  return typeof value === 'string' && (PROFILE_VALUE_KINDS as readonly string[]).includes(value)
}

export function schemaFromPropertyRules(profile: ProfileBasics, rules: ProfilePropertyRule[]): JsonSchema {
  const properties: Record<string, JsonSchemaProperty> = {}
  const required: string[] = []

  for (const rule of rules) {
    if (!rule.valueName) continue
    properties[rule.valueName] = schemaPropertyFromRule(rule)
    if (rule.obligation === 'MUST') required.push(rule.valueName)
  }

  return {
    $schema: JSON_SCHEMA_DRAFT_2020_12,
    $id: './schema.json',
    title: profile.name,
    description: profile.description,
    type: 'object',
    required,
    properties,
  }
}

// The generated JSON Schema describes the Dataset entity rule only: dataset
// metadata is what NewDatasetDialog validates. MUST rules become `required`;
// SHOULD rules carry an `x-obligation` warning annotation (not a hard failure).
export function schemaFromEntityRules(profile: ProfileBasics, entities: ProfileEntityRule[]): JsonSchema {
  const datasetEntity = entities.find((entity) => entity.type.endsWith('/Dataset') || entity.type === 'Dataset')
  return schemaFromPropertyRules(profile, datasetEntity?.propertyRules ?? [])
}

export function schemaPropertyFromRule(rule: ProfilePropertyRule): JsonSchemaProperty {
  const base: JsonSchemaProperty = {
    title: rule.label,
    'x-obligation': rule.obligation,
    'x-value-kind': rule.kind,
  }
  if (rule.description) base.description = rule.description

  const scalar = scalarPropertyFromKind(rule.kind)
  const isList = rule.kind === 'keyword-list' || rule.kind === 'person-list' || Boolean(rule.multipleValues)

  let property: JsonSchemaProperty
  if (isList) {
    const items: JsonSchemaProperty = { ...scalar }
    if (rule.kind === 'enum') items.enum = rule.enumOptions ?? []
    property = { ...base, type: 'array', items, 'x-aruna-control': 'tags' }
  } else {
    property = { ...base, ...scalar }
    if (rule.kind === 'longtext') property['x-aruna-control'] = 'textarea'
    if (rule.kind === 'enum') property.enum = rule.enumOptions ?? []
  }

  if (rule.example) property.examples = [rule.example]
  if (rule.defaultValue !== undefined && rule.defaultValue !== '') {
    property.default = coerceDefault(rule.defaultValue, property)
  }
  // Scalar constraints belong on the value's scalar shape. For multi-valued
  // properties that shape is `items` (each element is validated against it), not
  // the enclosing array — where pattern/minLength/minimum are meaningless.
  const target = property.type === 'array' ? (property.items ??= {}) : property
  if (rule.pattern && target.type === 'string') target.pattern = rule.pattern
  if (rule.minLength !== undefined && target.type === 'string') target.minLength = rule.minLength
  if (rule.maxLength !== undefined && target.type === 'string') target.maxLength = rule.maxLength
  if (rule.minValue !== undefined && isNumericType(target)) target.minimum = rule.minValue
  if (rule.maxValue !== undefined && isNumericType(target)) target.maximum = rule.maxValue
  if (rule.stepValue !== undefined && isNumericType(target)) target.multipleOf = rule.stepValue
  return property
}

export function parseSchemaText(value: unknown): JsonSchema | undefined {
  if (isJsonSchema(value)) return value
  if (typeof value !== 'string') return undefined
  try {
    const parsed = JSON.parse(value)
    return isJsonSchema(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

export function propertyRulesFromSchema(schema: JsonSchema | undefined): ProfilePropertyRule[] {
  if (!schema?.properties) return []
  const required = new Set(schema.required ?? [])
  return Object.entries(schema.properties).map(([valueName, property], index) => {
    // Scalar constraints live on `items` for arrays (see schemaPropertyFromRule),
    // so read them from there to round-trip multi-valued rules faithfully.
    const constraints = property.type === 'array' ? property.items ?? {} : property
    return {
      id: valueName,
      label: property.title || valueName,
      description: property.description || '',
      kind: valueKindFromSchemaProperty(property),
      valueName,
      obligation: property['x-obligation'] ?? (required.has(valueName) ? 'MUST' : 'MAY'),
      defaultValue: property.default === undefined ? undefined : String(property.default),
      example: property.examples?.[0] === undefined ? undefined : String(property.examples[0]),
      enumOptions: property.enum ?? property.items?.enum,
      pattern: constraints.pattern,
      minLength: constraints.minLength,
      maxLength: constraints.maxLength,
      minValue: constraints.minimum,
      maxValue: constraints.maximum,
      stepValue: constraints.multipleOf,
      multipleValues: property.type === 'array',
      position: index + 1,
    }
  })
}

// Prefer the internal `x-value-kind` hint (so person-list/license/file-reference
// round-trip), then fall back to structural inference from the JSON Schema shape.
export function valueKindFromSchemaProperty(property: JsonSchemaProperty): ProfileValueKind {
  const hinted = property['x-value-kind']
  if (isProfileValueKind(hinted)) return hinted
  if (property.enum?.length || property.items?.enum?.length) return 'enum'
  if (property.type === 'array') return 'keyword-list'
  if (property.type === 'integer') return 'integer'
  if (property.type === 'number') return 'number'
  if (property.type === 'boolean') return 'boolean'
  if (property.format === 'date') return 'date'
  if (property.format === 'date-time') return 'datetime'
  if (property.format === 'email') return 'email'
  if (property.format === 'uri') return 'url'
  if (property['x-aruna-control'] === 'textarea') return 'longtext'
  return 'text'
}

function scalarPropertyFromKind(kind: ProfileValueKind): JsonSchemaProperty {
  switch (kind) {
    case 'integer':
      return { type: 'integer' }
    case 'number':
      return { type: 'number' }
    case 'boolean':
      return { type: 'boolean' }
    case 'date':
      return { type: 'string', format: 'date' }
    case 'datetime':
      return { type: 'string', format: 'date-time' }
    case 'url':
    case 'license':
    case 'file-reference':
      return { type: 'string', format: 'uri' }
    case 'email':
      return { type: 'string', format: 'email' }
    case 'enum':
    case 'keyword-list':
    case 'person-list':
    case 'longtext':
    case 'text':
    default:
      return { type: 'string' }
  }
}

function coerceDefault(value: string, property: JsonSchemaProperty): unknown {
  if (property.type === 'boolean') return value === 'true'
  if (property.type === 'integer') {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : value
  }
  if (property.type === 'number') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : value
  }
  if (property.type === 'array') return value.split(',').map((entry) => entry.trim()).filter(Boolean)
  return value
}

function isNumericType(property: JsonSchemaProperty): boolean {
  return property.type === 'number' || property.type === 'integer'
}

function isJsonSchema(value: unknown): value is JsonSchema {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
