import { Parser, Store, DataFactory, type Quad_Object, type Quad_Subject, type Term } from 'n3'
import {
  CRATE_BASE_IRI,
  DATE_PATTERN,
  DATETIME_PATTERN,
  EMAIL_PATTERN,
  SH,
  URL_PATTERN,
  XSD,
} from './projection'
import { ALL_ENTITY_SOURCES } from '../profiles/sources'
import { isValidPropertyTermName, termNameFromUri } from '../profiles/uri'
import type { ProfileEntityRule, ProfileObligation, ProfilePropertyRule, ProfileValueKind } from '../profiles/types'

// All-or-nothing SHACL lift (plan section 6.6): when EVERY shape in a Turtle
// file uses only the liftable subset, the whole file converts to editable
// entity rules; otherwise the caller attaches the file verbatim, with the
// reasons listed. There is no partial lifting.
//
// This module imports n3, so UI callers must load it via dynamic import — the
// RDF stack stays out of the main bundle (plan section 13).
//
// Known-lossy mappings (documented, acceptable per plan):
// - severity Violation + minCount>=1 -> MUST, Warning -> SHOULD, else MAY.
// - sh:nodeKind sh:IRI without sh:class -> entity allowing all sources (the
//   projection emits that form for every reuse-allowing policy).
// - sh:class (+ sh:node) -> entity with describe-new only (the projection
//   emits that form for both create-only and crate-only policies).
// - datatype xsd:string with no other facet -> text; repeatability comes from
//   sh:maxCount (absent -> repeatable), so keyword-list round-trips as a
//   repeatable text rule and longtext as text.
// - sh:in over strings -> enum (select-url serializes identically).
// - the projection's number form, sh:or ( xsd:double xsd:integer ), is
//   recognized as one 'number' rule; any other sh:or is not liftable.

export type LiftResult =
  | { kind: 'rules'; entities: ProfileEntityRule[] }
  | { kind: 'attach'; shapeCount: number; reasons: string[] }

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const RDF_FIRST = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first'
const RDF_REST = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'
const RDF_NIL = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil'
const SCHEMA_DATASET = 'http://schema.org/Dataset'

const NODE_SHAPE_ALLOWED = new Set([
  RDF_TYPE,
  `${SH}targetClass`,
  `${SH}property`,
  `${SH}name`,
  `${SH}description`,
  `${SH}order`,
])

const PROPERTY_SHAPE_ALLOWED = new Set([
  RDF_TYPE,
  `${SH}path`,
  `${SH}minCount`,
  `${SH}maxCount`,
  `${SH}datatype`,
  `${SH}class`,
  `${SH}node`,
  `${SH}nodeKind`,
  `${SH}in`,
  `${SH}pattern`,
  `${SH}minLength`,
  `${SH}maxLength`,
  `${SH}minInclusive`,
  `${SH}maxInclusive`,
  `${SH}severity`,
  `${SH}name`,
  `${SH}description`,
  `${SH}order`,
  `${SH}or`,
  // Harmless metadata the projection emits; carried nowhere but never a
  // reason to refuse a lift.
  `${SH}message`,
])

// Throws on unparseable Turtle (the caller reports a file error); returns the
// lift or the attach verdict for every parseable file.
export function liftShapes(turtle: string): LiftResult {
  const store = new Store()
  const parser = new Parser({ baseIRI: CRATE_BASE_IRI })
  store.addQuads(parser.parse(turtle))

  const reasons: string[] = []

  // Node shapes: everything explicitly typed sh:NodeShape, plus subjects that
  // declare a target class or attach property shapes. Blank nodes that appear
  // as an OBJECT anywhere are nested shapes (sh:or branches, qualified value
  // shapes) — never top-level node shapes.
  const nestedBlank = new Set<string>()
  for (const quad of store.getQuads(null, null, null, null)) {
    if (quad.object.termType === 'BlankNode') nestedBlank.add(termKey(quad.object))
  }
  const isTopLevel = (subject: Quad_Subject) => subject.termType !== 'BlankNode' || !nestedBlank.has(termKey(subject))
  const nodeShapes = new Map<string, Quad_Subject>()
  for (const quad of store.getQuads(null, RDF_TYPE, namedNode(`${SH}NodeShape`), null)) {
    if (isTopLevel(quad.subject)) addTerm(nodeShapes, quad.subject)
  }
  for (const quad of store.getQuads(null, `${SH}targetClass`, null, null)) {
    if (isTopLevel(quad.subject)) addTerm(nodeShapes, quad.subject)
  }
  for (const quad of store.getQuads(null, `${SH}property`, null, null)) {
    if (isTopLevel(quad.subject)) addTerm(nodeShapes, quad.subject)
  }

  // Property shapes referenced from node shapes (also standalone typed ones —
  // a top-level property shape without an owning node shape is not liftable).
  const referenced = new Set<string>()
  for (const quad of store.getQuads(null, `${SH}property`, null, null)) referenced.add(termKey(quad.object as Term))
  for (const quad of store.getQuads(null, RDF_TYPE, namedNode(`${SH}PropertyShape`), null)) {
    if (!referenced.has(termKey(quad.subject))) {
      reasons.push(`Property shape ${shortTerm(quad.subject)} is not attached to any node shape.`)
    }
  }

  if (!nodeShapes.size) {
    return { kind: 'attach', shapeCount: 0, reasons: ['No SHACL node shapes found in the file.'] }
  }

  // Any SPARQL-based constraint is an immediate attach.
  if (store.getQuads(null, `${SH}sparql`, null, null).length) reasons.push('Uses SHACL-SPARQL (sh:sparql).')

  let rootShape: Quad_Subject | undefined
  const entities: ProfileEntityRule[] = []

  for (const shape of nodeShapes.values()) {
    const shapeName = shortTerm(shape)
    for (const quad of store.getQuads(shape, null, null, null)) {
      if (!NODE_SHAPE_ALLOWED.has(quad.predicate.value)) {
        reasons.push(`Shape ${shapeName} uses ${shortIri(quad.predicate.value)}.`)
      }
    }
    const targets = store.getQuads(shape, `${SH}targetClass`, null, null).map((quad) => quad.object)
    if (targets.length > 1) reasons.push(`Shape ${shapeName} has multiple target classes.`)
    if (!targets.length) {
      // A target-less top-level node shape is the runtime-bound root Dataset
      // shape (the projection's own output); at most one may exist.
      if (rootShape) reasons.push(`More than one shape without a target class (${shortTerm(rootShape)}, ${shapeName}).`)
      rootShape = shape
    }

    const type = targets.length === 1 && targets[0].termType === 'NamedNode' ? targets[0].value : SCHEMA_DATASET
    if (targets.length === 1 && targets[0].termType !== 'NamedNode') {
      reasons.push(`Shape ${shapeName} target class is not an IRI.`)
    }
    const className = classNameFor(type)
    const propertyRules: ProfilePropertyRule[] = []

    // Group this shape's property shapes by path IRI: the projection splits a
    // rule into presence + value (+ pattern) shapes over the same path.
    const groups = new Map<string, Quad_Subject[]>()
    const groupOrder: string[] = []
    for (const quad of store.getQuads(shape, `${SH}property`, null, null)) {
      const propertyShape = quad.object as Quad_Subject
      const paths = store.getQuads(propertyShape, `${SH}path`, null, null).map((entry) => entry.object)
      if (paths.length !== 1 || paths[0].termType !== 'NamedNode') {
        reasons.push(`Property shape ${shortTerm(propertyShape)} in ${shapeName} has no plain IRI path.`)
        continue
      }
      const path = paths[0].value
      if (!groups.has(path)) {
        groups.set(path, [])
        groupOrder.push(path)
      }
      groups.get(path)?.push(propertyShape)
    }

    for (const path of groupOrder) {
      const rule = liftRuleGroup(store, path, groups.get(path) ?? [], shapeName, reasons)
      if (rule) propertyRules.push(rule)
    }
    propertyRules.sort((a, b) => (ruleOrder.get(a) ?? 0) - (ruleOrder.get(b) ?? 0))

    entities.push({
      id: className.toLowerCase(),
      label: className,
      description: '',
      type,
      className,
      propertyRules,
    })
  }

  if (reasons.length) {
    return { kind: 'attach', shapeCount: nodeShapes.size, reasons: [...new Set(reasons)] }
  }

  // Root Dataset entity first (builder convention); a file with only
  // class-targeted shapes gets no synthetic root.
  entities.sort((a, b) => Number(b.type === SCHEMA_DATASET && rootShape !== undefined) - Number(a.type === SCHEMA_DATASET && rootShape !== undefined))
  return { kind: 'rules', entities }
}

// sh:node targets resolved lazily for entityTypes when sh:class is absent.
const ruleOrder = new WeakMap<ProfilePropertyRule, number>()

function liftRuleGroup(
  store: Store,
  path: string,
  shapes: Quad_Subject[],
  ownerName: string,
  reasons: string[],
): ProfilePropertyRule | undefined {
  // Collected across the group's shapes.
  let minCount: number | undefined
  let minCountSeverity: string | undefined
  let maxCount: number | undefined
  let datatype: string | undefined
  let classIri: string | undefined
  let nodeIris: string[] = []
  let nodeKindIri = false
  let inOptions: string[] | undefined
  const patterns: string[] = []
  let minLength: number | undefined
  let maxLength: number | undefined
  let minValue: number | undefined
  let maxValue: number | undefined
  let label = ''
  let description = ''
  let order: number | undefined
  let numberOr = false

  for (const shape of shapes) {
    const quads = store.getQuads(shape, null, null, null)
    for (const quad of quads) {
      if (!PROPERTY_SHAPE_ALLOWED.has(quad.predicate.value)) {
        reasons.push(`Property shape ${shortTerm(shape)} in ${ownerName} uses ${shortIri(quad.predicate.value)}.`)
      }
    }
    const severity = objectValue(store, shape, `${SH}severity`)
    const shapeMin = intValue(objectValue(store, shape, `${SH}minCount`))
    if (shapeMin !== undefined) {
      minCount = minCount === undefined ? shapeMin : Math.max(minCount, shapeMin)
      minCountSeverity = severity ?? minCountSeverity
    } else if (severity && severity !== `${SH}Violation`) {
      // Severity on a value shape (no minCount) cannot be expressed: value
      // constraints are always Violation in the rule model.
      reasons.push(`Property shape ${shortTerm(shape)} in ${ownerName} sets a non-Violation severity on value constraints.`)
    }
    const shapeMax = intValue(objectValue(store, shape, `${SH}maxCount`))
    if (shapeMax !== undefined) maxCount = maxCount === undefined ? shapeMax : Math.min(maxCount, shapeMax)

    const shapeDatatype = objectValue(store, shape, `${SH}datatype`)
    if (shapeDatatype) datatype = shapeDatatype
    const shapeClass = objectValue(store, shape, `${SH}class`)
    if (shapeClass) classIri = shapeClass
    for (const quad of store.getQuads(shape, `${SH}node`, null, null)) nodeIris.push(quad.object.value)
    const nodeKind = objectValue(store, shape, `${SH}nodeKind`)
    if (nodeKind) {
      if (nodeKind === `${SH}IRI`) nodeKindIri = true
      else reasons.push(`Property shape ${shortTerm(shape)} in ${ownerName} uses sh:nodeKind ${shortIri(nodeKind)}.`)
    }

    for (const quad of store.getQuads(shape, `${SH}in`, null, null)) {
      const items = listItems(store, quad.object as Quad_Subject)
      if (!items) reasons.push(`Property shape ${shortTerm(shape)} in ${ownerName} has a malformed sh:in list.`)
      else if (items.some((item) => item.termType !== 'Literal')) {
        reasons.push(`Property shape ${shortTerm(shape)} in ${ownerName} uses sh:in with non-literal values.`)
      } else inOptions = items.map((item) => item.value)
    }

    for (const quad of store.getQuads(shape, `${SH}or`, null, null)) {
      // Only the projection's number form is liftable: sh:or over exactly the
      // xsd:double and xsd:integer datatype branches.
      if (isNumberOr(store, quad.object as Quad_Subject)) numberOr = true
      else reasons.push(`Property shape ${shortTerm(shape)} in ${ownerName} uses sh:or.`)
    }

    for (const quad of store.getQuads(shape, `${SH}pattern`, null, null)) patterns.push(quad.object.value)
    minLength ??= intValue(objectValue(store, shape, `${SH}minLength`))
    maxLength ??= intValue(objectValue(store, shape, `${SH}maxLength`))
    minValue ??= floatValue(objectValue(store, shape, `${SH}minInclusive`))
    maxValue ??= floatValue(objectValue(store, shape, `${SH}maxInclusive`))
    label ||= literalValue(store, shape, `${SH}name`) ?? ''
    description ||= literalValue(store, shape, `${SH}description`) ?? ''
    order ??= floatValue(objectValue(store, shape, `${SH}order`))
  }

  const obligation: ProfileObligation =
    minCount !== undefined && minCount >= 1
      ? minCountSeverity === `${SH}Warning`
        ? 'SHOULD'
        : minCountSeverity === undefined || minCountSeverity === `${SH}Violation`
          ? 'MUST'
          : 'MAY'
      : 'MAY'
  if (minCountSeverity === `${SH}Info`) reasons.push(`A minimum count in ${ownerName} uses sh:severity sh:Info.`)

  // Kind resolution.
  let kind: ProfileValueKind
  let entityTypes: string[] | undefined
  let entitySources: ProfilePropertyRule['entitySources']
  let enumOptions: string[] | undefined
  let pattern: string | undefined
  const patternSet = new Set(patterns)

  const takePattern = (expected: string): boolean => patternSet.delete(expected)

  if (classIri || (nodeKindIri && !datatype && !inOptions)) {
    kind = 'entity'
    if (classIri) {
      entityTypes = [classIri]
      // Projection emits class+node for describe-new (and crate-only) rules;
      // absent entitySources is the stored form of ['new'].
    } else {
      // nodeKind IRI only: the reuse-allowing form; original single-source
      // policies are not recoverable (documented lossy mapping).
      entitySources = [...ALL_ENTITY_SOURCES]
      // A bare sh:node link can still name the target type via its shape.
      const nodeTargets = nodeIris
        .map((node) => objectValue(store, namedOrBlank(node), `${SH}targetClass`))
        .filter((value): value is string => Boolean(value))
      if (nodeTargets.length) entityTypes = [nodeTargets[0]]
    }
  } else if (numberOr) {
    kind = 'number'
  } else if (inOptions) {
    kind = 'enum'
    enumOptions = inOptions
  } else if (datatype === `${XSD}integer` || datatype === `${XSD}int` || datatype === `${XSD}long`) {
    kind = 'integer'
  } else if (datatype === `${XSD}double` || datatype === `${XSD}float` || datatype === `${XSD}decimal`) {
    kind = 'number'
  } else if (datatype === `${XSD}boolean`) {
    kind = 'boolean'
  } else if (datatype === `${XSD}date`) {
    kind = 'date'
  } else if (datatype === `${XSD}dateTime`) {
    kind = 'datetime'
  } else if (datatype === `${XSD}anyURI`) {
    kind = 'url'
  } else if (datatype === `${XSD}string` || datatype === undefined) {
    // Kind-derived patterns round-trip to their kinds; leftover patterns stay
    // author constraints.
    if (takePattern(EMAIL_PATTERN)) kind = 'email'
    else if (takePattern(URL_PATTERN)) kind = 'url'
    else if (takePattern(DATE_PATTERN)) kind = 'date'
    else if (takePattern(DATETIME_PATTERN)) kind = 'datetime'
    else kind = 'text'
  } else {
    reasons.push(`Property shape group for ${shortIri(path)} in ${ownerName} uses unsupported datatype ${shortIri(datatype)}.`)
    kind = 'text'
  }

  const leftovers = [...patternSet]
  if (leftovers.length > 1) reasons.push(`Property shape group for ${shortIri(path)} in ${ownerName} has multiple patterns.`)
  pattern = leftovers[0]

  const valueName = propertyNameFor(path)
  const multipleValues = maxCount === undefined || maxCount > 1

  const rule: ProfilePropertyRule = {
    id: valueName,
    label: label || valueName,
    description,
    kind,
    propertyUri: path,
    valueName,
    obligation,
  }
  if (multipleValues) rule.multipleValues = true
  if (multipleValues && maxCount !== undefined) rule.maxItems = maxCount
  if (multipleValues && minCount !== undefined && minCount > 1) rule.minItems = minCount
  if (entityTypes) rule.entityTypes = entityTypes
  if (entitySources) rule.entitySources = entitySources
  if (enumOptions) rule.enumOptions = enumOptions
  if (pattern) rule.pattern = pattern
  if (minLength !== undefined) rule.minLength = minLength
  if (maxLength !== undefined) rule.maxLength = maxLength
  if (minValue !== undefined) rule.minValue = minValue
  if (maxValue !== undefined) rule.maxValue = maxValue
  ruleOrder.set(rule, order ?? Number.MAX_SAFE_INTEGER)
  return rule
}

// True when the sh:or list is exactly the projection's number form:
// ( [ sh:datatype xsd:double ] [ sh:datatype xsd:integer ] ) in either order.
function isNumberOr(store: Store, head: Quad_Subject): boolean {
  const items = listItems(store, head)
  if (!items || items.length !== 2) return false
  const datatypes = items.map((item) => {
    if (item.termType !== 'BlankNode' && item.termType !== 'NamedNode') return ''
    const quads = store.getQuads(item as Quad_Subject, null, null, null)
    if (quads.length !== 1 || quads[0].predicate.value !== `${SH}datatype`) return ''
    return quads[0].object.value
  })
  return new Set(datatypes).size === 2 && datatypes.includes(`${XSD}double`) && datatypes.includes(`${XSD}integer`)
}

function listItems(store: Store, head: Quad_Subject | Term): Quad_Object[] | undefined {
  const items: Quad_Object[] = []
  let current: Term = head as Term
  const seen = new Set<string>()
  while (current.value !== RDF_NIL) {
    if (current.termType !== 'BlankNode' && current.termType !== 'NamedNode') return undefined
    const key = termKey(current)
    if (seen.has(key)) return undefined
    seen.add(key)
    const firsts = store.getQuads(current as Quad_Subject, RDF_FIRST, null, null)
    const rests = store.getQuads(current as Quad_Subject, RDF_REST, null, null)
    if (firsts.length !== 1 || rests.length !== 1) return undefined
    items.push(firsts[0].object)
    current = rests[0].object
  }
  return items
}

function classNameFor(type: string): string {
  const raw = termNameFromUri(type).replace(/[^A-Za-z0-9]+/g, '')
  const named = raw || 'Entity'
  return named[0].toUpperCase() + named.slice(1)
}

function propertyNameFor(path: string): string {
  const raw = termNameFromUri(path).replace(/[^A-Za-z0-9]+/g, '')
  const named = raw || 'value'
  const candidate = named[0].toLowerCase() + named.slice(1)
  return isValidPropertyTermName(candidate) ? candidate : `p${candidate.replace(/^[^A-Za-z]+/, '')}` || 'value'
}

function objectValue(store: Store, subject: Quad_Subject, predicate: string): string | undefined {
  const quads = store.getQuads(subject, predicate, null, null)
  return quads.length ? quads[0].object.value : undefined
}

function literalValue(store: Store, subject: Quad_Subject, predicate: string): string | undefined {
  const quads = store.getQuads(subject, predicate, null, null)
  const literalQuad = quads.find((quad) => quad.object.termType === 'Literal')
  return literalQuad?.object.value
}

function intValue(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function floatValue(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function addTerm(map: Map<string, Quad_Subject>, term: Quad_Subject) {
  map.set(termKey(term), term)
}

function termKey(term: Term): string {
  return `${term.termType}:${term.value}`
}

function namedOrBlank(value: string): Quad_Subject {
  return value.startsWith('_:') ? DataFactory.blankNode(value.slice(2)) : DataFactory.namedNode(value)
}

function namedNode(value: string) {
  return DataFactory.namedNode(value)
}

function shortTerm(term: Term): string {
  return term.termType === 'BlankNode' ? `_:${term.value}` : shortIri(term.value)
}

function shortIri(value: string | undefined): string {
  if (!value) return '(none)'
  const hash = value.lastIndexOf('#')
  if (hash >= 0 && hash < value.length - 1) return value.slice(hash + 1)
  return value
}
