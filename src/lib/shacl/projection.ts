import { CRATE_BASE_IRI } from './crateIri'
import { effectiveEntitySources } from '../profiles/sources'
import { stringOptions } from '../profiles/schema'
import { ARUNA_PROFILE_PREFIX, isDatasetType, normalizeTypeUri, sameSchemaOrgType, termNameFromUri } from '../profiles/uri'
import type { ProfileBasics, ProfileEntityRule, ProfilePropertyRule } from '../profiles/types'

// SHACL projection of the profile rule model (plan section 7): emits shapes.ttl
// as deterministic Turtle via plain string emission, deliberately NOT the N3
// writer, so this module can be imported by the synchronous profile-crate
// emitter (rocrate.ts, main bundle) while the n3 parser stays in the lazy lift
// chunk. The Turtle syntax is exercised against a real parser by the lift
// round-trip, so drift cannot go unnoticed.

export const SH = 'http://www.w3.org/ns/shacl#'
export const XSD = 'http://www.w3.org/2001/XMLSchema#'
const SCHEMA = 'http://schema.org/'

export { CRATE_BASE_IRI }

// Kind-derived value patterns, matched to the bespoke validator (validate.ts in
// lib/profiles) so both lines of validation agree. Exported for lift.ts, which
// maps them back to their value kinds.
export const EMAIL_PATTERN = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$'
export const URL_PATTERN = '^[A-Za-z][A-Za-z0-9+.-]*:'
export const DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$'
export const DATETIME_PATTERN = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}'

// Deviations from the plan-section-7 table, settled against what the dataset
// emitter actually serializes (the table itself flags url/select-url as
// provisional, "settle against fixtures"):
// - url / select-url: profile url controls flow through normalizeProfileValues
//   as plain JSON strings (only entity references, select-object choices and
//   the built-in license become {"@id"}) and the RO-Crate context does not
//   @id-coerce them, so their RDF form is a STRING LITERAL. Hence
//   xsd:string + URL_PATTERN (and sh:in over the allowed strings for
//   select-url), never sh:nodeKind sh:IRI.
// - date / datetime: emitted as plain strings and the context does not type
//   them, so xsd:date/xsd:dateTime would flag every valid value; instead
//   xsd:string + DATE_PATTERN / DATETIME_PATTERN (the bespoke formats).
// - number: JSON-LD serializes integral JSON numbers as xsd:integer and only
//   non-integral ones as xsd:double, so a plain xsd:double datatype would flag
//   a legitimate value like 2; instead sh:or ( xsd:double xsd:integer ),
//   special-cased by lift.ts.
// - minItems on SHOULD/MAY rules: bespoke semantics are "only a NON-EMPTY
//   list must reach minItems" (blocking), while the empty list is left to the
//   presence check (warning or nothing). Plain sh:minCount cannot express
//   that, so such rules add a standalone node shape with
//   sh:or ( [ maxCount 0 ] [ minCount N ] ) at Violation severity. MUST rules
//   keep the plain presence sh:minCount (missing is blocking anyway).

export function shapesFromEntityRules(
  basics: Pick<ProfileBasics, 'slug' | 'name'>,
  entities: ProfileEntityRule[],
): string {
  const ns = `${ARUNA_PROFILE_PREFIX}${fragmentSafe(basics.slug || 'profile')}#`
  const normalized = entities.map((entity) => ({
    ...entity,
    type: normalizeTypeUri(entity.type || 'Dataset'),
    className: entity.className || termNameFromUri(normalizeTypeUri(entity.type || 'Dataset')),
  }))
  const root = normalized.find((entity) => isDatasetType(entity.type))

  const blocks: string[] = []
  let needsBase = false

  for (const entity of normalized) {
    const shapeIri = `${ns}shape-${fragmentSafe(entity.className)}`
    const propertyShapes: Array<{ iri: string; lines: string[] }> = []
    const standaloneShapes: Array<{ iri: string; lines: string[] }> = []

    entity.propertyRules.forEach((rule, index) => {
      if (!rule.propertyUri) return
      const built = buildRuleShapes(rule, index, entity, ns, normalized, entity === root)
      needsBase = needsBase || built.needsBase
      propertyShapes.push(...built.shapes)
      standaloneShapes.push(...built.standaloneShapes)
    })

    const nodeLines: string[] = [`${iri(shapeIri)} a sh:NodeShape`]
    if (entity !== root) nodeLines.push(`  sh:targetClass ${iri(entity.type)}`)
    // The root Dataset shape carries NO static target: crate roots have
    // crate-local ids and class targeting would also hit non-root Datasets, so
    // the validator binds sh:targetNode <crate root> at runtime (plan section 7).
    if (propertyShapes.length) {
      nodeLines.push(`  sh:property ${propertyShapes.map((shape) => iri(shape.iri)).join(', ')}`)
    }
    blocks.push(`${nodeLines.join(' ;\n')} .`)
    for (const shape of propertyShapes) blocks.push(`${shape.lines.join(' ;\n')} .`)
    for (const shape of standaloneShapes) blocks.push(`${shape.lines.join(' ;\n')} .`)
  }

  const header: string[] = [
    `# SHACL shapes generated from the profile "${basics.name || basics.slug}". Do not edit;`,
    '# regenerate through the profile builder. Presence and value constraints are split',
    '# so MUST missing = Violation, SHOULD missing = Warning, invalid-if-present = Violation.',
    '@prefix sh: <http://www.w3.org/ns/shacl#> .',
    '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
    '@prefix schema: <http://schema.org/> .',
  ]
  // Only crate-local required-instance ids need the base; keep the header
  // byte-stable for every profile that has none.
  if (needsBase) header.push(`@base <${CRATE_BASE_IRI}> .`)

  return `${header.join('\n')}\n\n${blocks.join('\n\n')}\n`
}

interface BuiltShapes {
  shapes: Array<{ iri: string; lines: string[] }>
  // Standalone node shapes (own target, not sh:property members) carrying
  // constraints that only work at node level (the entry-count sh:or).
  standaloneShapes: Array<{ iri: string; lines: string[] }>
  needsBase: boolean
}

function buildRuleShapes(
  rule: ProfilePropertyRule,
  order: number,
  entity: ProfileEntityRule,
  ns: string,
  entities: ProfileEntityRule[],
  isRoot: boolean,
): BuiltShapes {
  const shapes: Array<{ iri: string; lines: string[] }> = []
  const standaloneShapes: Array<{ iri: string; lines: string[] }> = []
  let needsBase = false
  const baseIri = `${ns}shape-${fragmentSafe(entity.className)}-${fragmentSafe(rule.valueName || rule.id)}`
  const path = `sh:path ${iri(rule.propertyUri)}`
  const meta = metaLines(rule, order)
  const multiple = rule.kind === 'keyword-list' || Boolean(rule.multipleValues)

  // Presence shape: MUST -> sh:minCount (default severity Violation); SHOULD ->
  // sh:minCount + sh:severity sh:Warning; MAY -> none.
  if (rule.obligation === 'MUST' || rule.obligation === 'SHOULD') {
    const minCount = rule.obligation === 'MUST' && multiple && rule.minItems !== undefined ? Math.max(1, rule.minItems) : 1
    const lines = [`${iri(`${baseIri}-presence`)} a sh:PropertyShape`, `  ${path}`, ...meta, `  sh:minCount ${minCount}`]
    if (rule.obligation === 'SHOULD') lines.push('  sh:severity sh:Warning')
    shapes.push({ iri: `${baseIri}-presence`, lines })
  }

  // SHOULD/MAY lists with minItems: "no entries or at least N" is blocking,
  // while the empty list stays a presence concern only. Node-level sh:or on a
  // standalone shape (own targetClass, or runtime root binding for the root).
  if (rule.obligation !== 'MUST' && multiple && rule.minItems !== undefined && rule.minItems > 1) {
    const shapeIri = `${baseIri}-entrycount`
    const lines = [`${iri(shapeIri)} a sh:NodeShape`]
    if (!isRoot) lines.push(`  sh:targetClass ${iri(entity.type)}`)
    lines.push(`  sh:or ( [ sh:property [ sh:path ${iri(rule.propertyUri)} ; sh:maxCount 0 ] ] [ sh:property [ sh:path ${iri(rule.propertyUri)} ; sh:minCount ${rule.minItems} ] ] )`)
    lines.push(`  sh:message ${literal(`Provide at least ${rule.minItems} ${rule.minItems === 1 ? 'entry' : 'entries'} for ${rule.label || rule.valueName}, or none.`)}`)
    standaloneShapes.push({ iri: shapeIri, lines })
  }

  // Value shape: constraints on values actually present, always Violation.
  const value = valueConstraintLines(rule, ns, entities)
  const valueLines = [`${iri(baseIri)} a sh:PropertyShape`, `  ${path}`, ...meta, ...value.lines]
  if (!multiple) valueLines.push('  sh:maxCount 1')
  else if (rule.maxItems !== undefined) valueLines.push(`  sh:maxCount ${rule.maxItems}`)
  if (valueLines.length > 2 + meta.length) shapes.push({ iri: baseIri, lines: valueLines })

  // Author pattern on a kind that already carries a derived pattern gets its own
  // shape (sh:pattern is single-valued per shape).
  if (value.extraPattern) {
    shapes.push({
      iri: `${baseIri}-pattern`,
      lines: [`${iri(`${baseIri}-pattern`)} a sh:PropertyShape`, `  ${path}`, ...meta, `  sh:pattern ${literal(value.extraPattern)}`],
    })
  }

  // Required instances (entity lists such as hasPart): by @id -> sh:hasValue;
  // by name -> a qualified value shape over schema:name. Severity follows the
  // bespoke validateRequiredInstances mapping: MUST -> Violation, SHOULD/MAY ->
  // Warning.
  const instances = (rule.requiredInstances ?? []).filter((instance) => instance.name || instance.id)
  instances.forEach((instance, index) => {
    const shapeIri = `${baseIri}-required-${index + 1}`
    const lines = [`${iri(shapeIri)} a sh:PropertyShape`, `  ${path}`, ...meta]
    if (instance.id) {
      // Crate-local ids stay relative and resolve against the @base header,
      // the same base the validator anchors the data graph under.
      if (!isAbsolute(instance.id)) needsBase = true
      lines.push(`  sh:hasValue ${iri(instance.id)}`)
      lines.push(`  sh:message ${literal(`Include the required entry with @id “${instance.id}”.`)}`)
    } else {
      lines.push(`  sh:qualifiedValueShape [ sh:property [ sh:path schema:name ; sh:hasValue ${literal(instance.name ?? '')} ] ]`)
      lines.push('  sh:qualifiedMinCount 1')
      lines.push(`  sh:message ${literal(`Include the required entry named “${instance.name ?? ''}”.`)}`)
    }
    if (rule.obligation !== 'MUST') lines.push('  sh:severity sh:Warning')
    shapes.push({ iri: shapeIri, lines })
  })

  return { shapes, standaloneShapes, needsBase }
}

interface ValueConstraints {
  lines: string[]
  extraPattern?: string
}

function valueConstraintLines(rule: ProfilePropertyRule, ns: string, entities: ProfileEntityRule[]): ValueConstraints {
  const lines: string[] = []
  let derivedPattern: string | undefined
  let stringLike = false
  let numeric = false

  switch (rule.kind) {
    case 'entity': {
      lines.push('  sh:nodeKind sh:IRI')
      const sources = effectiveEntitySources(rule.entitySources)
      // External reuse allowed: a bare reference carries no rdf:type in the
      // graph, so class/shape conformance is unprovable; nodeKind IRI only.
      if (!sources.includes('existing-external')) {
        const types = (rule.entityTypes ?? []).map(normalizeTypeUri).filter(Boolean)
        const branches = types.map((type) => classBranch(type, ns, entities))
        if (branches.length === 1) lines.push(...branches[0].map((line) => `  ${line}`))
        else if (branches.length > 1) {
          lines.push(`  sh:or ( ${branches.map((branch) => `[ ${branch.join(' ; ')} ]`).join(' ')} )`)
        }
      }
      return { lines }
    }
    case 'select-object':
      // Chosen options are emitted as contextual entities + {"@id"} references.
      lines.push('  sh:nodeKind sh:IRI')
      return { lines }
    case 'enum':
      lines.push(`  sh:in ( ${(rule.enumOptions ?? []).map(literal).join(' ')} )`)
      stringLike = true
      break
    case 'select-url': {
      const options = stringOptions(rule.valueOptions)
      if (options) lines.push(`  sh:in ( ${options.map(literal).join(' ')} )`)
      else {
        lines.push('  sh:datatype xsd:string')
        derivedPattern = URL_PATTERN
      }
      stringLike = true
      break
    }
    case 'url':
      lines.push('  sh:datatype xsd:string')
      derivedPattern = URL_PATTERN
      stringLike = true
      break
    case 'email':
      lines.push('  sh:datatype xsd:string')
      derivedPattern = EMAIL_PATTERN
      stringLike = true
      break
    case 'date':
      lines.push('  sh:datatype xsd:string')
      derivedPattern = DATE_PATTERN
      stringLike = true
      break
    case 'datetime':
      lines.push('  sh:datatype xsd:string')
      derivedPattern = DATETIME_PATTERN
      stringLike = true
      break
    case 'integer':
      lines.push('  sh:datatype xsd:integer')
      numeric = true
      break
    case 'number':
      lines.push('  sh:or ( [ sh:datatype xsd:double ] [ sh:datatype xsd:integer ] )')
      numeric = true
      break
    case 'boolean':
      lines.push('  sh:datatype xsd:boolean')
      break
    default:
      // text / longtext / keyword-list
      lines.push('  sh:datatype xsd:string')
      stringLike = true
      break
  }

  let extraPattern: string | undefined
  if (stringLike) {
    const authorPattern = rule.pattern?.trim()
    if (authorPattern && derivedPattern) {
      lines.push(`  sh:pattern ${literal(derivedPattern)}`)
      extraPattern = authorPattern
    } else if (authorPattern) {
      lines.push(`  sh:pattern ${literal(authorPattern)}`)
    } else if (derivedPattern) {
      lines.push(`  sh:pattern ${literal(derivedPattern)}`)
    }
    if (rule.minLength !== undefined) lines.push(`  sh:minLength ${Math.trunc(rule.minLength)}`)
    if (rule.maxLength !== undefined) lines.push(`  sh:maxLength ${Math.trunc(rule.maxLength)}`)
  }
  if (numeric) {
    if (rule.minValue !== undefined) lines.push(`  sh:minInclusive ${numberToken(rule.minValue)}`)
    if (rule.maxValue !== undefined) lines.push(`  sh:maxInclusive ${numberToken(rule.maxValue)}`)
  }
  return { lines, extraPattern }
}

// One sh:or branch (or the flat single-target form) for an entity target type:
// sh:class always, plus sh:node <target shape> when the profile defines a rule
// for that type (its own shape then validates the described entity).
function classBranch(type: string, ns: string, entities: ProfileEntityRule[]): string[] {
  const branch = [`sh:class ${iri(type)}`]
  const target = entities.find((entity) => sameSchemaOrgType(entity.type, type))
  if (target) branch.push(`sh:node ${iri(`${ns}shape-${fragmentSafe(target.className || termNameFromUri(target.type))}`)}`)
  return branch
}

function metaLines(rule: ProfilePropertyRule, order: number): string[] {
  const lines: string[] = []
  if (rule.label) lines.push(`  sh:name ${literal(rule.label)}`)
  if (rule.description) lines.push(`  sh:description ${literal(rule.description)}`)
  lines.push(`  sh:order ${order}`)
  return lines
}

// --- Turtle token helpers (deterministic, writer-free) ---

const PREFIXES: Array<[string, string]> = [
  [SH, 'sh:'],
  [XSD, 'xsd:'],
  [SCHEMA, 'schema:'],
]

// Local names that are safe as Turtle prefixed-name locals (conservative: the
// portal's naming discipline guarantees these shapes for schema.org terms).
const SAFE_LOCAL = /^[A-Za-z][A-Za-z0-9_-]*$/

function iri(value: string): string {
  for (const [namespace, prefix] of PREFIXES) {
    if (value.startsWith(namespace)) {
      const local = value.slice(namespace.length)
      if (SAFE_LOCAL.test(local)) return `${prefix}${local}`
    }
  }
  // Escape the characters IRIREF forbids (controls, space, <>"{}|^`\).
  return `<${value.replace(/[\u0000-\u0020<>"{}|^`\\]/g, (char) => encodeURIComponent(char))}>`
}

function literal(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
  return `"${escaped}"`
}

function numberToken(value: number): string {
  if (Number.isInteger(value)) return String(value)
  // Bare decimal form types as xsd:decimal; SHACL range facets compare
  // numerically across xsd numeric types.
  return String(value)
}

function isAbsolute(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)
}

function fragmentSafe(value: string): string {
  const safe = String(value ?? '').replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '')
  return safe || 'x'
}
