import {
  JSON_SCHEMA_DRAFT_2020_12,
  type JsonSchema,
  type JsonSchemaProperty,
  type ProfileBasics,
  type ProfileEntityRule,
  type ProfileEntitySource,
  type ProfilePropertyRule,
  type ProfileRequiredInstance,
  type ProfileValueKind,
} from './types'
import { effectiveEntitySources, normalizeEntitySources } from './sources'
import { isDatasetType, sameSchemaOrgType, SCHEMA_ORG, termNameFromUri } from './uri'

// Resolves an entity-kind rule's target class to its `$defs` key (the canonical
// className) when the profile defines a rule for one of its target types.
// Undefined when no target has a rule (the `new` branch then encodes as a plain
// object) or when the target is the root Dataset (which has no `$defs` entry).
export type ResolveDefName = (rule: ProfilePropertyRule) => string | undefined

// MUST rules become `required`; SHOULD rules become `recommended` (a sibling of
// `required`, the Bioschemas convention). `entity`-kind rules join the presence
// arrays but get no `properties` entry: their values are `{"@id"}` references
// validated against the referenced entity's own schema, and presence-only
// membership lets required/recommended checks fire on empty instance lists.
export function schemaFromPropertyRules(
  profile: Pick<ProfileBasics, 'name' | 'description'>,
  rules: ProfilePropertyRule[],
  resolveDefName?: ResolveDefName,
): JsonSchema {
  const body = schemaBody(rules, resolveDefName)
  const schema: JsonSchema = {
    $schema: JSON_SCHEMA_DRAFT_2020_12,
    $id: './schema.json',
    title: profile.name,
    description: profile.description,
    type: 'object',
    required: body.required,
    properties: body.properties,
  }
  if (body.recommended.length) schema.recommended = body.recommended
  return schema
}

// The root schema describes the Dataset entity rule (what NewDatasetDialog
// validates); every non-Dataset entity rule becomes a `$defs` entry keyed by
// its class short name, so per-class constraints and obligations round-trip.
export function schemaFromEntityRules(profile: Pick<ProfileBasics, 'name' | 'description'>, entities: ProfileEntityRule[]): JsonSchema {
  const datasetEntity = entities.find((entity) => isDatasetType(entity.type))
  // `new`-branch policy encodings point at the target shape's `$defs` entry: the
  // first target type with a non-Dataset entity rule wins (matching how controls
  // resolve the sub-form). The Dataset root has no `$defs` entry, so it never
  // resolves; the branch then falls back to a plain object schema.
  const resolveDefName: ResolveDefName = (rule) => {
    for (const target of rule.entityTypes ?? []) {
      const match = entities.find((entity) => entity !== datasetEntity && sameSchemaOrgType(entity.type, target))
      if (match) return match.className || termNameFromUri(match.type)
    }
    return undefined
  }
  const schema = schemaFromPropertyRules(profile, datasetEntity?.propertyRules ?? [], resolveDefName)

  const defs: Record<string, JsonSchema> = {}
  for (const entity of entities) {
    if (entity === datasetEntity) continue
    const body = schemaBody(entity.propertyRules, resolveDefName)
    const def: JsonSchema = { type: 'object', title: entity.label }
    if (entity.description) def.description = entity.description
    def.required = body.required
    if (body.recommended.length) def.recommended = body.recommended
    def.properties = body.properties
    // Key `$defs` on the canonical className (D3) so it matches the mode class key
    // and an imported alias round-trips instead of being re-derived from the type.
    defs[entity.className || termNameFromUri(entity.type)] = def
  }
  if (Object.keys(defs).length) schema.$defs = defs
  return schema
}

function schemaBody(rules: ProfilePropertyRule[], resolveDefName?: ResolveDefName): {
  required: string[]
  recommended: string[]
  properties: Record<string, JsonSchemaProperty>
} {
  const properties: Record<string, JsonSchemaProperty> = {}
  const required: string[] = []
  const recommended: string[] = []
  for (const rule of rules) {
    if (!rule.valueName) continue
    if (rule.obligation === 'MUST') required.push(rule.valueName)
    else if (rule.obligation === 'SHOULD') recommended.push(rule.valueName)
    // select-object choices are `{"@id"}` references, not scalar keys: presence-
    // array membership only, never a `properties` entry (D4).
    if (rule.kind === 'select-object') continue
    if (rule.kind === 'entity') {
      // Entity refs stay presence-array-only (byte-stable) UNLESS they carry
      // machine constraints (entity-source policy / cardinality / required
      // instances), which are encoded as a `properties` entry — a documented
      // extension of the "presence arrays only" convention (D4).
      const entityProperty = entityConstraintProperty(rule, resolveDefName)
      if (entityProperty) properties[rule.valueName] = entityProperty
      continue
    }
    properties[rule.valueName] = schemaPropertyFromRule(rule)
  }
  return { required, recommended, properties }
}

export function schemaPropertyFromRule(rule: ProfilePropertyRule): JsonSchemaProperty {
  const base: JsonSchemaProperty = { title: rule.label }
  if (rule.description) base.description = rule.description

  // Entity references and select-object choices are not scalar values; callers
  // skip them, but keep a stable shape for control resolution.
  if (rule.kind === 'entity' || rule.kind === 'select-object') return base

  const scalar = scalarPropertyFromKind(rule.kind)
  const isList = rule.kind === 'keyword-list' || Boolean(rule.multipleValues)
  // select-url validates as a URL string constrained to its allowed set — only
  // when every option is a string (mixed/object options carry no scalar enum).
  const urlEnum = rule.kind === 'select-url' ? stringOptions(rule.valueOptions) : undefined

  let property: JsonSchemaProperty
  if (isList) {
    const items: JsonSchemaProperty = { ...scalar }
    if (rule.kind === 'enum') items.enum = rule.enumOptions ?? []
    else if (urlEnum) items.enum = urlEnum
    property = { ...base, type: 'array', items }
    // List cardinality lives on the enclosing array (only-when-set for byte-stability).
    if (rule.minItems !== undefined) property.minItems = rule.minItems
    if (rule.maxItems !== undefined) property.maxItems = rule.maxItems
  } else {
    property = { ...base, ...scalar }
    if (rule.kind === 'enum') property.enum = rule.enumOptions ?? []
    else if (urlEnum) property.enum = urlEnum
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
  // `multipleOf` must be strictly positive to be a valid JSON Schema keyword.
  if (rule.stepValue !== undefined && rule.stepValue > 0 && isNumericType(target)) target.multipleOf = rule.stepValue
  return property
}

// The `properties` entry for an `entity`-kind rule, or undefined when the rule
// carries no machine constraint (in which case it stays presence-array-only, so
// legacy inline-only profiles emit byte-identically). The entity-source policy
// encodes STRUCTURALLY, no invented keywords (plan 5.4): source `new` → a `$ref`
// to the target shape's `$defs` entry (plain object schema when unresolvable),
// `existing-external` → string format `iri`, `existing-crate` → string format
// `iri-reference`, several sources → `anyOf` of those branches (canonical
// order). Single-source policies therefore emit exactly the v2 shapes.
// requiredInstances map to `contains` (single) / an `allOf` of `contains`
// (several); `contains` and `items` are independent keywords, so a non-default
// policy now coexists with required instances instead of being dropped (the v2
// lossy combo is gone).
export function entityConstraintProperty(
  rule: ProfilePropertyRule,
  resolveDefName?: ResolveDefName,
): JsonSchemaProperty | undefined {
  const sources = effectiveEntitySources(rule.entitySources)
  const defaultPolicy = sources.length === 1 && sources[0] === 'new'
  const instances = (rule.requiredInstances ?? []).filter((instance) => instance.name || instance.id)
  const isList = Boolean(rule.multipleValues)
  const hasCardinality = isList && (rule.minItems !== undefined || rule.maxItems !== undefined)
  if (defaultPolicy && !instances.length && !hasCardinality) return undefined

  const valueSchema = defaultPolicy ? undefined : entitySourceSchema(sources, rule, resolveDefName)

  if (!isList && !instances.length) return valueSchema

  const property: JsonSchemaProperty = { type: 'array' }
  if (valueSchema) property.items = valueSchema
  if (instances.length === 1) {
    property.contains = containsSchemaForInstance(instances[0])
    property.minContains = 1
  } else if (instances.length > 1) {
    property.allOf = instances.map((instance) => ({ contains: containsSchemaForInstance(instance), minContains: 1 }))
  }
  if (isList && rule.minItems !== undefined) property.minItems = rule.minItems
  if (isList && rule.maxItems !== undefined) property.maxItems = rule.maxItems
  return property
}

// One value slot's schema for a non-default source policy: a single branch, or
// `anyOf` over the allowed branches in canonical source order.
function entitySourceSchema(
  sources: ProfileEntitySource[],
  rule: ProfilePropertyRule,
  resolveDefName?: ResolveDefName,
): JsonSchemaProperty {
  const branches = sources.map((source): JsonSchemaProperty => {
    if (source === 'existing-external') return { type: 'string', format: 'iri' }
    if (source === 'existing-crate') return { type: 'string', format: 'iri-reference' }
    const defName = resolveDefName?.(rule)
    return defName ? { $ref: `#/$defs/${defName}` } : { type: 'object' }
  })
  return branches.length === 1 ? branches[0] : { anyOf: branches }
}

// A single required instance → the object subschema used as `contains`: a `const`
// match on `@id` (when id-matched) else `name`, made mandatory via `required`. The
// author's `hint` rides along as the subschema `description` so it round-trips.
function containsSchemaForInstance(instance: ProfileRequiredInstance): JsonSchemaProperty {
  const key = instance.id ? '@id' : 'name'
  const value = instance.id ?? instance.name ?? ''
  const schema: JsonSchemaProperty = { type: 'object' }
  if (instance.hint) schema.description = instance.hint
  schema.properties = { [key]: { const: value } }
  schema.required = [key]
  return schema
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

// Scalar property rules recovered from a JSON Schema (root or a `$defs` entry).
// Used by mode.ts to hydrate constraints/enum/default/example onto rules whose
// kind and obligation come from the mode file. `propertyUri` is a schema.org
// fallback; the mode input `id` overrides it. `entity`-kind rules never appear
// here (they have no `properties` entry, only presence-array membership).
export function propertyRulesFromSchema(schema: JsonSchema | undefined): ProfilePropertyRule[] {
  if (!schema?.properties) return []
  const required = new Set(schema.required ?? [])
  const recommended = new Set(schema.recommended ?? [])
  return Object.entries(schema.properties).map(([valueName, property]) => {
    // Scalar constraints live on `items` for arrays (see schemaPropertyFromRule),
    // so read them from there to round-trip multi-valued rules faithfully.
    const constraints = property.type === 'array' ? property.items ?? {} : property
    const entitySources = entitySourcesFromSchemaProperty(property)
    const requiredInstances = requiredInstancesFromSchemaProperty(property)
    const rule: ProfilePropertyRule = {
      id: valueName,
      label: property.title || valueName,
      description: property.description || '',
      kind: valueKindFromSchemaProperty(property),
      propertyUri: `${SCHEMA_ORG}${valueName}`,
      valueName,
      obligation: required.has(valueName) ? 'MUST' : recommended.has(valueName) ? 'SHOULD' : 'MAY',
      defaultValue: property.default === undefined ? undefined : String(property.default),
      example: property.examples?.[0] === undefined ? undefined : String(property.examples[0]),
      enumOptions: property.enum ?? property.items?.enum,
      pattern: constraints.pattern,
      minLength: constraints.minLength,
      maxLength: constraints.maxLength,
      minValue: constraints.minimum,
      maxValue: constraints.maximum,
      stepValue: constraints.multipleOf,
      // An array carrying only `contains`/`allOf` (a required-instances entity
      // rule) is still multi-valued; the schema type is the source of truth.
      multipleValues: property.type === 'array',
    }
    if (property.minItems !== undefined) rule.minItems = property.minItems
    if (property.maxItems !== undefined) rule.maxItems = property.maxItems
    if (entitySources) rule.entitySources = entitySources
    if (requiredInstances) rule.requiredInstances = requiredInstances
    return rule
  })
}

// The entity-source policy recovered from a value slot (or its array `items`):
// `$ref`/object branches → `new`, format `iri` → `existing-external`, format
// `iri-reference` → `existing-crate`; an `anyOf` contributes every recognized
// branch. Unrecognized shapes (including the v2 presence-only / contains-only
// forms) yield undefined, which downstream treats as the legacy ['new'].
function entitySourcesFromSchemaProperty(property: JsonSchemaProperty): ProfileEntitySource[] | undefined {
  const shape = property.type === 'array' ? property.items ?? {} : property
  const branches = shape.anyOf ?? [shape]
  const sources: ProfileEntitySource[] = []
  for (const branch of branches) {
    if (branch.$ref || branch.type === 'object') sources.push('new')
    else if (branch.format === 'iri') sources.push('existing-external')
    else if (branch.format === 'iri-reference') sources.push('existing-crate')
  }
  if (!sources.length) return undefined
  return normalizeEntitySources(sources)
}

// requiredInstances recovered from `contains` (single) or an `allOf` of `contains`
// (several): each `contains` object's `const` on `@id` → id, on `name` → name, and
// its `description` → hint. Returns undefined when the property carries neither.
function requiredInstancesFromSchemaProperty(property: JsonSchemaProperty): ProfileRequiredInstance[] | undefined {
  const containers: JsonSchemaProperty[] = []
  if (property.contains) containers.push(property.contains)
  for (const sub of property.allOf ?? []) if (sub.contains) containers.push(sub.contains)
  if (!containers.length) return undefined
  const instances = containers
    .map(instanceFromContains)
    .filter((instance): instance is ProfileRequiredInstance => Boolean(instance))
  return instances.length ? instances : undefined
}

function instanceFromContains(contains: JsonSchemaProperty): ProfileRequiredInstance | undefined {
  const props = contains.properties ?? {}
  const instance: ProfileRequiredInstance = {}
  if (props['@id']?.const !== undefined) instance.id = String(props['@id'].const)
  else if (props.name?.const !== undefined) instance.name = String(props.name.const)
  if (typeof contains.description === 'string') instance.hint = contains.description
  return instance.id !== undefined || instance.name !== undefined ? instance : undefined
}

// Structural inference of a value kind from a JSON Schema property. The mode file
// is authoritative for kind; this only backfills constraint-carrying rules.
export function valueKindFromSchemaProperty(property: JsonSchemaProperty): ProfileValueKind {
  if (property.enum?.length || property.items?.enum?.length) return 'enum'
  // For arrays, inspect the element shape so multi-valued email/integer/date/uri
  // round-trip as their scalar kind (the array-ness is carried by multipleValues),
  // rather than collapsing to a generic keyword list.
  if (property.type === 'array') return scalarKindFromShape(property.items ?? {}) ?? 'keyword-list'
  return scalarKindFromShape(property) ?? 'text'
}

function scalarKindFromShape(shape: JsonSchemaProperty): ProfileValueKind | undefined {
  if (shape.type === 'integer') return 'integer'
  if (shape.type === 'number') return 'number'
  if (shape.type === 'boolean') return 'boolean'
  if (shape.format === 'date') return 'date'
  if (shape.format === 'date-time') return 'datetime'
  if (shape.format === 'email') return 'email'
  if (shape.format === 'uri') return 'url'
  return undefined
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
    case 'select-url':
      return { type: 'string', format: 'uri' }
    case 'email':
      return { type: 'string', format: 'email' }
    case 'enum':
    case 'keyword-list':
    case 'longtext':
    case 'text':
    // select-object never reaches scalar emission (schemaBody skips it); keep a
    // stable string fallback for any control-resolution caller.
    case 'select-object':
    default:
      return { type: 'string' }
  }
}

// The values array as `string[]` iff every element is a string, else undefined.
// Used to derive a select-url scalar `enum` / control `enumOptions`; a mixed or
// object-valued option set yields no scalar constraint (the objects travel as
// verbatim `valueOptions` instead).
export function stringOptions(values: unknown[] | undefined): string[] | undefined {
  if (!values?.length) return undefined
  return values.every((value) => typeof value === 'string') ? (values as string[]) : undefined
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
