// Describo/Crate-O-compatible "mode file" serialization of profile rules.
//
// This is an independent implementation written from the published format
// description: a JSON document `{ metadata, context, classes }` where each class
// is `{ definition?, subClassOf?, inputs }` and each input carries the native
// keys `id` (property URI), `name` (compact term), `label`, `help`, `required`,
// `multiple`, `type` (array of type tokens), `values` (Select options). NO code,
// snippets, or asset files from the GPL-3 Describo/Crate-O projects are copied
// or vendored; only the wire format is shared. Unknown keys round-trip verbatim.

import { propertyRulesFromSchema } from './schema'
import { isDatasetType, isRecord, sameSchemaOrgType, SCHEMA_ORG as SCHEMA, termNameFromUri } from './uri'
import type {
  JsonSchema,
  ProfileBasics,
  ProfileEntityRule,
  ProfileObligation,
  ProfilePropertyRule,
  ProfileValueKind,
} from './types'

export interface ModeInput {
  id: string
  name: string
  label?: string
  help?: string
  required?: boolean
  multiple?: boolean
  type: string[]
  values?: unknown[]
  [key: string]: unknown
}

export interface ModeClass {
  definition?: string
  subClassOf?: string[]
  inputs: ModeInput[]
  [key: string]: unknown
}

export interface ModeFile {
  metadata: { name: string; description?: string; version?: string | number; [key: string]: unknown }
  context?: unknown
  classes: Record<string, ModeClass>
  [key: string]: unknown
}

// Top-level mode keys the portal maps into editable rules; everything else round-
// trips verbatim (layouts, lookup, localisation, propertyAssociations, resolve…).
export const MODELED_MODE_KEYS = new Set(['metadata', 'context', 'classes'])

// The `definition` key is the documented enum ('override' | 'inherit'), NOT a
// description. We always author fresh classes, so we emit 'override' and never
// read it back as text. Entity descriptions round-trip via schema.json instead.
const CLASS_DEFINITION = 'override'

// Reserved mode input `type` tokens that denote a primitive control rather than
// an entity class name. Any other token is treated as a referenced class.
const PRIMITIVE_TYPES = new Set([
  'Text',
  'TextArea',
  'Date',
  'DateTime',
  'Time',
  'Number',
  'Boolean',
  'URL',
  'Select',
  'SelectObject',
  'SelectURL',
  'Value',
  'Geo',
  'ANY',
])

export function isModeFile(value: unknown): value is ModeFile {
  if (!isRecord(value)) return false
  const classes = value.classes
  return isRecord(value.metadata) && isRecord(classes)
}

export function modeBasics(mode: ModeFile): Partial<ProfileBasics> {
  const metadata = mode.metadata ?? {}
  const basics: Partial<ProfileBasics> = {}
  if (typeof metadata.name === 'string') basics.name = metadata.name
  if (typeof metadata.description === 'string') basics.description = metadata.description
  if (metadata.version !== undefined) basics.version = String(metadata.version)
  return basics
}

// Our rules -> mode JSON, using only native mode keys. When `rawImport` is given,
// unknown top-level keys, unknown class keys and unknown input keys are preserved
// verbatim; only the parts we model (metadata name/description/version, class
// inputs and context) are overwritten with our edits.
export function entityRulesToMode(
  basics: Pick<ProfileBasics, 'name' | 'description' | 'version'>,
  entities: ProfileEntityRule[],
  rawImport?: ModeFile,
): ModeFile {
  // type URI -> canonical className, so an entity-reference input's `type` token
  // (a class name) is the SAME alias as the referenced class's mode key (D3). For
  // schema.org targets this equals termNameFromUri, so fresh emission is
  // unchanged; only imported aliases (e.g. Specimen -> OBO PURL) benefit. When two
  // entity rules share one type URI the map is LAST-WINS (L10): entity references
  // to that type serialize with the last rule's className, matching buildModeContext.
  const classNameByType = new Map<string, string>()
  for (const entity of entities) {
    if (entity.type) classNameByType.set(entity.type, entity.className || classNameForType(entity.type))
  }
  const resolveClassName = (typeUri: string): string => classNameByType.get(typeUri) ?? classNameForType(typeUri)

  const classes: Record<string, ModeClass> = {}
  for (const entity of entities) {
    // Key on the canonical className (D3) so an imported class alias round-trips
    // (e.g. `Specimen`) instead of being re-derived from the type URI; the
    // rawImport lookup matches by the same key to preserve unknown class config.
    const className = entity.className || classNameForType(entity.type)
    const rawClass = rawImport?.classes?.[className]
    const inputs = entity.propertyRules.map((rule) => inputFromRule(rule, rawClass, resolveClassName))
    // `definition` is the enum flag, not the description; always 'override'.
    const modeled: ModeClass = { definition: CLASS_DEFINITION, inputs }
    classes[className] = rawClass ? { ...rawClass, ...modeled } : modeled
  }

  const context = buildModeContext(entities)
  const metadata = {
    ...(rawImport?.metadata ?? {}),
    name: basics.name,
    ...(basics.description ? { description: basics.description } : {}),
    ...(basics.version ? { version: basics.version } : {}),
  }

  const base = rawImport ? { ...rawImport } : {}
  return {
    ...base,
    metadata,
    ...(context ? { context } : rawImport?.context !== undefined ? { context: rawImport.context } : {}),
    classes,
  }
}

// Inverse of entityRulesToMode. Obligation: mode `required` (or membership in
// the class schema's `required` array) -> MUST, else the class schema's
// `recommended` includes the value name -> SHOULD, else MAY. Class names resolve
// to type URIs via the mode context, falling back to http://schema.org/<Name>.
// A `type` array containing any non-primitive (class) token yields an `entity`
// rule. Constraints hydrate from the class's schema scope: the root schema for
// the Dataset class, `$defs[<class name>]` for every other class. Entity
// descriptions round-trip via the schema (`$defs[<class>].description`); the
// Dataset entity's description is not restored (its baseline is regenerated).
export function modeToEntityRules(mode: ModeFile, schema?: JsonSchema): ProfileEntityRule[] {
  const context = contextLookup(mode.context)

  return Object.entries(mode.classes ?? {}).map(([className, modeClass]) => {
    const type = resolveClassUri(className, context)
    const dataset = isDatasetType(type)
    const classSchema = dataset ? schema : schema?.$defs?.[className]
    const required = new Set(classSchema?.required ?? [])
    const recommended = new Set(classSchema?.recommended ?? [])
    const schemaRules = new Map(propertyRulesFromSchema(classSchema).map((rule) => [rule.valueName, rule]))
    const inputs = (Array.isArray(modeClass?.inputs) ? modeClass.inputs.filter(isRecord) : []) as ModeInput[]
    const propertyRules = inputs.map((input) =>
      ruleFromInput(input, { context, required, recommended, schemaRules }),
    )
    // The root schema's title is the profile name and its description is the
    // profile description, so only $defs entries hydrate entity label/description.
    const label = (!dataset && classSchema?.title) || className
    const description = !dataset && typeof classSchema?.description === 'string' ? classSchema.description : ''
    return {
      id: className,
      label,
      description,
      type,
      // className is the original `classes` key: the compact alias to preserve on
      // export even when `type` resolved to an external (e.g. OBO) URI via context.
      className,
      propertyRules,
    }
  })
}

// Every entity-reference property, across all entity rules, that points at
// `entityType` via its entityTypes. Single source of truth for "what references
// this type" (L8), used by deriveEntityObligation and the builder's referenced-by
// panel / unreferenced-rule detection so the traversal is not duplicated.
export function referencesToType(
  entityType: string,
  entities: ProfileEntityRule[],
): Array<{ entityLabel: string; valueName: string; obligation: ProfileObligation }> {
  const refs: Array<{ entityLabel: string; valueName: string; obligation: ProfileObligation }> = []
  for (const entity of entities) {
    for (const rule of entity.propertyRules) {
      if (rule.kind !== 'entity' || !rule.entityTypes?.some((target) => sameSchemaOrgType(target, entityType))) continue
      refs.push({ entityLabel: entity.label, valueName: rule.valueName, obligation: rule.obligation })
    }
  }
  return refs
}

// Derived entity obligation: MUST iff any MUST property references the type via
// its entityTypes, SHOULD iff any SHOULD property does, else MAY. `via` points at
// the strongest referencing property so the UI can explain the derivation.
export function deriveEntityObligation(
  entityType: string,
  entities: ProfileEntityRule[],
): { obligation: ProfileObligation; via?: { entityLabel: string; valueName: string } } {
  const refs = referencesToType(entityType, entities)
  const mustVia = refs.find((ref) => ref.obligation === 'MUST')
  const shouldVia = refs.find((ref) => ref.obligation === 'SHOULD')
  if (mustVia) return { obligation: 'MUST', via: { entityLabel: mustVia.entityLabel, valueName: mustVia.valueName } }
  if (shouldVia) return { obligation: 'SHOULD', via: { entityLabel: shouldVia.entityLabel, valueName: shouldVia.valueName } }
  return { obligation: 'MAY' }
}

function inputFromRule(
  rule: ProfilePropertyRule,
  rawClass: ModeClass | undefined,
  resolveClassName: (typeUri: string) => string,
): ModeInput {
  const rawInput = rawClass?.inputs?.find((input) => input?.name === rule.valueName || input?.id === rule.propertyUri)
  const { type, multiple, values } = typeForRule(rule, resolveClassName)
  const modeled: ModeInput = {
    id: rule.propertyUri,
    name: rule.valueName,
    type,
  }
  if (rule.label) modeled.label = rule.label
  if (rule.description) modeled.help = rule.description
  const merged: ModeInput = rawInput ? { ...rawInput, ...modeled } : modeled

  // Demotions must round-trip: overwrite or delete the fields our rule controls so
  // a preserved raw `required`/`multiple`/`values` cannot resurrect after a MUST→
  // MAY, multiple→single, or enum→text edit. Everything else stays verbatim.
  if (rule.obligation === 'MUST') merged.required = true
  else delete merged.required
  if (multiple) merged.multiple = true
  else delete merged.multiple
  // `values` discipline (D4): for select-url/select-object emit the raw
  // `valueOptions` VERBATIM (never coerced or dropped by demotion); for enum emit
  // the string-coerced options; for every other kind (which has no options) drop
  // any preserved raw `values` so an enum→text demotion cannot resurrect it.
  if (rule.kind === 'select-url' || rule.kind === 'select-object') merged.values = rule.valueOptions ?? []
  else if (values) merged.values = values
  else delete merged.values

  return merged
}

function typeForRule(
  rule: ProfilePropertyRule,
  resolveClassName: (typeUri: string) => string,
): { type: string[]; multiple: boolean; values?: unknown[] } {
  switch (rule.kind) {
    case 'longtext':
      return { type: ['TextArea'], multiple: Boolean(rule.multipleValues) }
    case 'date':
      return { type: ['Date'], multiple: Boolean(rule.multipleValues) }
    case 'datetime':
      return { type: ['DateTime'], multiple: Boolean(rule.multipleValues) }
    case 'integer':
    case 'number':
      return { type: ['Number'], multiple: Boolean(rule.multipleValues) }
    case 'boolean':
      return { type: ['Boolean'], multiple: Boolean(rule.multipleValues) }
    case 'url':
      return { type: ['URL'], multiple: Boolean(rule.multipleValues) }
    case 'email':
      return { type: ['Text'], multiple: Boolean(rule.multipleValues) }
    case 'enum':
      return { type: ['Select'], multiple: Boolean(rule.multipleValues), values: rule.enumOptions ?? [] }
    case 'select-url':
      // Raw URL-string options re-emitted verbatim (see inputFromRule values rule).
      return { type: ['SelectURL'], multiple: Boolean(rule.multipleValues), values: rule.valueOptions ?? [] }
    case 'select-object':
      // Raw JSON-LD object options re-emitted verbatim.
      return { type: ['SelectObject'], multiple: Boolean(rule.multipleValues), values: rule.valueOptions ?? [] }
    case 'keyword-list':
      return { type: ['Text'], multiple: true }
    case 'entity':
      return {
        type: (rule.entityTypes ?? []).map(resolveClassName),
        multiple: Boolean(rule.multipleValues),
      }
    case 'text':
    default:
      return { type: ['Text'], multiple: Boolean(rule.multipleValues) }
  }
}

function ruleFromInput(
  input: ModeInput,
  ctx: {
    context: Record<string, string>
    required: Set<string>
    recommended: Set<string>
    schemaRules: Map<string, ProfilePropertyRule>
  },
): ProfilePropertyRule {
  const typeTokens = Array.isArray(input.type) ? input.type : input.type ? [String(input.type)] : []
  const classTokens = typeTokens.filter((token) => !PRIMITIVE_TYPES.has(token))
  const valueName = String(input.name ?? input.id ?? 'field')
  const propertyUri = typeof input.id === 'string' && input.id ? input.id : `${SCHEMA}${valueName}`
  const hydrated = ctx.schemaRules.get(valueName)
  const multiple = Boolean(input.multiple) || hydrated?.multipleValues || false
  // Keep the raw mode `values` untouched for verbatim preservation; only enum
  // string-coerces them (below). A non-string object in a plain `Select` means the
  // input is really a select-object we must not mangle via String() (D4).
  const rawValues = Array.isArray(input.values) ? input.values : undefined
  const stringValues = rawValues?.map(String)
  const hasEnumValues = Boolean(stringValues?.length || hydrated?.enumOptions?.length)
  const hasObjectValues = Boolean(rawValues?.some((value) => value !== null && typeof value === 'object'))

  const obligation: ProfileObligation =
    input.required || ctx.required.has(valueName)
      ? 'MUST'
      : ctx.recommended.has(valueName)
        ? 'SHOULD'
        : 'MAY'

  const kind = classTokens.length
    ? 'entity'
    : kindFromTokens(typeTokens, multiple, hydrated, hasEnumValues, hasObjectValues)
  const rule: ProfilePropertyRule = {
    id: valueName,
    label: typeof input.label === 'string' && input.label ? input.label : hydrated?.label || valueName,
    description: typeof input.help === 'string' ? input.help : hydrated?.description || '',
    kind,
    propertyUri,
    valueName,
    obligation,
  }

  if (kind === 'entity') {
    rule.entityTypes = classTokens.map((token) => resolveClassUri(token, ctx.context))
    // Absent `multiple` means single (matches the documented default + scalars).
    rule.multipleValues = Boolean(input.multiple)
    // Entity-source policy, list cardinality and required instances have no
    // mode-file vocabulary; they ride on the schema and rehydrate from the
    // hydrated carrier.
    if (hydrated?.entitySources) rule.entitySources = hydrated.entitySources
    if (hydrated?.minItems !== undefined) rule.minItems = hydrated.minItems
    if (hydrated?.maxItems !== undefined) rule.maxItems = hydrated.maxItems
    if (hydrated?.requiredInstances?.length) rule.requiredInstances = hydrated.requiredInstances
    return rule
  }

  if (kind === 'select-url' || kind === 'select-object') {
    // Raw options preserved verbatim (never String()-coerced); internal only.
    rule.valueOptions = rawValues ?? []
    if (multiple) rule.multipleValues = true
    // List cardinality, default and example ride on the schema (the mode input
    // can't carry them), so they must rehydrate here too: the early return above
    // otherwise skips the scalar hydration block below and drops them (C1: a
    // multi-valued select-url loses minItems/maxItems on import). Only-when-set to
    // preserve byte-stability, matching the entity branch.
    if (hydrated?.minItems !== undefined) rule.minItems = hydrated.minItems
    if (hydrated?.maxItems !== undefined) rule.maxItems = hydrated.maxItems
    if (hydrated?.defaultValue !== undefined) rule.defaultValue = hydrated.defaultValue
    if (hydrated?.example !== undefined) rule.example = hydrated.example
    return rule
  }

  // Scalar constraints + enum/default/example are authored in the schema.
  if (hydrated) {
    rule.pattern = hydrated.pattern
    rule.minLength = hydrated.minLength
    rule.maxLength = hydrated.maxLength
    rule.minValue = hydrated.minValue
    rule.maxValue = hydrated.maxValue
    rule.stepValue = hydrated.stepValue
    rule.defaultValue = hydrated.defaultValue
    rule.example = hydrated.example
    // List cardinality lives on the schema array, not the mode input.
    rule.minItems = hydrated.minItems
    rule.maxItems = hydrated.maxItems
  }
  if (kind === 'enum') rule.enumOptions = stringValues?.length ? stringValues : hydrated?.enumOptions ?? []
  if (multiple) rule.multipleValues = true
  return rule
}

function kindFromTokens(
  tokens: string[],
  multiple: boolean,
  hydrated: ProfilePropertyRule | undefined,
  hasEnumValues: boolean,
  hasObjectValues: boolean,
): ProfileValueKind {
  const token = tokens[0] ?? 'Text'
  switch (token) {
    case 'Select':
      // A plain `Select` whose values are non-string objects is really a
      // select-object; keep it as such rather than String()-mangling the objects.
      // Otherwise a Select with allowed string values is an enum; a Select with no
      // values can never validate as one, so import it as plain text.
      if (hasObjectValues) return 'select-object'
      return hasEnumValues ? 'enum' : 'text'
    case 'SelectObject':
      return 'select-object'
    case 'SelectURL':
      return 'select-url'
    case 'TextArea':
      return 'longtext'
    case 'Date':
      return 'date'
    case 'DateTime':
    case 'Time':
      return 'datetime'
    case 'Number':
      return hydrated?.kind === 'integer' ? 'integer' : 'number'
    case 'Boolean':
      return 'boolean'
    case 'URL':
      return 'url'
    case 'Text':
    case 'Value':
    case 'ANY':
    default:
      if (hydrated?.kind === 'email') return 'email'
      // L11: a multi-valued Text round-trips as a keyword-list by design; the mode
      // format has no `Text`+`multiple` token distinct from a keyword list, so the
      // two are indistinguishable on import. Accepted limitation.
      return multiple ? 'keyword-list' : 'text'
  }
}

// Class-name -> type-URI mappings and compact property term mappings, so the mode
// file is self-describing and non-schema.org types round-trip. Class mappings key
// on the canonical `className` (D3) so an imported alias is preserved. Class
// mappings are written first and take precedence; the builder guarantees
// className (`^[A-Z]…`) and valueName (`^[a-z]…`, see uri.ts D2 helpers) never
// collide, so the merged term set is unambiguous.
function buildModeContext(entities: ProfileEntityRule[]): Record<string, string> | undefined {
  const context: Record<string, string> = {}
  for (const entity of entities) {
    const className = entity.className || classNameForType(entity.type)
    if (entity.type) context[className] = entity.type
    for (const rule of entity.propertyRules) {
      if (rule.valueName && rule.propertyUri) context[rule.valueName] = rule.propertyUri
    }
  }
  // M1: an entity-reference property may target a type that has NO entity rule.
  // Its `type` token (termNameFromUri) then has no class mapping, so on reparse it
  // could not resolve back to the URI. Map those ruleless targets too. schema.org
  // targets resolve via the base context (and a bare `Person` token round-trips to
  // http://schema.org/Person), so only non-schema.org ones need an entry; skip any
  // token already claimed by a class or property mapping to avoid clobbering it.
  for (const entity of entities) {
    for (const rule of entity.propertyRules) {
      if (rule.kind !== 'entity') continue
      for (const target of rule.entityTypes ?? []) {
        if (!target || isSchemaOrgType(target)) continue
        if (entities.some((candidate) => sameSchemaOrgType(candidate.type, target))) continue
        const token = termNameFromUri(target)
        if (context[token]) continue
        context[token] = target
      }
    }
  }
  return Object.keys(context).length ? context : undefined
}

// A schema.org type URI (http or https). Inlined here (not imported from
// propertyCatalog) to keep mode.ts free of a UI-catalogue dependency.
function isSchemaOrgType(uri: string): boolean {
  return uri.startsWith('http://schema.org/') || uri.startsWith('https://schema.org/')
}

// Flatten a mode `context` (string URL, object, or array of those) into a term ->
// URI lookup used to resolve class names and property terms.
function contextLookup(context: unknown): Record<string, string> {
  const lookup: Record<string, string> = {}
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit)
    else if (isRecord(value)) {
      for (const [key, entry] of Object.entries(value)) {
        if (typeof entry === 'string') lookup[key] = entry
        else if (isRecord(entry) && typeof entry['@id'] === 'string') lookup[key] = entry['@id'] as string
      }
    }
  }
  visit(context)
  return lookup
}

function resolveClassUri(className: string, context: Record<string, string>): string {
  const mapped = context[className]
  if (typeof mapped === 'string' && mapped) return mapped
  if (className.startsWith('http://') || className.startsWith('https://')) return className
  return `${SCHEMA}${className}`
}

function classNameForType(type: string): string {
  if (!type) return 'Thing'
  return termNameFromUri(type)
}
