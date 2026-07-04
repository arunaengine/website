import type { JsonSchema, JsonSchemaProperty, ProfileControl } from './types'

export function controlsFromSchema(schema: JsonSchema | undefined): ProfileControl[] {
  if (!schema?.properties) return []
  const required = new Set(schema.required ?? [])
  return Object.entries(schema.properties).map(([property, propertySchema]) => ({
    property,
    label: propertySchema.title || property,
    description: propertySchema.description || '',
    control: controlKind(propertySchema),
    required: required.has(property) || propertySchema['x-obligation'] === 'MUST',
    obligation: propertySchema['x-obligation'] ?? (required.has(property) ? 'MUST' : 'MAY'),
    // Multi-valued enums carry their options on `items.enum`.
    enumOptions: propertySchema.enum ?? propertySchema.items?.enum,
    schema: propertySchema,
    defaultValue: propertySchema.default,
  }))
}

export function defaultControlValues(controls: ProfileControl[]): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const control of controls) {
    if (control.defaultValue !== undefined) {
      values[control.property] = Array.isArray(control.defaultValue)
        ? control.defaultValue.join(', ')
        : control.defaultValue
    } else if (control.control === 'checkbox') {
      values[control.property] = false
    } else {
      values[control.property] = ''
    }
  }
  return values
}

export function normalizeProfileValues(
  values: Record<string, unknown>,
  controls: ProfileControl[],
  options: { omitEmpty?: boolean } = {},
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {}
  for (const control of controls) {
    const raw = values[control.property]
    const value = normalizeValue(raw, control.schema)
    if (options.omitEmpty && isEmptyValue(value)) continue
    normalized[control.property] = value
  }
  return normalized
}

export function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
}

function controlKind(property: JsonSchemaProperty): ProfileControl['control'] {
  if (property.enum?.length) return 'select'
  if (property.type === 'array') return 'tags'
  if (property.type === 'boolean') return 'checkbox'
  if (property.type === 'integer') return 'integer'
  if (property.type === 'number') return 'number'
  if (property.format === 'date') return 'date'
  if (property.format === 'date-time') return 'datetime-local'
  if (property.format === 'email') return 'email'
  if (property.format === 'uri') return 'url'
  if (property['x-aruna-control'] === 'textarea') return 'textarea'
  return 'text'
}

function normalizeValue(value: unknown, schema: JsonSchemaProperty): unknown {
  if (schema.type === 'array') {
    if (Array.isArray(value)) return value.map((entry) => normalizeValue(entry, schema.items ?? {})).filter((entry) => !isEmptyValue(entry))
    if (typeof value === 'string') return value.split(',').map((entry) => normalizeValue(entry.trim(), schema.items ?? {})).filter((entry) => !isEmptyValue(entry))
    return []
  }
  if (value === undefined || value === null) return ''
  if (schema.type === 'boolean') return value === true || value === 'true'
  if (schema.type === 'integer') {
    if (value === '') return ''
    const parsed = Number.parseInt(String(value), 10)
    return Number.isFinite(parsed) ? parsed : value
  }
  if (schema.type === 'number') {
    if (value === '') return ''
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : value
  }
  return typeof value === 'string' ? value.trim() : value
}
