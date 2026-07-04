import type { JsonSchema, JsonSchemaProperty, ProfileViolation } from './types'
import { isEmptyValue } from './controls'

export function validateProfileData(schema: JsonSchema | undefined, values: Record<string, unknown>): ProfileViolation[] {
  if (!schema?.properties) return []
  const violations: ProfileViolation[] = []
  for (const property of schema.required ?? []) {
    if (isEmptyValue(values[property])) {
      violations.push(violation('required', property, 'This field is required.'))
    }
  }

  for (const [property, propertySchema] of Object.entries(schema.properties)) {
    if (propertySchema['x-obligation'] === 'SHOULD' && isEmptyValue(values[property])) {
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
    if (schema.format === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) violations.push(violation('format.date', fieldId, 'Use YYYY-MM-DD.'))
    if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) violations.push(violation('format.date-time', fieldId, 'Use a valid date-time.'))
    if (schema.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) violations.push(violation('format.email', fieldId, 'Use a valid email address.'))
    if (schema.format === 'uri' && !isUri(value)) violations.push(violation('format.uri', fieldId, 'Use a valid URI.'))
    if (schema.pattern && !matchesPattern(value, schema.pattern)) violations.push(violation('pattern', fieldId, 'Value does not match the required pattern.'))
    if (schema.minLength !== undefined && value.length < schema.minLength) violations.push(violation('minLength', fieldId, `Use at least ${schema.minLength} characters.`))
    if (schema.maxLength !== undefined && value.length > schema.maxLength) violations.push(violation('maxLength', fieldId, `Use at most ${schema.maxLength} characters.`))
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) violations.push(violation('minimum', fieldId, `Use a value of at least ${schema.minimum}.`))
    if (schema.maximum !== undefined && value > schema.maximum) violations.push(violation('maximum', fieldId, `Use a value of at most ${schema.maximum}.`))
    if (schema.multipleOf !== undefined && !isMultipleOf(value, schema.multipleOf)) violations.push(violation('multipleOf', fieldId, `Use increments of ${schema.multipleOf}.`))
  }

  if (schema.enum?.length && typeof value === 'string' && !schema.enum.includes(value)) {
    violations.push(violation('enum', fieldId, 'Choose one of the allowed values.'))
  }
}

function violation(
  ruleId: string,
  fieldId: string,
  message: string,
  severity: ProfileViolation['severity'] = 'error',
): ProfileViolation {
  return {
    ruleId,
    pointer: `/${fieldId.replace(/~/g, '~0').replace(/\//g, '~1')}`,
    fieldId,
    message,
    severity,
  }
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
