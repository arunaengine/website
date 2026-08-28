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
import { CURATED_ENTITY_TYPES } from '../profiles/entityTypes'
import { CURATED_PROPERTY_TERMS, type PropertyTermOption } from '../profiles/propertyCatalog'
import { isHasPartUri } from '../profiles/emit'
import {
  ARUNA_PROFILE_PREFIX,
  isDatasetType,
  isValidPropertyTermName,
  sameSchemaOrgType,
  SCHEMA_ORG,
  termNameFromUri,
} from '../profiles/uri'
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
// arbitrary sh:or, or sh:nodeKind sh:Literal, which is most generated SHACL, so
// authors got a default draft and no fields.)
//
// Two note kinds, both surfaced to the author:
//   'partial'  - a field WAS generated, but this detail is not editable here and
//                only keeps working while the file stays attached.
//   'no-field' - nothing in the builder represents this at all (cross-property
//                SPARQL rules, shapes pinned to one specific node).
// A file with any note should stay attached as shapes.custom.ttl so the parts we
// could not model keep validating alongside the generated shapes.
//
// This module imports n3, so UI callers must load it via dynamic import; the
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
//   recognized as one 'number' rule; an sh:or whose branches only pick a type
//   becomes one rule with every branch as a target type; any other sh:or
//   contributes its FIRST branch's facets and reports the alternatives as a note.
// - a value shape (sh:node, or an sh:class naming a shape) supplies the target
//   type and its rules become that type's own form; where the file names no
//   type, the shape's name and then the term's documented range are used, and
//   only a term neither describes falls back to a reference to any Thing.
// - sh:node BETWEEN two node shapes is composition ("values must also conform to
//   the base shape"), the SHACL idiom for a shared base. The base's property
//   shapes, sh:class and node kind are folded into every shape that names it,
//   transitively, so a chain shape -> shape -> shape resolves to one form per
//   referenced type instead of a reference to a type with no rules.
// - a referenced shape that only constrains a LITERAL (sh:datatype, sh:in, or an
//   sh:or whose branches only pick datatypes) is the value itself, not an entity:
//   its facets are inlined into the referencing rule and the chain ends there.

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

// Reactive caches hand out DeepReadonly notes; copy them back into the
// mutable LiftNote shape the presentation components declare.
export function cloneLiftNotes(
  notes: readonly { readonly kind: LiftNote['kind']; readonly message: string; readonly scopes: readonly string[] }[],
): LiftNote[] {
  return notes.map((note) => ({ kind: note.kind, message: note.message, scopes: [...note.scopes] }))
}

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const RDF_FIRST = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first'
const RDF_REST = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'
const RDF_NIL = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil'
const SCHEMA_DATASET = `${SCHEMA_ORG}Dataset`
const DCT_CONFORMS_TO = 'http://purl.org/dc/terms/conformsTo'
const HTTPS_SCHEMA_ORG = 'https://schema.org/'
// Namespace for a type minted from a shape name when the shape's own IRI has no
// http(s) namespace to mint into. A file written with a relative base resolves
// against CRATE_BASE_IRI, so minting beside the shape would leak arcp:// types
// (which are not classes of anything) into the exported profile.
const IMPORTED_TYPE_NS = `${ARUNA_PROFILE_PREFIX}imported#`
// Composition chains are walked with a visited set, so a cycle terminates; the
// depth cap is a second backstop against a pathological generated file.
const MAX_BASE_DEPTH = 32
// A profile with more entity rules than this would render an unusable outline.
// Real files sit far below it (the Bioschemas ChemicalSubstance binding yields
// nine), so the cap only ever fires on generated input.
const MAX_ENTITIES = 50

// schema.org is written both http and https in the wild, and a file may mix the
// two. The portal's own form is http (uri.ts SCHEMA_ORG), and a profile holding
// both would bind one compact term to two different URIs, so every term and type
// IRI is canonicalized as it enters the rule model.
function canonicalIri(value: string): string {
  return value.startsWith(HTTPS_SCHEMA_ORG) ? `${SCHEMA_ORG}${value.slice(HTTPS_SCHEMA_ORG.length)}` : value
}

// The portal's own catalogue entry for a property term: the same value kind and
// target types the builder applies when an author picks the term by hand, used
// only where the file itself states nothing.
function catalogTerm(path: string): PropertyTermOption | undefined {
  return CURATED_PROPERTY_TERMS.find((term) => sameSchemaOrgType(term.uri, path))
}

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
  // Composition: the base shape's rules are folded into this one (buildShapeIndex).
  `${SH}node`,
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
  // Read, but only partly representable; each reports its own note.
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

// What the file says about the node shapes it declares, built once so grouping a
// shape into an entity and resolving a reference TO that shape can never
// disagree about which type it describes. Keys are termKey values.
interface ShapeIndex {
  // The types each node shape describes. Several when the file states a union
  // (an rdf:type sh:in list, or an sh:or over rdf:type alternatives); the FIRST
  // is the type its own form is built for, the rest travel as extra targets.
  types: Map<string, string[]>
  // Shapes whose type had to be read off their own name because the file names
  // no class for them.
  derived: Set<string>
  // Shapes a property references as the shape its VALUES must conform to, rather
  // than as a class those values belong to.
  valueShapes: Set<string>
  // Shapes that only constrain a literal value; a reference to one of these is
  // the value itself, so its facets are inlined and the chain ends there.
  values: Set<string>
  // Property shapes each node shape contributes, base shapes first (sh:node
  // composition, resolved transitively) and its own last, so a shape's own
  // constraint on a path merges over the one it inherits.
  properties: Map<string, Quad_Subject[]>
  // Shapes named as a base by another shape. One that describes no type of its
  // own is a mixin: it is fully absorbed into the shapes that name it.
  bases: Set<string>
  // Every node shape this file declares, so a reference to a shape that is not
  // here is reported instead of silently resolving to nothing.
  known: Set<string>
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
  // sh:not), never top-level node shapes.
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
  // the crate root. A PROPERTY-level sh:node is deliberately NOT in this list:
  // the projection emits `sh:node <root shape>` for any rule whose target type
  // is the crate's own dataset, and that must not stop the root shape being
  // recognized. A value shape that pins a class is grouped under that class
  // anyway, so it never reaches the root fallback. validate.ts binds root
  // targets by the same rule, so the two cannot disagree about which shape is
  // the root.
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

  const index = buildShapeIndex(store, nodeShapes, notes)
  const groups = new Map<string, ShapeGroup>()

  for (const shape of nodeShapes.values()) {
    const shapeKey = termKey(shape)
    const name = shortTerm(shape)

    // A shape that only constrains a literal IS a value: it is inlined wherever
    // it is referenced (readFacets) and never becomes a form of its own.
    if (index.values.has(shapeKey)) continue

    // A base shape that describes no type of its own is a mixin: every shape
    // naming it already carries its rules, so it contributes nothing separately.
    if (index.bases.has(shapeKey) && !index.types.get(shapeKey)?.length && !index.valueShapes.has(shapeKey)) {
      continue
    }

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
    const targetIri = targetClasses.find((term) => term.termType === 'NamedNode')?.value
    const targetClass = targetIri ? canonicalIri(targetIri) : undefined
    if (targetClasses.length && !targetClass) {
      notes.add('no-field', 'Shape target class is not a plain IRI, so its rules could not be imported.', name)
    }
    const classIri = store.getQuads(shape, `${SH}class`, null, null)
      .find((quad) => quad.object.termType === 'NamedNode')?.object.value
    const nodeClass = classIri ? canonicalIri(classIri) : undefined
    const hasTargetNode = store.getQuads(shape, `${SH}targetNode`, null, null).length > 0

    const info: ShapeInfo = {
      subject: shape,
      name,
      targetClass,
      nodeClass,
      hasTargetNode,
      referenced: referenced.has(termKey(shape)),
      shapeLabel: literalValue(store, shape, `${SH}name`),
      // Base shapes first, own last: composition (sh:node between node shapes)
      // means the base's rules apply here too.
      propertyShapes: index.properties.get(shapeKey) ?? [],
    }

    // A shape another property points at describes the entities that property
    // references, so it becomes their own form, never the crate root, which is
    // what a target-less shape falls back to.
    const indexed = index.types.get(shapeKey)?.[0]
    if (indexed && index.derived.has(shapeKey)) {
      notes.add('partial', `${name} names no class for the entities it describes, so its rules were imported as ${shortIri(indexed)}, taken from the shape name.`, name)
    }
    const key = targetClass ?? nodeClass ?? indexed ?? (info.referenced ? undefined : ROOT_KEY)

    // A shape pinned to one specific node describes that node, not a class of
    // entities an author fills in, unless the file does say which type that node
    // is, in which case the rules belong to that type's form (the usual "this one
    // entity must conform to the shape for its class" binding).
    if (hasTargetNode && (!key || key === ROOT_KEY)) {
      notes.add('no-field', 'Shape applies to one specific node rather than a type of entity, so it generates no input.', name)
      continue
    }
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
      // An alternative whose branches only pin an rdf:type states the entity's
      // type; it was already read into the shape's target types.
      else if (!typeUnionOr(store, listItems(store, quad.object as Quad_Subject))?.length) {
        notes.add('partial', 'A shape-level sh:or alternative has no builder equivalent and only applies while the file stays attached.', name)
      }
    }
  }

  // Which group drives the root dataset form: the target-less group the
  // projection emits, else a group typed dataset, else a group whose shapes
  // merely REQUIRE schema:Dataset (the common "my class is also a dataset"
  // form). That one gets retyped, which is worth a note.
  const ordered = [...groups.values()]
  const rootGroup =
    ordered.find((group) => group.key === ROOT_KEY) ??
    ordered.find((group) => isDatasetType(group.key)) ??
    ordered.find((group) => group.datasetAsserted)
  if (rootGroup && rootGroup.key !== ROOT_KEY && !isDatasetType(rootGroup.key)) {
    const asserting = rootGroup.shapes.find((shape) => isDatasetType(shape.nodeClass ?? shape.targetClass ?? ''))
    notes.add(
      'partial',
      `Rules targeting ${shortIri(rootGroup.key)} were imported onto the Root dataset. Crates written here are typed dataset only, so shapes targeting ${shortIri(rootGroup.key)} in the attached file will not match anything.`,
      asserting?.name ?? rootGroup.shapes[0]?.name,
    )
  }

  const entities: ProfileEntityRule[] = []
  const usedIds = new Set<string>()
  // The builder blocks two rules sharing a class name, so a second type whose
  // local name collides is suffixed here rather than importing an unsaveable draft.
  const usedClassNames = new Set<string>()

  for (const group of ordered) {
    if (entities.length >= MAX_ENTITIES) {
      notes.add('no-field', `The file describes more than ${MAX_ENTITIES} types of entity; rules were imported for the first ${MAX_ENTITIES}.`, group.shapes[0]?.name)
      break
    }
    const isRoot = group === rootGroup
    const type = isRoot ? SCHEMA_DATASET : group.key
    const className = classNameFor(type)
    const scopeName = isRoot ? 'Root dataset' : className
    // Every type the group's shapes state, so an rdf:type constraint naming any
    // member of a union is recognized as the type marker it is.
    const groupTypes = [type, ...group.shapes.flatMap((shape) => index.types.get(termKey(shape.subject)) ?? [])]

    // Group every property shape in the group by path, so the presence / value /
    // recommended shapes a generator splits a single field across merge back
    // into one rule, including when they live in SEPARATE node shapes that
    // share a target class.
    const byPath = new Map<string, Quad_Subject[]>()
    const pathOrder: string[] = []
    // Two shapes of one group can inherit the SAME base, so the base's property
    // shapes arrive twice; reading one twice would double its fixed values.
    const seenPropertyShapes = new Set<string>()
    for (const shape of group.shapes) {
      for (const propertyShape of shape.propertyShapes) {
        if (seenPropertyShapes.has(termKey(propertyShape))) continue
        seenPropertyShapes.add(termKey(propertyShape))
        const paths = store.getQuads(propertyShape, `${SH}path`, null, null).map((quad) => quad.object)
        const path = paths.length === 1 && paths[0].termType === 'NamedNode' ? canonicalIri(paths[0].value) : undefined
        if (!path) {
          notes.add('no-field', paths.length
            ? 'A property uses a SHACL path expression (a sequence, alternative or inverse path) that no single input can represent.'
            : 'A property shape has no sh:path, so no input could be derived from it.', shape.name)
          continue
        }
        // An rdf:type constraint states what the entity IS; it became the entity's
        // type above and would only render as a field the author must not edit.
        if (path === RDF_TYPE) {
          const asserted = typesFromRdfProperty(store, propertyShape)
          if (!asserted.length || !asserted.some((candidate) => groupTypes.some((known) => sameSchemaOrgType(candidate, known)))) {
            notes.add('partial', 'A required rdf:type value has no input of its own; entities carry the type of the shape they were imported into.', shape.name)
          }
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
      const rule = liftRuleGroup(store, path, byPath.get(path) ?? [], scopeName, notes, prefixes, index)
      if (!rule) continue
      const minItems = group.entryCounts.get(path)
      if (minItems !== undefined && rule.multipleValues) rule.minItems = minItems
      rules.push(rule)
    }
    rules.sort(compareRuleOrder)
    dedupeValueNames(rules)

    // An entity rule with no rules of its own is rejected by the builder, so a
    // shape that describes nothing editable stays out of the draft entirely.
    if (!rules.length) continue

    const uniqueClassName = uniqueName(className, usedClassNames)
    const baseId = uniqueClassName.toLowerCase()
    let id = baseId
    for (let n = 2; usedIds.has(id); n++) id = `${baseId}-${n}`
    usedIds.add(id)

    entities.push({
      id,
      label: isRoot ? 'Root dataset' : group.label || humanLabel(uniqueClassName),
      description: '',
      type,
      className: uniqueClassName,
      propertyRules: rules,
    })
  }

  // Root dataset first: the builder's outline opens on it.
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

// sh:order decides; ties (including every rule of a file that declares no order
// at all) fall back to label then term, so an unordered import is stable and
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
  // sh:node objects kept as terms, so an inline (blank) value shape stays
  // distinguishable from a named one.
  nodeTargets: Term[]
  // Classes and shapes an sh:or offers as ALTERNATIVE targets: a genuine union
  // the rule model expresses as several target types, unlike the conjunctive
  // facets above.
  unionClasses: string[]
  unionNodes: Term[]
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
  return { nodeTargets: [], unionClasses: [], unionNodes: [], nodeKindIri: false, patterns: [], numberOr: false }
}

function liftRuleGroup(
  store: Store,
  path: string,
  shapes: Quad_Subject[],
  ownerName: string,
  notes: Notes,
  prefixes: Record<string, string>,
  index: ShapeIndex,
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

    readFacets(store, shape, facets, scope, notes, index, false)

    for (const quad of store.getQuads(shape, `${SH}hasValue`, null, null)) hasValues.push(quad.object)
    for (const quad of store.getQuads(shape, `${SH}qualifiedValueShape`, null, null)) {
      const qualified = quad.object as Quad_Subject
      const name = readQualifiedName(store, qualified)
      if (name !== undefined) {
        requiredInstances.push({ name })
      } else if (objectValue(store, qualified, `${SH}class`) || store.getQuads(qualified, `${SH}node`, null, null).length) {
        // The usual form only pins the TYPE of the qualifying entries, which is
        // exactly this rule's target type; only the "some of them" part is lost.
        readFacets(store, qualified, facets, scope, notes, index, true)
        notes.add('partial', 'Only some of the values have to match the referenced type; the builder applies it to every value.', scope)
      } else {
        notes.add('partial', 'A qualified value shape restricts part of a list in a way the builder cannot edit; it stays in the attached file.', scope)
      }
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

  const { kind, entityTypes, entitySources, enumOptions, pattern } = resolveKind(path, facets, index, scope, notes)

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
  index: ShapeIndex,
  branch: boolean,
) {
  const datatype = objectValue(store, shape, `${SH}datatype`)
  if (datatype) facets.datatype ??= datatype
  const classIri = objectValue(store, shape, `${SH}class`)
  if (classIri) facets.classIri ??= classIri
  for (const quad of store.getQuads(shape, `${SH}node`, null, null)) {
    // A referenced shape that only constrains a literal IS the value: its facets
    // belong to this rule and the chain ends there (a value shape never names a
    // base of its own, so this cannot recurse further).
    if (index.values.has(termKey(quad.object))) {
      readFacets(store, quad.object as Quad_Subject, facets, scope, notes, index, true)
      continue
    }
    facets.nodeTargets.push(quad.object)
  }

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

  // sh:not excludes values; there is no "everything except" input.
  if (!branch && store.getQuads(shape, `${SH}not`, null, null).length) {
    notes.add('partial', 'Some values are explicitly excluded (sh:not); the exclusion only applies while the file stays attached.', scope)
  }

  for (const quad of store.getQuads(shape, `${SH}or`, null, null)) {
    const branches = listItems(store, quad.object as Quad_Subject)
    if (!branches?.length) {
      if (!branch) notes.add('partial', 'An sh:or alternative is malformed and was skipped.', scope)
      continue
    }
    if (isNumberOr(store, branches)) {
      facets.numberOr = true
      continue
    }
    // An alternative over datatypes alone (the usual "plain or language-tagged
    // string" form) is one value with several literal types; the first is the one
    // the input is built for and nothing is lost, so no note.
    const alternation = datatypeAlternation(store, branches)
    if (alternation) {
      facets.datatype ??= alternation
      continue
    }
    if (branch) continue
    // An alternative whose branches only pick a type is a union of target types,
    // which an entity rule holds in full; no branch is lost, so no note.
    const union = unionTargets(store, branches, index)
    if (union) {
      facets.unionClasses.push(...union.classes)
      facets.unionNodes.push(...union.nodes)
      continue
    }
    // Any other alternative: take the first branch as the field's shape (it is
    // the primary form in every generator we have seen: the real value, with
    // fallbacks such as "missing" tokens listed after it) and say so.
    const first = branches[0]
    if (first.termType === 'BlankNode' || first.termType === 'NamedNode') {
      readFacets(store, first as Quad_Subject, facets, scope, notes, index, true)
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
  path: string,
  facets: Facets,
  index: ShapeIndex,
  scope: string,
  notes: Notes,
): ResolvedKind {
  const patternSet = new Set(facets.patterns)
  const takePattern = (expected: string): boolean => patternSet.delete(expected)

  let kind: ProfileValueKind
  let entityTypes: string[] | undefined
  let entitySources: ProfilePropertyRule['entitySources']
  let enumOptions: string[] | undefined

  const namesTarget =
    Boolean(facets.classIri) ||
    facets.nodeTargets.length > 0 ||
    facets.unionClasses.length > 0 ||
    facets.unionNodes.length > 0
  // A term the catalogue describes as holding a URL and referencing nothing
  // (license, identifier, url, sameAs), with nothing said about it beyond "the
  // value is an IRI", is that URL, not a reference to an entity of unknown
  // type. Trade-off: an entity rule on one of those terms that allowed only
  // external reuse comes back as a URL field, the same form it emitted.
  const urlCatalog = catalogTerm(path)
  const urlTerm =
    !namesTarget &&
    facets.nodeKindIri &&
    urlCatalog?.suggestedKind === 'url' &&
    !urlCatalog.suggestedEntityTypes?.length
  const referencesEntity = namesTarget || (facets.nodeKindIri && !urlTerm)

  if (referencesEntity && !facets.datatype && !facets.inOptions) {
    kind = 'entity'
    const targets: string[] = []
    const addTarget = (uri: string | undefined) => {
      const canonical = uri && canonicalIri(uri)
      if (canonical && !targets.some((target) => sameSchemaOrgType(target, canonical))) targets.push(canonical)
    }
    // A class IRI names the class, unless it points at a shape, which says which
    // type its values are instead.
    const classTarget = (uri: string) => index.types.get(termKey(namedNode(uri))) ?? [uri]
    if (facets.classIri) {
      // Projection emits class+node for describe-new rules; absent entitySources
      // is the stored form of ['new'].
      classTarget(facets.classIri).forEach(addTarget)
    } else {
      // A bare sh:node / sh:nodeKind sh:IRI is the reuse-allowing form; the
      // original single-source policy is not recoverable (documented lossy).
      entitySources = [...ALL_ENTITY_SOURCES]
    }
    for (const uri of facets.unionClasses) classTarget(uri).forEach(addTarget)
    for (const node of [...facets.nodeTargets, ...facets.unionNodes]) {
      const resolved = index.types.get(termKey(node))
      if (resolved?.length) resolved.forEach(addTarget)
      // A shape reference alongside sh:class only repeats the class, so an
      // unresolvable one there says nothing extra and needs no note.
      else if (!facets.classIri) notes.add('partial', unresolvedShapeMessage(index, node), scope)
    }
    if (targets.length) entityTypes = targets
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
    // A file that only says "the root dataset must have a license" says nothing
    // about the input; the RO-Crate baseline terms have one obvious form each,
    // and the builder locks these four rules anyway. Beyond those, a term the
    // portal's own catalogue describes is imported the way the builder would
    // create it, but only when the file states nothing about the value at all.
    else {
      const catalog = facets.datatype === undefined && !facets.patterns.length ? catalogTerm(path) : undefined
      kind = baselineKind(path) ?? catalog?.suggestedKind ?? 'text'
      if (kind === 'entity') {
        entityTypes = catalog?.suggestedEntityTypes ? [...catalog.suggestedEntityTypes] : undefined
        entitySources = [...ALL_ENTITY_SOURCES]
      }
      if (catalog && kind !== 'text' && kind !== baselineKind(path)) {
        notes.add('partial', 'The file states no value type here, so the term was imported in its usual form.', scope)
      }
    }
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
    // The file names no type for the reference. The term's own documented range
    // is the next best statement of what it points at; only a term the catalogue
    // does not describe falls back to any Thing.
    const range = catalogTerm(path)?.suggestedEntityTypes?.filter((type) => type !== `${SCHEMA_ORG}Thing`)
    if (range?.length) {
      entityTypes = [...range]
      notes.add('partial', 'The reference does not say which type it points at; the term’s usual target types were used.', scope)
    } else {
      entityTypes = [`${SCHEMA_ORG}Thing`]
      notes.add('partial', 'A reference does not say which type it points at; it was imported as a reference to any Thing.', scope)
    }
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

// Why a shape reference could not be pointed at a type.
function unresolvedShapeMessage(index: ShapeIndex, node: Term): string {
  if (node.termType === 'BlankNode') {
    return 'A referenced shape is written inline, so the rules it describes could not be imported as their own form.'
  }
  if (!index.known.has(termKey(node))) {
    return `The shape ${shortIri(node.value)} these values must match is not in this file, so its rules could not be imported.`
  }
  return `The shape ${shortIri(node.value)} these values must match names no type, so the reference points at no entity.`
}

// Which shapes describe the values of a property, and what type each node shape
// describes. `sh:node` paired with `sh:class` on the same property shape states
// the class its values belong to (the form this projection emits, including for
// the crate root), so only a BARE reference makes its target a shape in its own
// right; an `sh:class` that points at a shape rather than a class is one too.
function buildShapeIndex(store: Store, nodeShapes: Map<string, Quad_Subject>, notes: Notes): ShapeIndex {
  // A PROPERTY naming a shape says its values must conform to it. A node-level
  // sh:node is composition, not a value reference, so it never lands here.
  const valueShapes = new Set<string>()
  for (const quad of store.getQuads(null, `${SH}node`, null, null)) {
    if (nodeShapes.has(termKey(quad.subject))) continue
    if (!store.getQuads(quad.subject, `${SH}class`, null, null).length) valueShapes.add(termKey(quad.object))
  }
  for (const quad of store.getQuads(null, `${SH}class`, null, null)) {
    if (nodeShapes.has(termKey(quad.object))) valueShapes.add(termKey(quad.object))
  }

  const values = new Set<string>()
  for (const [key, shape] of nodeShapes) {
    if (isValueShape(store, shape)) values.add(key)
  }

  // sh:node between two node shapes composes them: the base's rules apply to
  // every shape naming it. Bases are resolved first so the chain is walked once.
  const bases = new Set<string>()
  const baseShapes = new Map<string, Quad_Subject[]>()
  for (const [key, shape] of nodeShapes) {
    const own: Quad_Subject[] = []
    for (const quad of store.getQuads(shape, `${SH}node`, null, null)) {
      const base = nodeShapes.get(termKey(quad.object))
      if (!base || values.has(termKey(quad.object))) continue
      bases.add(termKey(quad.object))
      own.push(base)
    }
    baseShapes.set(key, own)
  }

  const walk: BaseWalk = { store, nodeShapes, baseShapes, chains: new Map(), notes }
  const properties = new Map<string, Quad_Subject[]>()
  for (const key of nodeShapes.keys()) {
    properties.set(key, composedProperties(walk, key))
  }

  const types = new Map<string, string[]>()
  const derived = new Set<string>()
  for (const [key, shape] of nodeShapes) {
    if (values.has(key)) continue
    const asserted = shapeTypes(store, shape, nodeShapes, baseChain(walk, key), properties.get(key) ?? [])
    if (asserted.length) {
      types.set(key, asserted.map(canonicalIri))
      continue
    }
    // Only a shape something references as a value shape may fall back to its
    // own name: every other target-less shape is the crate root candidate.
    const named = valueShapes.has(key) && shape.termType === 'NamedNode' ? typeFromShapeName(shape.value) : undefined
    if (named) {
      types.set(key, [canonicalIri(named)])
      derived.add(key)
    }
  }
  return { types, derived, valueShapes, values, properties, bases, known: new Set(nodeShapes.keys()) }
}

// Shared state of the base-composition walk. One walk per lift, so every shape
// chain is resolved once and reused by both the property and the type reads.
interface BaseWalk {
  store: Store
  nodeShapes: Map<string, Quad_Subject>
  baseShapes: Map<string, Quad_Subject[]>
  chains: Map<string, Quad_Subject[]>
  notes: Notes
}

// Every shape a shape composes through sh:node, transitively, bases first and
// the shape itself last, so what a shape states always follows what it
// inherits. Memoized per shape: an uncached walk re-explores every path through
// a wide, deep base lattice, which a crafted file turns into a hang. Cycles are
// cut where they close and the cut chain is what gets memoized, so the walk
// stays linear; the depth cap is a second backstop and reports itself.
function baseChain(walk: BaseWalk, key: string, seen = new Set<string>(), depth = 0): Quad_Subject[] {
  const cached = walk.chains.get(key)
  if (cached) return cached
  const shape = walk.nodeShapes.get(key)
  if (!shape || seen.has(key)) return []
  if (depth > MAX_BASE_DEPTH) {
    walk.notes.add(
      'partial',
      `Shapes composed more than ${MAX_BASE_DEPTH} levels deep were not read, so rules inherited through them are missing.`,
      shortTerm(shape),
    )
    return []
  }
  seen.add(key)
  const chain: Quad_Subject[] = []
  const taken = new Set<string>()
  for (const base of walk.baseShapes.get(key) ?? []) {
    for (const item of baseChain(walk, termKey(base), seen, depth + 1)) {
      if (taken.has(termKey(item))) continue
      taken.add(termKey(item))
      chain.push(item)
    }
  }
  seen.delete(key)
  chain.push(shape)
  walk.chains.set(key, chain)
  return chain
}

// A shape's own property shapes with every base shape's folded in ahead of them,
// so its own constraint on a path merges over the one it inherits.
function composedProperties(walk: BaseWalk, key: string): Quad_Subject[] {
  const collected: Quad_Subject[] = []
  const taken = new Set<string>()
  for (const shape of baseChain(walk, key)) {
    for (const quad of walk.store.getQuads(shape, `${SH}property`, null, null)) {
      const propertyShape = quad.object as Quad_Subject
      if (taken.has(termKey(propertyShape))) continue
      taken.add(termKey(propertyShape))
      collected.push(propertyShape)
    }
  }
  return collected
}

// True when a shape says nothing about an entity, only about a literal: no
// properties, no class, no target, no base and no IRI node kind, but a datatype,
// an allowed-value list, or an sh:or over datatypes. A reference to one of these
// is the value itself, which is where a chain of shape references bottoms out.
function isValueShape(store: Store, shape: Quad_Subject): boolean {
  for (const predicate of [`${SH}property`, `${SH}targetClass`, `${SH}targetNode`, `${SH}class`, `${SH}node`]) {
    if (store.getQuads(shape, predicate, null, null).length) return false
  }
  if (objectValue(store, shape, `${SH}nodeKind`) === `${SH}IRI`) return false
  if (store.getQuads(shape, `${SH}datatype`, null, null).length) return true
  if (store.getQuads(shape, `${SH}in`, null, null).length) return true
  for (const quad of store.getQuads(shape, `${SH}or`, null, null)) {
    const branches = listItems(store, quad.object as Quad_Subject)
    if (branches && (isNumberOr(store, branches) || datatypeAlternation(store, branches))) return true
  }
  return false
}

// The classes a node shape says its entities are: its own target class, the
// class it (or a base) requires of them, or the rdf:type its composed property
// shapes pin. Several when the file states a union; the first drives the form.
function shapeTypes(
  store: Store,
  shape: Quad_Subject,
  nodeShapes: Map<string, Quad_Subject>,
  chain: Quad_Subject[],
  properties: Quad_Subject[],
): string[] {
  const targetClass = store.getQuads(shape, `${SH}targetClass`, null, null)
    .find((quad) => quad.object.termType === 'NamedNode')?.object.value
  if (targetClass) return [targetClass]
  // sh:class is a constraint, so a base's applies here too, transitively;
  // sh:targetClass is a target and is never inherited. The composition chain is
  // read back to front, so a shape's own class wins over an inherited one.
  for (const candidate of [...chain].reverse()) {
    const nodeClass = store.getQuads(candidate, `${SH}class`, null, null)
      .find((quad) => quad.object.termType === 'NamedNode' && !nodeShapes.has(termKey(quad.object)))?.object.value
    if (nodeClass) return [nodeClass]
  }
  const asserted: string[] = []
  for (const propertyShape of properties) asserted.push(...typesFromRdfProperty(store, propertyShape))
  for (const quad of store.getQuads(shape, `${SH}or`, null, null)) {
    asserted.push(...(typeUnionOr(store, listItems(store, quad.object as Quad_Subject)) ?? []))
  }
  return [...new Set(asserted)]
}

// `sh:property [ sh:path rdf:type ; sh:hasValue X ]`, an sh:in list, or a
// qualified value shape over an sh:in list: the ways a shape states the type
// (or the accepted types) of the entities it describes.
function typesFromRdfProperty(store: Store, propertyShape: Quad_Subject): string[] {
  if (objectValue(store, propertyShape, `${SH}path`) !== RDF_TYPE) return []
  const found: string[] = []
  for (const quad of store.getQuads(propertyShape, `${SH}hasValue`, null, null)) {
    if (quad.object.termType === 'NamedNode') found.push(quad.object.value)
  }
  const heads = [
    ...store.getQuads(propertyShape, `${SH}in`, null, null).map((quad) => quad.object),
    ...store.getQuads(propertyShape, `${SH}qualifiedValueShape`, null, null)
      .flatMap((quad) => store.getQuads(quad.object as Quad_Subject, `${SH}in`, null, null))
      .map((quad) => quad.object),
  ]
  for (const head of heads) {
    const items = listItems(store, head as Quad_Subject)
    if (items?.every((item) => item.termType === 'NamedNode')) found.push(...items.map((item) => item.value))
  }
  return found
}

// The types a shape-level sh:or states, when EVERY branch does nothing but pin
// an rdf:type ("an ImageObject or a MediaObject"). Any other branch means the
// alternative says more than which type the entity is.
function typeUnionOr(store: Store, branches: Quad_Object[] | undefined): string[] | undefined {
  if (!branches?.length) return undefined
  const found: string[] = []
  for (const branch of branches) {
    if (branch.termType !== 'BlankNode' && branch.termType !== 'NamedNode') return undefined
    const quads = store.getQuads(branch as Quad_Subject, null, null, null)
    if (!quads.length || quads.some((quad) => quad.predicate.value !== `${SH}property`)) return undefined
    const branchTypes = quads.flatMap((quad) => typesFromRdfProperty(store, quad.object as Quad_Subject))
    if (branchTypes.length !== quads.length) return undefined
    found.push(...branchTypes)
  }
  return found.length ? found : undefined
}

// The single datatype an sh:or over datatypes alone offers (the first branch's).
// The usual form is "a plain string or a language-tagged one"; the rule model
// has one literal type per field, and the first branch is the primary form.
function datatypeAlternation(store: Store, branches: Quad_Object[]): string | undefined {
  const datatypes: string[] = []
  for (const branch of branches) {
    if (branch.termType !== 'BlankNode' && branch.termType !== 'NamedNode') return undefined
    const quads = store.getQuads(branch as Quad_Subject, null, null, null)
    if (!quads.length || quads.some((quad) => quad.predicate.value !== `${SH}datatype`)) return undefined
    datatypes.push(...quads.map((quad) => quad.object.value))
  }
  return datatypes[0]
}

// Last resort for a value shape that names no class: its own name. A curated
// type of that name wins (PersonShape describes schema.org Persons), otherwise
// the type is minted beside the shape, but only when the shape's own namespace
// is an http(s) one. A file written against a relative base resolves under the
// crate base IRI, and an arcp:// "class" would travel into the exported profile.
const SHAPE_NAME_SUFFIX = /[-_]?(node)?shape$/i

function typeFromShapeName(iri: string): string | undefined {
  const local = termNameFromUri(iri)
  const base = local.replace(SHAPE_NAME_SUFFIX, '')
  if (!base || !/^[A-Za-z]/.test(base)) return undefined
  const curated = CURATED_ENTITY_TYPES.find((type) => type.label.toLowerCase() === base.toLowerCase())
  if (curated) return curated.uri
  const namespace = iri.slice(0, iri.length - local.length)
  return /^https?:\/\//.test(namespace) ? `${namespace}${base}` : `${IMPORTED_TYPE_NS}${base}`
}

// The target types an sh:or offers, when EVERY branch only picks one: sh:class,
// sh:node and sh:nodeKind sh:IRI. Any branch carrying another facet means the
// alternative says more than "one of these types" and is not a plain union.
const TARGET_BRANCH_KNOWN = new Set([RDF_TYPE, `${SH}class`, `${SH}node`, `${SH}nodeKind`])

function unionTargets(
  store: Store,
  branches: Quad_Object[],
  index: ShapeIndex,
): { classes: string[]; nodes: Term[] } | undefined {
  const classes: string[] = []
  const nodes: Term[] = []
  for (const branch of branches) {
    if (branch.termType !== 'BlankNode' && branch.termType !== 'NamedNode') return undefined
    const quads = store.getQuads(branch as Quad_Subject, null, null, null)
    if (!quads.length || quads.some((quad) => !TARGET_BRANCH_KNOWN.has(quad.predicate.value))) return undefined
    // A branch offering a plain literal ("text, or a PropertyValue entity") is
    // not a union of types: no single input holds both, so the alternative falls
    // through to the first-branch rule, which says so in a note.
    if (quads.some((quad) => quad.predicate.value === `${SH}node` && index.values.has(termKey(quad.object)))) {
      return undefined
    }
    // Within one branch a shape reference alongside sh:class only repeats the
    // class it already names (the form this projection emits).
    const branchClasses = quads.filter((quad) => quad.predicate.value === `${SH}class` && quad.object.termType === 'NamedNode')
    if (branchClasses.length) classes.push(...branchClasses.map((quad) => quad.object.value))
    else nodes.push(...quads.filter((quad) => quad.predicate.value === `${SH}node`).map((quad) => quad.object))
  }
  return classes.length || nodes.length ? { classes, nodes } : undefined
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

// A name unique within `taken`, suffixing 2,3,… on collision. The set is updated.
function uniqueName(base: string, taken: Set<string>): string {
  let name = base
  for (let n = 2; taken.has(name); n++) name = `${base}${n}`
  taken.add(name)
  return name
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
