import type {
  JsonSchema,
  JsonSchemaProperty,
  ProfilePropertyRule,
  ProfileRequiredInstance,
  ProfileViolation,
} from './types'
import { isEmptyValue } from './controls'

export function validateProfileData(schema: JsonSchema | undefined, values: Record<string, unknown>): ProfileViolation[] {
  if (!schema?.properties) return []
  const violations: ProfileViolation[] = []
  for (const property of schema.required ?? []) {
    if (isEmptyValue(values[property])) {
      violations.push(violation('required', property, 'This field is required.'))
    }
  }

  for (const property of schema.recommended ?? []) {
    if (isEmptyValue(values[property])) {
      violations.push(violation('recommended', property, 'This recommended field is empty.', 'warning'))
    }
  }

  for (const [property, propertySchema] of Object.entries(schema.properties)) {
    const value = values[property]
    if (isEmptyValue(value)) continue
    validateValue(property, value, propertySchema, violations)
  }
  return violations
}

// One violation per ProfileRequiredInstance a list-valued entity rule (e.g.
// `hasPart`) does not contain. Severity follows the rule's obligation: MUST →
// blocking `error`; SHOULD and MAY → `warning` (MAY is the builder default, so an
// optional required-contents rule never hard-blocks dataset creation). `entries`
// are the candidate references' `{ id, name }`; an instance is satisfied by any
// entry whose `@id` OR `name` matches it exactly. Pure — the dataset dialog and
// the jiti suite call it directly against the collected data-reference entries.
export function validateRequiredInstances(
  rule: ProfilePropertyRule,
  entries: Array<{ id?: string; name?: string }>,
): ProfileViolation[] {
  const severity: ProfileViolation['severity'] = rule.obligation === 'MUST' ? 'error' : 'warning'
  const violations: ProfileViolation[] = []
  // Index against the list filtered to nameable instances — the same order in
  // which schema.ts emits `contains`/`allOf`, so `requiredInstance.<n>` is the
  // stable rule-id segment the backend CEL programs will mirror.
  ;(rule.requiredInstances ?? [])
    .filter((instance) => instance.name || instance.id)
    .forEach((instance, index) => {
      if (entries.some((entry) => instanceMatches(instance, entry))) return
      violations.push(violation(`requiredInstance.${index}`, rule.valueName, requiredInstanceMessage(instance), severity, instance.hint))
    })
  return violations
}

function instanceMatches(instance: ProfileRequiredInstance, entry: { id?: string; name?: string }): boolean {
  if (instance.id && entry.id === instance.id) return true
  if (instance.name && entry.name === instance.name) return true
  return false
}

function requiredInstanceMessage(instance: ProfileRequiredInstance): string {
  if (instance.id) return `Include the required entry with @id “${instance.id}”.`
  return `Include the required entry named “${instance.name}”.`
}

function validateValue(
  property: string,
  value: unknown,
  schema: JsonSchemaProperty,
  violations: ProfileViolation[],
) {
  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      violations.push(violation('type.array', property, 'Expected a list of values.'))
      return
    }
    // List cardinality is blocking when the (non-empty) list violates it; an empty
    // list is left to the required/recommended presence checks (invariant 7).
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      violations.push(violation('minItems', property, `Provide at least ${schema.minItems} ${schema.minItems === 1 ? 'entry' : 'entries'}.`))
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      violations.push(violation('maxItems', property, `Provide at most ${schema.maxItems} ${schema.maxItems === 1 ? 'entry' : 'entries'}.`))
    }
    const itemSchema = schema.items ?? {}
    value.forEach((entry, index) => validateScalar(`${property}/${index}`, entry, itemSchema, violations, property))
    return
  }
  validateScalar(property, value, schema, violations)
}

function validateScalar(
  pointerProperty: string,
  value: unknown,
  schema: JsonSchemaProperty,
  violations: ProfileViolation[],
  fieldId = pointerProperty,
) {
  if (schema.type === 'string' && typeof value !== 'string') violations.push(violation('type.string', fieldId, 'Expected text.'))
  if (schema.type === 'integer' && !(typeof value === 'number' && Number.isInteger(value))) violations.push(violation('type.integer', fieldId, 'Expected an integer.'))
  if (schema.type === 'number' && typeof value !== 'number') violations.push(violation('type.number', fieldId, 'Expected a number.'))
  if (schema.type === 'boolean' && typeof value !== 'boolean') violations.push(violation('type.boolean', fieldId, 'Expected true or false.'))

  if (typeof value === 'string') {
    if (schema.format === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) violations.push(violation('format.date', fieldId, 'Use YYYY-MM-DD.', 'error', exampleHint(schema)))
    if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) violations.push(violation('format.date-time', fieldId, 'Use a valid date-time.', 'error', exampleHint(schema)))
    if (schema.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) violations.push(violation('format.email', fieldId, 'Use a valid email address.', 'error', exampleHint(schema)))
    if (schema.format === 'uri' && !isUri(value)) violations.push(violation('format.uri', fieldId, 'Use a valid URI.', 'error', exampleHint(schema)))
    if (schema.pattern && !matchesPattern(value, schema.pattern)) violations.push(violation('pattern', fieldId, `Value does not match the required pattern ${schema.pattern}.`, 'error', exampleHint(schema)))
    if (schema.minLength !== undefined && value.length < schema.minLength) violations.push(violation('minLength', fieldId, `Use at least ${schema.minLength} characters.`))
    if (schema.maxLength !== undefined && value.length > schema.maxLength) violations.push(violation('maxLength', fieldId, `Use at most ${schema.maxLength} characters.`))
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) violations.push(violation('minimum', fieldId, `Use a value of at least ${schema.minimum}.`))
    if (schema.maximum !== undefined && value > schema.maximum) violations.push(violation('maximum', fieldId, `Use a value of at most ${schema.maximum}.`))
    if (schema.multipleOf !== undefined && !isMultipleOf(value, schema.multipleOf)) violations.push(violation('multipleOf', fieldId, `Use increments of ${schema.multipleOf}.`))
  }

  if (schema.enum?.length && typeof value === 'string' && !schema.enum.includes(value)) {
    violations.push(violation('enum', fieldId, `Choose one of the allowed values: ${formatAllowedValues(schema.enum)}.`))
  }
}

function violation(
  constraint: string,
  fieldId: string,
  message: string,
  severity: ProfileViolation['severity'] = 'error',
  hint?: string,
): ProfileViolation {
  return {
    constraint,
    pointer: `/${fieldId.replace(/~/g, '~0').replace(/\//g, '~1')}`,
    fieldId,
    message,
    severity,
    ...(hint ? { hint } : {}),
  }
}

// A short "Example: <value>" hint from the property's JSON Schema `examples`,
// surfaced under the violation message to show a valid shape.
function exampleHint(schema: JsonSchemaProperty): string | undefined {
  return schema.examples?.length ? `Example: ${String(schema.examples[0])}` : undefined
}

// List the allowed enum values inline, capping the list so long enums stay readable.
function formatAllowedValues(values: string[]): string {
  const shown = values.slice(0, 6)
  return values.length > shown.length ? `${shown.join(', ')}, …` : shown.join(', ')
}

function isUri(value: string): boolean {
  try {
    const parsed = new URL(value)
    return Boolean(parsed.protocol)
  } catch {
    return /^[a-z][a-z0-9+.-]*:/i.test(value)
  }
}

function matchesPattern(value: string, pattern: string): boolean {
  try {
    return new RegExp(pattern).test(value)
  } catch {
    // Fail open on an unparseable pattern: author-time validation in the profile
    // builder already rejects invalid regular expressions, so a bad pattern here
    // means a hand-authored crate and should not block dataset submission.
    return true
  }
}

function isMultipleOf(value: number, step: number): boolean {
  if (!step) return true
  const quotient = value / step
  return Math.abs(quotient - Math.round(quotient)) < 1e-10
}
