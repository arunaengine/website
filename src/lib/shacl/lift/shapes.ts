import type { Quad_Object, Quad_Subject, Store, Term } from 'n3'
import { SH, XSD } from '../projection'
import { CURATED_ENTITY_TYPES } from '../../profiles/entityTypes'
import { ARUNA_PROFILE_PREFIX, termNameFromUri } from '../../profiles/uri'
import {
  canonicalIri,
  intValue,
  listItems,
  Notes,
  objectValue,
  RDF_TYPE,
  shortTerm,
  termKey,
} from './parse'

// Namespace for a type minted from a shape name when the shape's own IRI has no
// http(s) namespace to mint into. A file written with a relative base resolves
// against CRATE_BASE_IRI, so minting beside the shape would leak arcp:// types
// (which are not classes of anything) into the exported profile.
const IMPORTED_TYPE_NS = `${ARUNA_PROFILE_PREFIX}imported#`
// Composition chains are walked with a visited set, so a cycle terminates; the
// depth cap is a second backstop against a pathological generated file.
const MAX_BASE_DEPTH = 32

// What the file says about the node shapes it declares, built once so grouping a
// shape into an entity and resolving a reference TO that shape can never
// disagree about which type it describes. Keys are termKey values.
export interface ShapeIndex {
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

// Which shapes describe the values of a property, and what type each node shape
// describes. `sh:node` paired with `sh:class` on the same property shape states
// the class its values belong to (the form this projection emits, including for
// the crate root), so only a BARE reference makes its target a shape in its own
// right; an `sh:class` that points at a shape rather than a class is one too.
export function buildShapeIndex(store: Store, nodeShapes: Map<string, Quad_Subject>, notes: Notes): ShapeIndex {
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
export function typesFromRdfProperty(store: Store, propertyShape: Quad_Subject): string[] {
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
export function typeUnionOr(store: Store, branches: Quad_Object[] | undefined): string[] | undefined {
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
export function datatypeAlternation(store: Store, branches: Quad_Object[]): string | undefined {
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

export function unionTargets(
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
export function isNumberOr(store: Store, items: Quad_Object[]): boolean {
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
export function readEntryCountOr(store: Store, head: Quad_Subject): { path: string; minItems: number } | undefined {
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
