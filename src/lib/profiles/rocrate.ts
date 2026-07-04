import { parseSchemaText, propertyRulesFromSchema, schemaFromEntityRules } from './schema'
import {
  DX_HAS_ARTIFACT,
  DX_HAS_RESOURCE,
  DX_HAS_ROLE,
  DX_PROFILE,
  DX_RESOURCE_DESCRIPTOR,
  DX_ROLE_SPECIFICATION,
  DX_ROLE_VALIDATION,
  JSON_SCHEMA_DRAFT_2020_12,
  RO_CRATE_PROFILE,
  type JsonSchema,
  type JsonSchemaProperty,
  type ProfileBasics,
  type ProfileEntityRule,
  type ProfilePropertyRule,
  type ProfileValueKind,
  type ProfileObligation,
  type ParsedProfileCrate,
} from './types'

export interface BuildProfileCrateInput extends ProfileBasics {
  entityRules: ProfileEntityRule[]
}

export function buildProfileCrate(input: BuildProfileCrateInput): Record<string, unknown> {
  const entities = normalizeEntityRules(input.entityRules)
  const rules = entities.flatMap((entity) => entity.propertyRules)
  const schema = schemaFromEntityRules(input, entities)
  const ruleEntities = entities.flatMap((entity) => [
    entityRuleEntity(entity),
    ...entity.propertyRules.map((rule) => propertyRuleEntity(rule, entity)),
  ])
  const enumEntities = rules.flatMap(enumTermEntities)

  return {
    '@context': 'https://w3id.org/ro/crate/1.2/context',
    '@graph': [
      {
        '@id': 'ro-crate-metadata.json',
        '@type': 'CreativeWork',
        conformsTo: { '@id': RO_CRATE_PROFILE },
        about: { '@id': './' },
      },
      {
        '@id': './',
        '@type': ['Dataset', DX_PROFILE],
        name: input.name,
        description: input.description,
        datePublished: input.datePublished,
        license: { '@id': input.license },
        version: input.version || undefined,
        isProfileOf: { '@id': RO_CRATE_PROFILE },
        hasPart: [
          { '@id': 'profile.html' },
          { '@id': 'schema.json' },
          ...entities.map((entity) => ({ '@id': entityRuleId(entity) })),
          ...rules.map((rule) => ({ '@id': propertyRuleEntityId(rule) })),
        ],
        [DX_HAS_RESOURCE]: [
          { '@id': '#schema-resource' },
          { '@id': '#profile-description-resource' },
        ],
      },
      {
        '@id': 'profile.html',
        '@type': 'File',
        name: `${input.name} Profile Description`,
        encodingFormat: 'text/html',
        about: { '@id': './' },
        text: profileHtml(input, entities),
      },
      {
        '@id': 'schema.json',
        '@type': 'File',
        name: `${input.name} JSON Schema`,
        encodingFormat: 'application/schema+json',
        conformsTo: { '@id': JSON_SCHEMA_DRAFT_2020_12 },
        text: JSON.stringify(schema, null, 2),
      },
      {
        '@id': '#schema-resource',
        '@type': DX_RESOURCE_DESCRIPTOR,
        [DX_HAS_ROLE]: { '@id': DX_ROLE_VALIDATION },
        [DX_HAS_ARTIFACT]: { '@id': 'schema.json' },
      },
      {
        '@id': '#profile-description-resource',
        '@type': DX_RESOURCE_DESCRIPTOR,
        [DX_HAS_ROLE]: { '@id': DX_ROLE_SPECIFICATION },
        [DX_HAS_ARTIFACT]: { '@id': 'profile.html' },
      },
      ...ruleEntities,
      ...enumEntities,
    ],
  }
}

export function parseProfileCrate(rocrate: unknown): ParsedProfileCrate {
  const entries = graph(rocrate)
  const root = profileRoot(entries)
  const schema = extractProfileSchema(rocrate)
  const entityRules = root ? entityRulesFromProfileRoot(entries, root, schema) : []
  const structuredRules = entityRules.find((entity) => isDatasetType(entity.type))?.propertyRules ?? []
  const legacyRules = root ? propertyRulesFromProfileRoot(entries, root, schema) : []
  const datasetPropertyRules = structuredRules.length
    ? structuredRules
    : legacyRules.length
      ? legacyRules
      : propertyRulesFromSchema(schema)
  return {
    name: textValue(root?.name) || schema?.title || '',
    description: textValue(root?.description) || schema?.description || '',
    version: textValue(root?.version) || undefined,
    datePublished: textValue(root?.datePublished) || undefined,
    license: idValue(root?.license) || textValue(root?.license) || undefined,
    schema,
    datasetPropertyRules,
    entityRules,
  }
}

export function extractProfileSchema(rocrate: unknown): JsonSchema | undefined {
  const entries = graph(rocrate)
  const root = profileRoot(entries)
  const resourceRefs = idValues(root?.[DX_HAS_RESOURCE] ?? root?.hasResource)
  for (const resourceRef of resourceRefs) {
    const descriptor = entityById(entries, resourceRef)
    const roles = idValues(descriptor?.[DX_HAS_ROLE] ?? descriptor?.hasRole)
    const isValidator = roles.some((role) => role.includes('/validation') || role.includes('/schema'))
    if (!isValidator) continue
    const artifactRef = idValues(descriptor?.[DX_HAS_ARTIFACT] ?? descriptor?.hasArtifact)[0]
    const artifact = artifactRef ? entityById(entries, artifactRef) : undefined
    const schema = parseSchemaText(artifact?.text)
    if (schema) return schema
  }

  const schemaEntity = entries.find((entry) => {
    const encoding = textValue(entry.encodingFormat)
    return encoding.includes('application/schema+json') || encoding.includes('schema+json') || idMatches(entry['@id'], '#validator')
  })
  return parseSchemaText(schemaEntity?.text)
}

function normalizeEntityRules(entityRules: ProfileEntityRule[]): ProfileEntityRule[] {
  return entityRules.map((entity, entityIndex) => {
    const id = safeIdSegment(entity.id || entity.label || `entity-${entityIndex + 1}`)
    return {
      ...entity,
      id,
      type: normalizeType(entity.type || 'Dataset'),
      obligation: entity.obligation ?? 'MAY',
      position: entity.position ?? entityIndex + 1,
      propertyRules: entity.propertyRules.map((rule, ruleIndex) => normalizePropertyRule(rule, { id }, ruleIndex)),
    }
  })
}

function normalizePropertyRule(
  rule: ProfilePropertyRule,
  entity: Pick<ProfileEntityRule, 'id'>,
  index: number,
): ProfilePropertyRule {
  const obligation = rule.obligation ?? 'MAY'
  return {
    ...rule,
    id: safeIdSegment(rule.id || rule.valueName || rule.label || `property-${index + 1}`),
    valueName: rule.valueName || safeIdSegment(rule.id || rule.label),
    obligation,
    entityId: entity.id,
    position: rule.position ?? index + 1,
  }
}

function entityRuleEntity(entity: ProfileEntityRule): Record<string, unknown> {
  return {
    '@id': entityRuleId(entity),
    '@type': 'PropertyValueSpecification',
    name: entity.label,
    description: entity.description || undefined,
    valueName: entity.exampleId || entity.id,
    valueRequired: entity.obligation === 'MUST',
    rangeIncludes: { '@id': normalizeType(entity.type) },
    position: entity.position,
    additionalType: { '@id': obligationUri(entity.obligation) },
    // Entity rules always carry `hasPart` (even when empty) so the parser can
    // discriminate them from property rules: entity rule = PVS with a hasPart
    // key and no `about`; property rule = PVS without hasPart.
    hasPart: entity.propertyRules.map((rule) => ({ '@id': propertyRuleEntityId(rule) })),
  }
}

function propertyRuleEntity(rule: ProfilePropertyRule, parentEntity?: ProfileEntityRule): Record<string, unknown> {
  const entity: Record<string, unknown> = {
    '@id': propertyRuleEntityId(rule),
    '@type': 'PropertyValueSpecification',
    name: rule.label,
    description: rule.description || undefined,
    valueName: rule.valueName,
    valueRequired: rule.obligation === 'MUST',
    position: rule.position,
    additionalType: { '@id': obligationUri(rule.obligation) },
    rangeIncludes: { '@id': rangeForValueKind(rule.kind) },
  }
  if (parentEntity) entity.about = { '@id': entityRuleId(parentEntity) }
  if (rule.defaultValue) entity.defaultValue = rule.defaultValue
  if (rule.example) entity.example = rule.example
  if (rule.pattern) entity.valuePattern = rule.pattern
  if (rule.minLength !== undefined) entity.valueMinLength = rule.minLength
  if (rule.maxLength !== undefined) entity.valueMaxLength = rule.maxLength
  if (rule.minValue !== undefined) entity.minValue = rule.minValue
  if (rule.maxValue !== undefined) entity.maxValue = rule.maxValue
  if (rule.stepValue !== undefined) entity.stepValue = rule.stepValue
  if (rule.multipleValues || rule.kind === 'keyword-list' || rule.kind === 'person-list') entity.multipleValues = true
  if (rule.kind === 'enum') entity.valueReference = { '@id': enumTermSetId(rule) }
  return entity
}

function enumTermEntities(rule: ProfilePropertyRule): Record<string, unknown>[] {
  if (rule.kind !== 'enum' || !rule.enumOptions?.length) return []
  const termSetId = enumTermSetId(rule)
  const terms = rule.enumOptions.map((option) => ({
    '@id': enumTermId(rule, option),
    '@type': 'DefinedTerm',
    name: option,
    termCode: option,
  }))
  return [
    {
      '@id': termSetId,
      '@type': 'DefinedTermSet',
      name: `${rule.label} Options`,
      hasDefinedTerm: terms.map((term) => ({ '@id': term['@id'] })),
    },
    ...terms,
  ]
}

function propertyRulesFromProfileRoot(
  entries: Array<Record<string, unknown>>,
  root: Record<string, unknown>,
  schema: JsonSchema | undefined,
): ProfilePropertyRule[] {
  const hasPartRefs = idValues(root.hasPart)
  const candidates = hasPartRefs.length
    ? hasPartRefs.map((id) => entityById(entries, id)).filter(isRecord)
    : entries
  return candidates
    // Legacy flat rules are `#field-*` PVS entities with neither `hasPart` (that
    // marks an entity rule) nor `about` (that links a structured property rule to
    // its owning entity). Excluding `about`-linked rules prevents another
    // entity's property rules (e.g. Person's) from being misattributed to the
    // root Dataset when the Dataset itself contributes no structured rules.
    .filter((entity) => typeContains(entity, 'PropertyValueSpecification') && !hasOwnKey(entity, 'hasPart') && !idValues(entity.about).length)
    .sort(ruleSort)
    .map((entity, index) => propertyRuleFromEntity(entity, entries, schema, index))
}

function entityRulesFromProfileRoot(
  entries: Array<Record<string, unknown>>,
  root: Record<string, unknown>,
  schema: JsonSchema | undefined,
): ProfileEntityRule[] {
  const hasPartRefs = idValues(root.hasPart)
  const candidates = hasPartRefs.length
    ? hasPartRefs.map((id) => entityById(entries, id)).filter(isRecord)
    : entries
  return candidates
    .filter((entity) => typeContains(entity, 'PropertyValueSpecification') && hasOwnKey(entity, 'hasPart') && !idValues(entity.about).length)
    .sort(ruleSort)
    .map((entity, index) => entityRuleFromEntity(entity, entries, schema, index))
}

function entityRuleFromEntity(
  entity: Record<string, unknown>,
  entries: Array<Record<string, unknown>>,
  schema: JsonSchema | undefined,
  index: number,
): ProfileEntityRule {
  const id = entityIdFromRule(entity, `entity-${index + 1}`)
  const type = idValue(entity.rangeIncludes) || 'http://schema.org/Thing'
  // The generated JSON Schema describes the Dataset entity only, so it must not
  // be consulted for other entities' property rules — otherwise e.g. Person's
  // `name` would inherit the Dataset `name` rule's kind/pattern/defaults.
  const propertySchema = isDatasetType(type) ? schema : undefined
  const propertyRefs = idValues(entity.hasPart)
  const propertyRules = propertyRefs
    .map((ref) => entityById(entries, ref))
    .filter(isRecord)
    .filter((property) => typeContains(property, 'PropertyValueSpecification'))
    .sort(ruleSort)
    .map((property, propertyIndex) => propertyRuleFromEntity(property, entries, propertySchema, propertyIndex, id))

  // Only surface an example @id when the crate actually carried a distinct one;
  // the builder writes `valueName = exampleId || id`, so a valueName equal to
  // the rule id means no example was authored.
  const rawExampleId = textValue(entity.valueName)
  return {
    id,
    label: textValue(entity.name) || id,
    description: textValue(entity.description) || '',
    type,
    obligation: obligationFromEntity(entity),
    exampleId: rawExampleId && rawExampleId !== id ? rawExampleId : undefined,
    position: numberValue(entity.position) ?? index + 1,
    propertyRules,
  }
}

function propertyRuleFromEntity(
  entity: Record<string, unknown>,
  entries: Array<Record<string, unknown>>,
  schema: JsonSchema | undefined,
  index: number,
  parentEntityId?: string,
): ProfilePropertyRule {
  const valueName = textValue(entity.valueName) || safeIdSegment(textValue(entity.name) || `field-${index + 1}`)
  const property = schema?.properties?.[valueName]
  const schemaRule = propertyRulesFromSchema(schema).find((rule) => rule.valueName === valueName)
  const enumOptions = enumOptionsFromEntity(entity, entries, property?.enum ?? property?.items?.enum)
  const kind = schemaRule?.kind ?? valueKindFromEntity(entity, property, enumOptions)
  return {
    id: propertyRuleIdFromEntity(entity, valueName, parentEntityId),
    label: textValue(entity.name) || property?.title || valueName,
    description: textValue(entity.description) || property?.description || '',
    kind,
    valueName,
    obligation: obligationFromEntity(entity),
    entityId: parentEntityId,
    defaultValue: textValue(entity.defaultValue) || schemaRule?.defaultValue,
    example: textValue(entity.example) || schemaRule?.example,
    enumOptions,
    pattern: textValue(entity.valuePattern) || property?.pattern,
    minLength: numberValue(entity.valueMinLength) ?? property?.minLength,
    maxLength: numberValue(entity.valueMaxLength) ?? property?.maxLength,
    minValue: numberValue(entity.minValue) ?? property?.minimum,
    maxValue: numberValue(entity.maxValue) ?? property?.maximum,
    stepValue: numberValue(entity.stepValue) ?? property?.multipleOf,
    multipleValues: boolValue(entity.multipleValues) ?? property?.type === 'array',
    position: numberValue(entity.position) ?? index + 1,
  }
}

function profileRoot(entries: Array<Record<string, unknown>>): Record<string, unknown> | undefined {
  const metadata = entries.find((entry) => idMatches(entry['@id'], 'ro-crate-metadata.json'))
  const about = idValues(metadata?.about)[0]
  if (about) {
    const root = entityById(entries, about)
    if (root) return root
  }
  return entries.find((entry) => typeContains(entry, DX_PROFILE) && typeContains(entry, 'Dataset'))
    ?? entries.find((entry) => idMatches(entry['@id'], './') && typeContains(entry, 'Dataset'))
    ?? entries.find((entry) => typeContains(entry, 'Dataset'))
}

function rangeForValueKind(kind: ProfileValueKind): string {
  switch (kind) {
    case 'integer':
      return 'http://schema.org/Integer'
    case 'number':
      return 'http://schema.org/Number'
    case 'boolean':
      return 'http://schema.org/Boolean'
    case 'date':
      return 'http://schema.org/Date'
    case 'datetime':
      return 'http://schema.org/DateTime'
    case 'url':
    case 'license':
      return 'http://schema.org/URL'
    case 'file-reference':
      return 'http://schema.org/MediaObject'
    case 'person-list':
      // Multi-valued person references. Paired with multipleValues:true on the
      // crate entity; the read side maps Person(+multipleValues) -> person-list.
      return 'http://schema.org/Person'
    case 'enum':
      return 'http://schema.org/DefinedTerm'
    default:
      return 'http://schema.org/Text'
  }
}

function normalizeType(type: string): string {
  if (!type) return 'http://schema.org/Thing'
  if (type.startsWith('http://') || type.startsWith('https://')) return type
  return `http://schema.org/${type}`
}

function isDatasetType(type: string): boolean {
  return type === 'Dataset' || type.endsWith('/Dataset')
}

function obligationUri(obligation: ProfileObligation): string {
  return `https://www.rfc-editor.org/rfc/rfc2119#${obligation}`
}

function obligationFromEntity(entity: Record<string, unknown>): ProfileObligation {
  const type = idValues(entity.additionalType).find((value) => value.includes('rfc2119#'))
  if (type?.endsWith('#MUST')) return 'MUST'
  if (type?.endsWith('#SHOULD')) return 'SHOULD'
  if (type?.endsWith('#MAY')) return 'MAY'
  return boolValue(entity.valueRequired) ? 'MUST' : 'MAY'
}

function valueKindFromEntity(
  entity: Record<string, unknown>,
  property: JsonSchemaProperty | undefined,
  enumOptions?: string[],
): ProfileValueKind {
  if (enumOptions?.length) return 'enum'
  const range = idValues(entity.rangeIncludes)[0]?.replace('https://schema.org/', 'http://schema.org/')
  if (property?.format === 'email') return 'email'
  if (range === 'http://schema.org/Integer') return 'integer'
  if (range === 'http://schema.org/Number') return 'number'
  if (range === 'http://schema.org/Boolean') return 'boolean'
  if (range === 'http://schema.org/Date') return 'date'
  if (range === 'http://schema.org/DateTime') return 'datetime'
  if (range === 'http://schema.org/URL') return 'url'
  if (range === 'http://schema.org/MediaObject') return 'file-reference'
  if (range === 'http://schema.org/Person') return boolValue(entity.multipleValues) ? 'person-list' : 'text'
  if (boolValue(entity.multipleValues)) return 'keyword-list'
  return property?.['x-aruna-control'] === 'textarea' ? 'longtext' : 'text'
}

function enumOptionsFromEntity(
  entity: Record<string, unknown>,
  entries: Array<Record<string, unknown>>,
  schemaEnum?: string[],
): string[] | undefined {
  if (schemaEnum?.length) return schemaEnum
  const termSetRef = idValues(entity.valueReference)[0]
  const termSet = termSetRef ? entityById(entries, termSetRef) : undefined
  const termRefs = idValues(termSet?.hasDefinedTerm)
  const options = termRefs
    .map((ref) => entityById(entries, ref))
    .map((term) => textValue(term?.termCode) || textValue(term?.name))
    .filter(Boolean)
  return options.length ? options : undefined
}

function profileHtml(profile: ProfileBasics, entities: ProfileEntityRule[]): string {
  const items = entities
    .map((entity) => {
      const properties = entity.propertyRules
        .map((rule) => `<li><strong>${escapeHtml(rule.label)}</strong> (${rule.obligation} ${escapeHtml(rule.valueName)}): ${escapeHtml(rule.description)}</li>`)
        .join('')
      return `<li><strong>${escapeHtml(entity.label)}</strong> (${entity.obligation} ${escapeHtml(entity.type)})<ul>${properties}</ul></li>`
    })
    .join('')
  return `<h1>${escapeHtml(profile.name)}</h1><p>${escapeHtml(profile.description)}</p><h2>RO-Crate rules</h2><ul>${items}</ul>`
}

function propertyRuleEntityId(rule: ProfilePropertyRule): string {
  const entityPrefix = rule.entityId ? `entity-${safeIdSegment(rule.entityId)}-property-` : 'field-'
  return `#${entityPrefix}${safeIdSegment(rule.id || rule.valueName || rule.label)}`
}

function entityRuleId(entity: Pick<ProfileEntityRule, 'id'>): string {
  return `#entity-${safeIdSegment(entity.id)}`
}

function enumTermSetId(rule: ProfilePropertyRule): string {
  const prefix = rule.entityId ? `${safeIdSegment(rule.entityId)}-` : ''
  return `#${prefix}${safeIdSegment(rule.id || rule.valueName)}-terms`
}

function enumTermId(rule: ProfilePropertyRule, option: string): string {
  const prefix = rule.entityId ? `${safeIdSegment(rule.entityId)}-` : ''
  return `#${prefix}${safeIdSegment(rule.id || rule.valueName)}-${safeIdSegment(option)}`
}

export function safeIdSegment(value: string): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'field'
}

function graph(value: unknown): Array<Record<string, unknown>> {
  if (!isRecord(value)) return []
  const graphValue = value['@graph']
  return Array.isArray(graphValue) ? graphValue.filter(isRecord) : []
}

function entityById(entries: Array<Record<string, unknown>>, id: string): Record<string, unknown> | undefined {
  return entries.find((entry) => idMatches(entry['@id'], id))
}

function idMatches(value: unknown, id: string): boolean {
  if (typeof value !== 'string') return false
  return value === id || value.endsWith(id)
}

function typeContains(entity: Record<string, unknown>, expected: string): boolean {
  return idValues(entity['@type']).some((type) => type === expected || type.endsWith(expected))
}

function hasOwnKey(entity: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(entity, key)
}

function idValues(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(idValues)
  if (isRecord(value)) return idValues(value['@id'] ?? value.id ?? value.name)
  return []
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return textValue(value[0])
  if (isRecord(value)) return textValue(value['@value'] ?? value.name ?? value['@id'] ?? value.id)
  return ''
}

function idValue(value: unknown): string {
  return idValues(value)[0] ?? ''
}

function boolValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) return boolValue(value[0])
  if (isRecord(value)) return boolValue(value['@value'])
  return undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  if (Array.isArray(value)) return numberValue(value[0])
  if (isRecord(value)) return numberValue(value['@value'])
  return undefined
}

function ruleSort(left: Record<string, unknown>, right: Record<string, unknown>) {
  return (numberValue(left.position) ?? Number.MAX_SAFE_INTEGER) - (numberValue(right.position) ?? Number.MAX_SAFE_INTEGER)
    || textValue(left.name).localeCompare(textValue(right.name))
    || textValue(left['@id']).localeCompare(textValue(right['@id']))
}

function propertyRuleIdFromEntity(entity: Record<string, unknown>, fallback: string, parentEntityId?: string): string {
  const id = textValue(entity['@id'])
  // When the owning entity is known, strip the exact serializer prefix so a rule
  // id that itself contains "-property-" round-trips intact (the heuristic below
  // would otherwise keep only its last segment).
  if (parentEntityId) {
    const prefix = `#entity-${safeIdSegment(parentEntityId)}-property-`
    const at = id.indexOf(prefix)
    if (at >= 0) return id.slice(at + prefix.length) || fallback
  }
  if (id.includes('-property-')) return id.split('-property-').pop() || fallback
  return id.replace(/^.*#field-/, '').replace(/^.*#/, '') || fallback
}

function entityIdFromRule(entity: Record<string, unknown>, fallback: string): string {
  const id = textValue(entity['@id'])
  return id.replace(/^.*#entity-/, '').replace(/^.*#/, '') || fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
