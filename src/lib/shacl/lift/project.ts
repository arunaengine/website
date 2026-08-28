import type { Quad_Subject } from 'n3'
import { SH } from '../projection'
import { isDatasetType, sameSchemaOrgType } from '../../profiles/uri'
import type { ProfileEntityRule, ProfilePropertyRule } from '../../profiles/types'
import {
  addTerm,
  canonicalIri,
  classNameFor,
  humanLabel,
  listItems,
  literalValue,
  namedNode,
  Notes,
  parseTurtle,
  RDF_FIRST,
  RDF_TYPE,
  SCHEMA_DATASET,
  shortIri,
  shortTerm,
  termKey,
  type LiftNote,
} from './parse'
import { buildShapeIndex, readEntryCountOr, typesFromRdfProperty, typeUnionOr } from './shapes'
import { compareRuleOrder, liftRuleGroup } from './constraints'

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

export interface LiftResult {
  entities: ProfileEntityRule[]
  notes: LiftNote[]
  shapeCount: number
  fieldCount: number
}

// A profile with more entity rules than this would render an unusable outline.
// Real files sit far below it (the Bioschemas ChemicalSubstance binding yields
// nine), so the cap only ever fires on generated input.
const MAX_ENTITIES = 50

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
  const { store, prefixes } = parseTurtle(turtle)

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
