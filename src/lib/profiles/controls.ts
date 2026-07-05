import { schemaPropertyFromRule, stringOptions } from './schema'
import { sameSchemaOrgType } from './uri'
import type {
  JsonSchemaProperty,
  ProfileControl,
  ProfileControlKind,
  ProfileEntityRule,
  ProfilePropertyRule,
  ProfileValueKind,
} from './types'

// Build the dataset-dialog controls from property rules. `entity`-kind rules
// resolve their target entity rule (the sub-form) from `entities` by the first
// matching entityTypes URI; their values are managed by the dialog as entity
// instance arrays, not as scalars, so they are skipped by scalar normalization.
export function controlsFromRules(rules: ProfilePropertyRule[], entities: ProfileEntityRule[]): ProfileControl[] {
  return rules.map((rule) => {
    const schema = schemaPropertyFromRule(rule)
    const multiple = rule.kind === 'keyword-list' || Boolean(rule.multipleValues)
    // select-url renders as a plain select over its allowed URL strings.
    const enumOptions = rule.kind === 'select-url' ? stringOptions(rule.valueOptions) : rule.enumOptions
    return {
      property: rule.valueName,
      label: rule.label || rule.valueName,
      description: rule.description || '',
      control: controlKindFromValueKind(rule.kind),
      required: rule.obligation === 'MUST',
      obligation: rule.obligation,
      enumOptions,
      schema,
      defaultValue: schema.default,
      kind: rule.kind,
      multiple,
      ...(rule.kind === 'entity'
        ? { entityTypes: rule.entityTypes ?? [], entityRule: resolveEntityRule(rule, entities) }
        : {}),
      // select-object carries its raw option objects for wave C to render as a
      // pick-list emitting a flattened contextual entity + `{"@id"}` reference.
      ...(rule.kind === 'select-object' ? { valueOptions: rule.valueOptions ?? [] } : {}),
      // Constraint metadata the schema can't surface to entity controls (whose
      // schema is presence-only): threaded so wave B forms render without re-deriving.
      ...(rule.referenceMode ? { referenceMode: rule.referenceMode } : {}),
      ...(rule.minItems !== undefined ? { minItems: rule.minItems } : {}),
      ...(rule.maxItems !== undefined ? { maxItems: rule.maxItems } : {}),
      ...(rule.requiredInstances?.length ? { requiredInstances: rule.requiredInstances } : {}),
    }
  })
}

export function defaultControlValues(controls: ProfileControl[]): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const control of controls) {
    // Entity and select-object controls hold reference instances, not scalars.
    if (control.control === 'entity' || control.control === 'select-object') {
      values[control.property] = []
    } else if (control.control === 'select' && control.multiple) {
      // A multi-valued select holds its chosen options as a real array (the
      // checkbox-list UI edits it in place), not a comma-joined display string.
      values[control.property] = Array.isArray(control.defaultValue) ? [...control.defaultValue] : []
    } else if (control.defaultValue !== undefined) {
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
    // Entity and select-object controls hold reference instances that the dataset
    // dialog emits as flattened contextual entities; they are not scalar values to
    // normalize.
    if (control.control === 'entity' || control.control === 'select-object') continue
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

function controlKindFromValueKind(kind: ProfileValueKind): ProfileControlKind {
  switch (kind) {
    case 'longtext':
      return 'textarea'
    case 'integer':
      return 'integer'
    case 'number':
      return 'number'
    case 'boolean':
      return 'checkbox'
    case 'date':
      return 'date'
    case 'datetime':
      return 'datetime-local'
    case 'url':
      return 'url'
    case 'email':
      return 'email'
    case 'enum':
      return 'select'
    case 'select-url':
      // A pick-list over the allowed URL strings; behaves like a plain select.
      return 'select'
    case 'select-object':
      return 'select-object'
    case 'keyword-list':
      return 'tags'
    case 'entity':
      return 'entity'
    case 'text':
    default:
      return 'text'
  }
}

function resolveEntityRule(rule: ProfilePropertyRule, entities: ProfileEntityRule[]): ProfileEntityRule | undefined {
  for (const target of rule.entityTypes ?? []) {
    const match = entities.find((entity) => sameSchemaOrgType(entity.type, target))
    if (match) return match
  }
  return undefined
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
    // Use Number(), not parseInt: a non-integer like 1.7 must stay 1.7 so the
    // integer validator flags it, rather than being silently truncated to 1.
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : value
  }
  if (schema.type === 'number') {
    if (value === '') return ''
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : value
  }
  return typeof value === 'string' ? value.trim() : value
}
