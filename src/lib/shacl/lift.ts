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
import { isHasPartUri } from '../profiles/emit'
import { isDatasetType, isValidPropertyTermName, sameSchemaOrgType, SCHEMA_ORG, termNameFromUri } from '../profiles/uri'
import type {
  ProfileEntityRule,
  ProfileObligation,
  ProfilePropertyRule,
  ProfileRequiredInstance,
  ProfileValueKind,
} from '../profiles/types'

// PARTIAL SHACL lift. Every shape a real-world file contains is inspected and as
// much of it as the rule model can express becomes an editable rule; whatever is
// left over is reported as a note instead of refusing the whole file. (The
// earlier all-or-nothing lift rejected any file using sh:not, sh:sparql, an
// arbitrary sh:or, or sh:nodeKind sh:Literal — which is most generated SHACL, so
// authors got a default draft and no fields.)
//
// Two note kinds, both surfaced to the author:
//   'partial'  — a field WAS generated, but this detail is not editable here and
//                only keeps working while the file stays attached.
//   'no-field' — nothing in the builder represents this at all (cross-property
//                SPARQL rules, shapes pinned to one specific node).
// A file with any note should stay attached as shapes.custom.ttl so the parts we
// could not model keep validating alongside the generated shapes.
//
// This module imports n3, so UI callers must load it via dynamic import — the
// RDF stack stays out of the main bundle (plan section 13).
//
// Known-lossy mappings (documented, acceptable per plan):
// - severity Violation + minCount>=1 -> MUST, Warning -> SHOULD, else MAY.
// - sh:nodeKind sh:IRI / a bare sh:node without sh:class -> entity allowing all
//   sources (the projection emits that form for every reuse-allowing policy).
// - sh:class (+ sh:node) -> entity with describe-new only (the projection emits
//   that form for both create-only and crate-only policies).
// - datatype xsd:string with no other facet -> text; repeatability comes from
//   sh:maxCount (absent -> repeatable), so keyword-list round-trips as a
//   repeatable text rule and longtext as text.
// - sh:in over strings -> enum (select-url serializes identically).
// - the projection's number form, sh:or ( xsd:double xsd:integer ), is
//   recognized as one 'number' rule; any other sh:or contributes its FIRST
//   branch's facets and reports the alternatives as a note.

export interface LiftNote {
  kind: 'partial' | 'no-field'
  message: string
  // Shapes / properties the message applies to. One note per distinct message,
  // so a file that repeats a construct 40 times reports it once.
  scopes: string[]
}

export interface LiftResult {
  entities: ProfileEntityRule[]
  notes: LiftNote[]
  shapeCount: number
  fieldCount: number
}

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const RDF_FIRST = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first'
const RDF_REST = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'
const RDF_NIL = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil'
const SCHEMA_DATASET = `${SCHEMA_ORG}Dataset`
const DCT_CONFORMS_TO = 'http://purl.org/dc/terms/conformsTo'

// Key for the group of shapes that describe the crate root: no target and no
// class of their own, which is the form the projection emits and the form
// validate.ts binds to the crate root at runtime. Prefixed with a character no
// IRI can contain, so it can never collide with a real type key.
const ROOT_KEY = '\u0000root'

// Node-shape predicates the lift reads. Anything else becomes a note.
const NODE_SHAPE_KNOWN = new Set([
  RDF_TYPE,
  `${SH}targetClass`,
  `${SH}targetNode`,
  `${SH}property`,
  `${SH}class`,
  `${SH}name`,
  `${SH}description`,
  `${SH}order`,
  `${SH}message`,
  // Read separately: sh:or is checked for the projection's entry-count form,
  // sh:sparql always reports its own note.
  `${SH}or`,
  `${SH}sparql`,
])

// Property-shape predicates the lift reads. Anything else becomes a note.
const PROPERTY_SHAPE_KNOWN = new Set([
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
  `${SH}message`,
  // Read, but only partly representable — each reports its own note.
  `${SH}or`,
  `${SH}not`,
  `${SH}hasValue`,
  `${SH}qualifiedValueShape`,
  `${SH}qualifiedMinCount`,
  `${SH}qualifiedMaxCount`,
])

// Collects notes, merging repeats of the same message into one entry.
class Notes {
  private readonly byMessage = new Map<string, LiftNote>()

  add(kind: LiftNote['kind'], message: string, scope?: string) {
    const key = `${kind}\u0000${message}`
    const existing = this.byMessage.get(key)
    if (existing) {
      if (scope && !existing.scopes.includes(scope)) existing.scopes.push(scope)
      return
    }
    this.byMessage.set(key, { kind, message, scopes: scope ? [scope] : [] })
  }

  list(): LiftNote[] {
    // No-field notes first: they are the ones an author must act on.
    return [...this.byMessage.values()].sort(
      (a, b) => Number(b.kind === 'no-field') - Number(a.kind === 'no-field'),
    )
  }
}

interface ShapeInfo {
  subject: Quad_Subject
  name: string
  targetClass?: string
  nodeClass?: string
  hasTargetNode: boolean
  referenced: boolean
  shapeLabel?: string
  propertyShapes: Quad_Subject[]
}

interface ShapeGroup {
  key: string
  label?: string
  shapes: ShapeInfo[]
  datasetAsserted: boolean
  // path -> minimum entries, recovered from the projection's entry-count shape.
  entryCounts: Map<string, number>
}

// Throws on unparseable Turtle (the caller reports a file error); every
// parseable file yields a result, even when nothing at all could be lifted.
export function liftShapes(turtle: string): LiftResult {
  const store = new Store()
  const prefixes: Record<string, string> = {}
  const parser = new Parser({ baseIRI: CRATE_BASE_IRI })
  store.addQuads(parser.parse(turtle, null, (prefix, node) => { prefixes[prefix] = node.value }))

  const notes = new Notes()

  // Node shapes: everything explicitly typed sh:NodeShape, plus subjects that
  // declare a target or attach property shapes. Blank nodes that appear as an
  // OBJECT anywhere are nested shapes (sh:or branches, qualified value shapes,
  // sh:not) — never top-level node shapes.
  const nestedBlank = new Set<string>()
  for (const quad of store.getQuads(null, null, null, null)) {
    if (quad.object.termType === 'BlankNode') nestedBlank.add(termKey(quad.object))
  }
  const isTopLevel = (subject: Quad_Subject) =>
    subject.termType !== 'BlankNode' || !nestedBlank.has(termKey(subject))

  const nodeShapes = new Map<string, Quad_Subject>()
  for (const quad of store.getQuads(null, RDF_TYPE, namedNode(`${SH}NodeShape`), null)) {
    if (isTopLevel(quad.subject)) addTerm(nodeShapes, quad.subject)
  }
  for (const predicate of [`${SH}targetClass`, `${SH}targetNode`, `${SH}property`]) {
    for (const quad of store.getQuads(null, predicate, null, null)) {
      if (isTopLevel(quad.subject)) addTerm(nodeShapes, quad.subject)
    }
  }

  // Shapes used as a member of another shape (a property, an sh:or branch, a
  // negation, a qualified value shape) describe part of something else, never
  // the crate root. sh:node is deliberately NOT in this list: the projection
  // emits `sh:node <root shape>` for any rule whose target type is the crate's
  // own Dataset, and that must not stop the root shape being recognized. A
  // value shape that pins a class is grouped under that class anyway, so it
  // never reaches the root fallback. validate.ts binds root targets by the same
  // rule, so the two cannot disagree about which shape is the root.
  const referenced = new Set<string>()
  for (const predicate of [`${SH}property`, `${SH}qualifiedValueShape`, `${SH}not`, RDF_FIRST]) {
    for (const quad of store.getQuads(null, predicate, null, null)) referenced.add(termKey(quad.object))
  }

  // A property shape nobody attached contributes nothing.
  const attached = new Set<string>()
  for (const quad of store.getQuads(null, `${SH}property`, null, null)) attached.add(termKey(quad.object))
  for (const quad of store.getQuads(null, RDF_TYPE, namedNode(`${SH}PropertyShape`), null)) {
    if (!attached.has(termKey(quad.subject))) {
      notes.add('no-field', 'Property shape is not attached to any node shape, so it belongs to no form.', shortTerm(quad.subject))
    }
  }

  if (!nodeShapes.size) {
    return { entities: [], notes: notes.list(), shapeCount: 0, fieldCount: 0 }
  }

  const groups = new Map<string, ShapeGroup>()

  for (const shape of nodeShapes.values()) {
    const name = shortTerm(shape)

    for (const quad of store.getQuads(shape, null, null, null)) {
      if (!NODE_SHAPE_KNOWN.has(quad.predicate.value)) {
        notes.add('partial', `Shape constraint ${shortIri(quad.predicate.value)} has no builder equivalent and only applies while the file stays attached.`, name)
      }
    }

    // SPARQL constraints are cross-property by nature: no single input can
    // represent them. Surface their own message, which is usually the clearest
    // statement of the rule.
    for (const quad of store.getQuads(shape, `${SH}sparql`, null, null)) {
      const message = literalValue(store, quad.object as Quad_Subject, `${SH}message`)
      notes.add('no-field', message
        ? `${message} (a cross-property SPARQL rule, checked at validation time only)`
        : 'A SPARQL constraint checks several properties at once and generates no input.', name)
    }

    const targetClasses = store.getQuads(shape, `${SH}targetClass`, null, null).map((quad) => quad.object)
    if (targetClasses.length > 1) {
      notes.add('partial', 'Shape targets several classes; rules were imported for the first one only.', name)
    }
    const targetClass = targetClasses.find((term) => term.termType === 'NamedNode')?.value
    if (targetClasses.length && !targetClass) {
      notes.add('no-field', 'Shape target class is not a plain IRI, so its rules could not be imported.', name)
    }
    const nodeClass = store.getQuads(shape, `${SH}class`, null, null)
      .find((quad) => quad.object.termType === 'NamedNode')?.object.value
    const hasTargetNode = store.getQuads(shape, `${SH}targetNode`, null, null).length > 0

    const info: ShapeInfo = {
      subject: shape,
      name,
      targetClass,
      nodeClass,
      hasTargetNode,
      referenced: referenced.has(termKey(shape)),
      shapeLabel: literalValue(store, shape, `${SH}name`),
      propertyShapes: store.getQuads(shape, `${SH}property`, null, null).map((quad) => quad.object as Quad_Subject),
    }

    // A shape pinned to one specific node describes that node, not a class of
    // entities an author fills in.
    if (hasTargetNode && !targetClass) {
      notes.add('no-field', 'Shape applies to one specific node rather than a type of entity, so it generates no input.', name)
      continue
    }

    const key = targetClass ?? nodeClass ?? (info.referenced ? undefined : ROOT_KEY)
    if (!key) {
      notes.add('no-field', 'Shape is referenced from another shape but names no class, so its rules could not be attached to a form.', name)
      continue
    }

    let group = groups.get(key)
    if (!group) {
      group = { key, shapes: [], datasetAsserted: false, entryCounts: new Map() }
      groups.set(key, group)
    }
    group.shapes.push(info)
    group.label ||= info.shapeLabel
    group.datasetAsserted ||= isDatasetType(targetClass ?? '') || isDatasetType(nodeClass ?? '')
    if (targetClass && nodeClass && targetClass !== nodeClass && !isDatasetType(nodeClass)) {
      notes.add('partial', `Entities must also be a ${shortIri(nodeClass)}; the builder writes one type per entity.`, name)
    }

    // The projection's "no entries or at least N" form, recovered as minItems.
    for (const quad of store.getQuads(shape, `${SH}or`, null, null)) {
      const entryCount = readEntryCountOr(store, quad.object as Quad_Subject)
      if (entryCount) group.entryCounts.set(entryCount.path, entryCount.minItems)
      else notes.add('partial', 'A shape-level sh:or alternative has no builder equivalent and only applies while the file stays attached.', name)
    }
  }

  // Which group drives the root Dataset form: the target-less group the
  // projection emits, else a group typed Dataset, else a group whose shapes
  // merely REQUIRE schema:Dataset (the common "my class is also a Dataset"
  // form) — that one gets retyped, which is worth a note.
  const ordered = [...groups.values()]
  const rootGroup =
    ordered.find((group) => group.key === ROOT_KEY) ??
    ordered.find((group) => isDatasetType(group.key)) ??
    ordered.find((group) => group.datasetAsserted)
  if (rootGroup && rootGroup.key !== ROOT_KEY && !isDatasetType(rootGroup.key)) {
    const asserting = rootGroup.shapes.find((shape) => isDatasetType(shape.nodeClass ?? shape.targetClass ?? ''))
    notes.add(
      'partial',
      `Rules targeting ${shortIri(rootGroup.key)} were imported onto the Root Dataset. Crates written here are typed Dataset only, so shapes targeting ${shortIri(rootGroup.key)} in the attached file will not match anything.`,
      asserting?.name ?? rootGroup.shapes[0]?.name,
    )
  }

  const entities: ProfileEntityRule[] = []
  const usedIds = new Set<string>()

  for (const group of ordered) {
    const isRoot = group === rootGroup
    const type = isRoot ? SCHEMA_DATASET : group.key
    const className = classNameFor(type)
    const scopeName = isRoot ? 'Root Dataset' : className

    // Group every property shape in the group by path, so the presence / value /
    // recommended shapes a generator splits a single field across merge back
    // into one rule — including when they live in SEPARATE node shapes that
    // share a target class.
    const byPath = new Map<string, Quad_Subject[]>()
    const pathOrder: string[] = []
    for (const shape of group.shapes) {
      for (const propertyShape of shape.propertyShapes) {
        const paths = store.getQuads(propertyShape, `${SH}path`, null, null).map((quad) => quad.object)
        const path = paths.length === 1 && paths[0].termType === 'NamedNode' ? paths[0].value : undefined
        if (!path) {
          notes.add('no-field', paths.length
            ? 'A property uses a SHACL path expression (a sequence, alternative or inverse path) that no single input can represent.'
            : 'A property shape has no sh:path, so no input could be derived from it.', shape.name)
          continue
        }
        if (!byPath.has(path)) {
          byPath.set(path, [])
          pathOrder.push(path)
        }
        byPath.get(path)?.push(propertyShape)
      }
    }

    const rules: ProfilePropertyRule[] = []
    for (const path of pathOrder) {
      const rule = liftRuleGroup(store, path, byPath.get(path) ?? [], scopeName, notes, prefixes)
      if (!rule) continue
      const minItems = group.entryCounts.get(path)
      if (minItems !== undefined && rule.multipleValues) rule.minItems = minItems
      rules.push(rule)
    }
    rules.sort(compareRuleOrder)
    dedupeValueNames(rules)

    if (!rules.length) continue

    const baseId = className.toLowerCase()
    let id = baseId
    for (let n = 2; usedIds.has(id); n++) id = `${baseId}-${n}`
    usedIds.add(id)

    entities.push({
      id,
      label: isRoot ? 'Root Dataset' : group.label || humanLabel(className),
      description: '',
      type,
      className,
      propertyRules: rules,
    })
  }

  // Root Dataset first: the builder's outline opens on it.
  entities.sort((a, b) => Number(isDatasetType(b.type)) - Number(isDatasetType(a.type)))

  return {
    entities,
    notes: notes.list(),
    shapeCount: nodeShapes.size,
    fieldCount: entities.reduce((total, entity) => total + entity.propertyRules.length, 0),
  }
}

// Emission order recovered from sh:order, applied before the rules are stored.
const ruleOrder = new WeakMap<ProfilePropertyRule, number>()

// sh:order decides; ties — including every rule of a file that declares no order
// at all — fall back to label then term, so an unordered import is stable and
// predictable instead of following RDF-store insertion order.
function compareRuleOrder(a: ProfilePropertyRule, b: ProfilePropertyRule): number {
  const byOrder = (ruleOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (ruleOrder.get(b) ?? Number.MAX_SAFE_INTEGER)
  if (byOrder) return byOrder
  return a.label.localeCompare(b.label) || a.valueName.localeCompare(b.valueName)
}

// The facets a value constraint can contribute, gathered across every property
// shape that shares a path (and, for sh:or, from the first branch).
interface Facets {
  datatype?: string
  classIri?: string
  nodeIris: string[]
  nodeKindIri: boolean
  inOptions?: string[]
  patterns: string[]
  minLength?: number
  maxLength?: number
  minValue?: number
  maxValue?: number
  numberOr: boolean
}

function emptyFacets(): Facets {
  return { nodeIris: [], nodeKindIri: false, patterns: [], numberOr: false }
}

function liftRuleGroup(
  store: Store,
  path: string,
  shapes: Quad_Subject[],
  ownerName: string,
  notes: Notes,
  prefixes: Record<string, string>,
): ProfilePropertyRule | undefined {
  const label = labelForPath(path, prefixes)
  const scope = `${ownerName} / ${label}`

  // The portal writes the profile conformance reference itself, so an editable
  // field for it would only invite conflicting values.
  if (path === DCT_CONFORMS_TO) {
    notes.add('no-field', 'Profile conformance (dcterms:conformsTo) is written automatically for every crate, so it gets no input.', ownerName)
    return undefined
  }

  const facets = emptyFacets()
  let minCount: number | undefined
  let minCountSeverity: string | undefined
  let maxCount: number | undefined
  let ruleLabel = ''
  let description = ''
  let order: number | undefined
  const hasValues: Term[] = []
  const requiredInstances: ProfileRequiredInstance[] = []

  for (const shape of shapes) {
    const shapeQuads = store.getQuads(shape, null, null, null)
    for (const quad of shapeQuads) {
      if (!PROPERTY_SHAPE_KNOWN.has(quad.predicate.value)) {
        notes.add('partial', `The constraint ${shortIri(quad.predicate.value)} has no builder equivalent and only applies while the file stays attached.`, scope)
      }
    }

    const severity = objectValue(store, shape, `${SH}severity`)
    const shapeMin = intValue(objectValue(store, shape, `${SH}minCount`))
    const carriesInstance =
      store.getQuads(shape, `${SH}hasValue`, null, null).length > 0 ||
      store.getQuads(shape, `${SH}qualifiedMinCount`, null, null).length > 0
    if (shapeMin !== undefined) {
      minCount = minCount === undefined ? shapeMin : Math.max(minCount, shapeMin)
      minCountSeverity = severity ?? minCountSeverity
    } else if (severity && severity !== `${SH}Violation` && !carriesInstance) {
      // Severity on a value shape cannot be expressed: in the rule model a value
      // that is present but wrong is always blocking.
      notes.add('partial', 'A value constraint is reported below error level; the builder always reports an invalid value as an error.', scope)
    }
    const shapeMax = intValue(objectValue(store, shape, `${SH}maxCount`))
    if (shapeMax !== undefined) maxCount = maxCount === undefined ? shapeMax : Math.min(maxCount, shapeMax)

    readFacets(store, shape, facets, scope, notes, false)

    for (const quad of store.getQuads(shape, `${SH}hasValue`, null, null)) hasValues.push(quad.object)
    for (const quad of store.getQuads(shape, `${SH}qualifiedValueShape`, null, null)) {
      const name = readQualifiedName(store, quad.object as Quad_Subject)
      if (name !== undefined) requiredInstances.push({ name })
      else notes.add('partial', 'A qualified value shape restricts part of a list in a way the builder cannot edit; it stays in the attached file.', scope)
    }

    ruleLabel ||= literalValue(store, shape, `${SH}name`) ?? ''
    // A generator's sh:message is usually the only human explanation of the
    // field in the file, so it becomes the rule description when there is none.
    description ||= literalValue(store, shape, `${SH}description`) ?? literalValue(store, shape, `${SH}message`) ?? ''
    order ??= floatValue(objectValue(store, shape, `${SH}order`))
  }

  const obligation: ProfileObligation =
    minCount !== undefined && minCount >= 1
      ? minCountSeverity === `${SH}Warning` || minCountSeverity === `${SH}Info`
        ? 'SHOULD'
        : 'MUST'
      : 'MAY'

  const { kind, entityTypes, entitySources, enumOptions, pattern } = resolveKind(store, path, facets, scope, notes)

  const valueName = propertyNameFor(path)
  const multipleValues = maxCount === undefined || maxCount > 1

  const rule: ProfilePropertyRule = {
    id: valueName,
    label: ruleLabel || label,
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
  if (facets.minLength !== undefined) rule.minLength = facets.minLength
  if (facets.maxLength !== undefined) rule.maxLength = facets.maxLength
  if (facets.minValue !== undefined) rule.minValue = facets.minValue
  if (facets.maxValue !== undefined) rule.maxValue = facets.maxValue

  // sh:hasValue pins one value. On an entity list that is a required entry the
  // builder can edit; anywhere else it becomes the default and a note, because
  // the rule model has no "must equal" constraint.
  for (const value of hasValues) {
    if (kind === 'entity' && multipleValues) requiredInstances.push({ id: crateLocalValue(value.value) })
    else {
      rule.defaultValue = value.value
      notes.add('partial', `A fixed value is required here; the builder prefills it but cannot enforce it, so keep the file attached.`, scope)
    }
  }
  if (requiredInstances.length && kind === 'entity' && multipleValues) rule.requiredInstances = requiredInstances

  ruleOrder.set(rule, order ?? Number.MAX_SAFE_INTEGER)
  return rule
}

// Reads one shape's value facets into the accumulator. `branch` shapes are the
// members of an sh:or list: they carry value facets only, so cardinality,
// severity and metadata are not read from them.
function readFacets(
  store: Store,
  shape: Quad_Subject,
  facets: Facets,
  scope: string,
  notes: Notes,
  branch: boolean,
) {
  const datatype = objectValue(store, shape, `${SH}datatype`)
  if (datatype) facets.datatype ??= datatype
  const classIri = objectValue(store, shape, `${SH}class`)
  if (classIri) facets.classIri ??= classIri
  for (const quad of store.getQuads(shape, `${SH}node`, null, null)) facets.nodeIris.push(quad.object.value)

  const nodeKind = objectValue(store, shape, `${SH}nodeKind`)
  if (nodeKind === `${SH}IRI` || nodeKind === `${SH}IRIOrLiteral` || nodeKind === `${SH}BlankNodeOrIRI`) {
    facets.nodeKindIri = true
  } else if (nodeKind && nodeKind !== `${SH}Literal`) {
    notes.add('partial', `Values are restricted to ${shortIri(nodeKind)} nodes, which the builder does not model.`, scope)
  }

  for (const quad of store.getQuads(shape, `${SH}in`, null, null)) {
    const items = listItems(store, quad.object as Quad_Subject)
    if (!items) notes.add('partial', 'A list of allowed values is malformed and was skipped.', scope)
    else if (items.some((item) => item.termType !== 'Literal')) {
      notes.add('partial', 'A list of allowed values contains references rather than plain values; the builder only offers plain values.', scope)
    } else facets.inOptions ??= items.map((item) => item.value)
  }

  for (const quad of store.getQuads(shape, `${SH}pattern`, null, null)) facets.patterns.push(quad.object.value)
  facets.minLength ??= intValue(objectValue(store, shape, `${SH}minLength`))
  facets.maxLength ??= intValue(objectValue(store, shape, `${SH}maxLength`))
  facets.minValue ??= floatValue(objectValue(store, shape, `${SH}minInclusive`))
  facets.maxValue ??= floatValue(objectValue(store, shape, `${SH}maxInclusive`))

  if (branch) return

  // sh:not excludes values; there is no "everything except" input.
  if (store.getQuads(shape, `${SH}not`, null, null).length) {
    notes.add('partial', 'Some values are explicitly excluded (sh:not); the exclusion only applies while the file stays attached.', scope)
  }

  for (const quad of store.getQuads(shape, `${SH}or`, null, null)) {
    const branches = listItems(store, quad.object as Quad_Subject)
    if (!branches?.length) {
      notes.add('partial', 'An sh:or alternative is malformed and was skipped.', scope)
      continue
    }
    if (isNumberOr(store, branches)) {
      facets.numberOr = true
      continue
    }
    // Any other alternative: take the first branch as the field's shape (it is
    // the primary form in every generator we have seen — the real value, with
    // fallbacks such as "missing" tokens listed after it) and say so.
    const first = branches[0]
    if (first.termType === 'BlankNode' || first.termType === 'NamedNode') {
      readFacets(store, first as Quad_Subject, facets, scope, notes, true)
    }
    notes.add('partial', `The value may also take ${branches.length - 1} alternative ${branches.length === 2 ? 'form' : 'forms'} (for example an "unknown" placeholder); the input follows the first form only.`, scope)
  }
}

interface ResolvedKind {
  kind: ProfileValueKind
  entityTypes?: string[]
  entitySources?: ProfilePropertyRule['entitySources']
  enumOptions?: string[]
  pattern?: string
}

function resolveKind(
  store: Store,
  path: string,
  facets: Facets,
  scope: string,
  notes: Notes,
): ResolvedKind {
  const patternSet = new Set(facets.patterns)
  const takePattern = (expected: string): boolean => patternSet.delete(expected)

  let kind: ProfileValueKind
  let entityTypes: string[] | undefined
  let entitySources: ProfilePropertyRule['entitySources']
  let enumOptions: string[] | undefined

  const referencesEntity = Boolean(facets.classIri) || facets.nodeIris.length > 0 || facets.nodeKindIri

  if (referencesEntity && !facets.datatype && !facets.inOptions) {
    kind = 'entity'
    if (facets.classIri) {
      entityTypes = [facets.classIri]
      // Projection emits class+node for describe-new rules; absent
      // entitySources is the stored form of ['new'].
    } else {
      // A bare sh:node / sh:nodeKind sh:IRI is the reuse-allowing form; the
      // original single-source policy is not recoverable (documented lossy).
      entitySources = [...ALL_ENTITY_SOURCES]
      const nodeTargets = facets.nodeIris
        .map((node) => targetTypeOfShape(store, node))
        .filter((value): value is string => Boolean(value))
      if (nodeTargets.length) entityTypes = [nodeTargets[0]]
    }
  } else if (facets.numberOr) {
    kind = 'number'
  } else if (facets.inOptions) {
    kind = 'enum'
    enumOptions = facets.inOptions
  } else if (facets.datatype === `${XSD}integer` || facets.datatype === `${XSD}int` || facets.datatype === `${XSD}long`) {
    kind = 'integer'
  } else if (facets.datatype === `${XSD}double` || facets.datatype === `${XSD}float` || facets.datatype === `${XSD}decimal`) {
    kind = 'number'
  } else if (facets.datatype === `${XSD}boolean`) {
    kind = 'boolean'
  } else if (facets.datatype === `${XSD}date`) {
    kind = 'date'
  } else if (facets.datatype === `${XSD}dateTime`) {
    kind = 'datetime'
  } else if (facets.datatype === `${XSD}anyURI`) {
    kind = 'url'
  } else if (facets.datatype === `${XSD}string` || facets.datatype === undefined) {
    // Kind-derived patterns round-trip to their kinds; leftover patterns stay
    // author constraints.
    if (takePattern(EMAIL_PATTERN)) kind = 'email'
    else if (takePattern(URL_PATTERN)) kind = 'url'
    else if (takePattern(DATE_PATTERN)) kind = 'date'
    else if (takePattern(DATETIME_PATTERN)) kind = 'datetime'
    // A file that only says "the root Dataset must have a license" says nothing
    // about the input; the RO-Crate baseline terms have one obvious form each,
    // and the builder locks these four rules anyway.
    else kind = baselineKind(path) ?? 'text'
  } else {
    notes.add('partial', `Values are typed ${shortIri(facets.datatype)}, which the builder has no input for; a text input was used instead.`, scope)
    kind = 'text'
  }

  // hasPart is always the crate's attached files: the dataset dialog binds it to
  // the data-references section, and a scalar rule there cannot be filled in.
  if (isHasPartUri(path) && kind !== 'entity') {
    kind = 'entity'
    entityTypes = [`${SCHEMA_ORG}MediaObject`, SCHEMA_DATASET]
    enumOptions = undefined
    notes.add('partial', 'hasPart lists the files attached to the crate, so it was imported as a file reference.', scope)
  }
  if (kind === 'entity' && !entityTypes?.length) {
    entityTypes = [`${SCHEMA_ORG}Thing`]
    notes.add('partial', 'A reference does not say which type it points at; it was imported as a reference to any Thing.', scope)
  }

  const leftovers = [...patternSet]
  if (leftovers.length > 1) {
    notes.add('partial', 'Several patterns apply to one value; only the first became an editable constraint.', scope)
  }

  return { kind, entityTypes, entitySources, enumOptions, pattern: leftovers[0] }
}

// The four RO-Crate root-Dataset baseline terms and the input each one is
// always rendered with (the builder re-locks them on import, see
// draftFromPropertyRule).
const BASELINE_KINDS: Array<[string, ProfileValueKind]> = [
  [`${SCHEMA_ORG}description`, 'longtext'],
  [`${SCHEMA_ORG}datePublished`, 'date'],
  [`${SCHEMA_ORG}license`, 'url'],
]

function baselineKind(path: string): ProfileValueKind | undefined {
  return BASELINE_KINDS.find(([uri]) => sameSchemaOrgType(path, uri))?.[1]
}

// The type a referenced node shape describes: its target class, else the class
// it requires of its values.
function targetTypeOfShape(store: Store, shapeIri: string): string | undefined {
  const subject = namedOrBlank(shapeIri)
  return objectValue(store, subject, `${SH}targetClass`) ?? objectValue(store, subject, `${SH}class`)
}

// True when the sh:or branches are exactly the projection's number form:
// ( [ sh:datatype xsd:double ] [ sh:datatype xsd:integer ] ) in either order.
function isNumberOr(store: Store, items: Quad_Object[]): boolean {
  if (items.length !== 2) return false
  const datatypes = items.map((item) => {
    if (item.termType !== 'BlankNode' && item.termType !== 'NamedNode') return ''
    const quads = store.getQuads(item as Quad_Subject, null, null, null)
    if (quads.length !== 1 || quads[0].predicate.value !== `${SH}datatype`) return ''
    return quads[0].object.value
  })
  return new Set(datatypes).size === 2 && datatypes.includes(`${XSD}double`) && datatypes.includes(`${XSD}integer`)
}

// The projection's "no entries at all, or at least N" node-level alternative,
// read back as a minItems for the path it constrains.
function readEntryCountOr(store: Store, head: Quad_Subject): { path: string; minItems: number } | undefined {
  const branches = listItems(store, head)
  if (branches?.length !== 2) return undefined
  let path: string | undefined
  let minItems: number | undefined
  let sawEmpty = false
  for (const branch of branches) {
    if (branch.termType !== 'BlankNode' && branch.termType !== 'NamedNode') return undefined
    const properties = store.getQuads(branch as Quad_Subject, `${SH}property`, null, null)
    if (properties.length !== 1) return undefined
    const inner = properties[0].object as Quad_Subject
    const innerPath = objectValue(store, inner, `${SH}path`)
    if (!innerPath || (path && path !== innerPath)) return undefined
    path = innerPath
    const max = intValue(objectValue(store, inner, `${SH}maxCount`))
    const min = intValue(objectValue(store, inner, `${SH}minCount`))
    if (max === 0) sawEmpty = true
    else if (min !== undefined) minItems = min
    else return undefined
  }
  return sawEmpty && path && minItems !== undefined ? { path, minItems } : undefined
}

// The projection's by-name required instance: [ sh:property [ sh:path
// schema:name ; sh:hasValue "…" ] ]. Returns undefined for any other structure.
function readQualifiedName(store: Store, shape: Quad_Subject): string | undefined {
  const properties = store.getQuads(shape, `${SH}property`, null, null)
  if (properties.length !== 1) return undefined
  const inner = properties[0].object as Quad_Subject
  if (objectValue(store, inner, `${SH}path`) !== `${SCHEMA_ORG}name`) return undefined
  const quads = store.getQuads(inner, `${SH}hasValue`, null, null)
  return quads.length === 1 && quads[0].object.termType === 'Literal' ? quads[0].object.value : undefined
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

// Two shapes in one file can map to the same compact term (opaque numeric term
// IRIs in particular); the builder blocks duplicate names, so suffix them here.
function dedupeValueNames(rules: ProfilePropertyRule[]) {
  const taken = new Set<string>()
  for (const rule of rules) {
    if (!taken.has(rule.valueName)) {
      taken.add(rule.valueName)
      continue
    }
    let n = 2
    while (taken.has(`${rule.valueName}${n}`)) n++
    rule.valueName = `${rule.valueName}${n}`
    rule.id = rule.valueName
    taken.add(rule.valueName)
  }
}

function classNameFor(type: string): string {
  const raw = termNameFromUri(type).replace(/[^A-Za-z0-9]+/g, '')
  const named = /^[A-Za-z]/.test(raw) ? raw : `Type${raw}`
  return named[0].toUpperCase() + named.slice(1)
}

// A compact term name that always satisfies isValidPropertyTermName. Opaque
// numeric terms (MIxS and other OBO-style IRIs) keep their digits behind a `p`
// prefix so they stay distinct from each other.
function propertyNameFor(path: string): string {
  const raw = termNameFromUri(path).replace(/[^A-Za-z0-9]+/g, '')
  if (!raw) return 'value'
  const candidate = raw[0].toLowerCase() + raw.slice(1)
  return isValidPropertyTermName(candidate) ? candidate : `p${candidate}`
}

// A readable field label: the term's own name when it has one, else its
// prefixed name from the file's own @prefix declarations (mixs:0001107 reads
// better than 0001107), else the raw IRI.
function labelForPath(path: string, prefixes: Record<string, string>): string {
  const local = termNameFromUri(path)
  if (/[A-Za-z]/.test(local)) return humanLabel(local)
  return toCurie(path, prefixes) || local || path
}

function humanLabel(value: string): string {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : ''
}

function toCurie(iri: string, prefixes: Record<string, string>): string {
  let best = ''
  let bestPrefix = ''
  for (const [prefix, namespace] of Object.entries(prefixes)) {
    if (prefix && iri.startsWith(namespace) && namespace.length > best.length) {
      best = namespace
      bestPrefix = prefix
    }
  }
  return best ? `${bestPrefix}:${iri.slice(best.length)}` : ''
}

// Required-instance ids are stored the way the crate writes them: crate-local
// paths stay relative, absolute URIs pass through.
function crateLocalValue(value: string): string {
  return value.startsWith(CRATE_BASE_IRI) ? value.slice(CRATE_BASE_IRI.length) : value
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
  return term.termType === 'BlankNode' ? 'an inline shape' : shortIri(term.value)
}

function shortIri(value: string | undefined): string {
  if (!value) return '(none)'
  const hash = value.lastIndexOf('#')
  if (hash >= 0 && hash < value.length - 1) return value.slice(hash + 1)
  return value
}
