import type { Quad_Subject, Store, Term } from 'n3'
import {
  DATE_PATTERN,
  DATETIME_PATTERN,
  EMAIL_PATTERN,
  SH,
  URL_PATTERN,
  XSD,
} from '../projection'
import { ALL_ENTITY_SOURCES } from '../../profiles/sources'
import { CURATED_PROPERTY_TERMS, type PropertyTermOption } from '../../profiles/propertyCatalog'
import { isHasPartUri } from '../../profiles/emit'
import { sameSchemaOrgType, SCHEMA_ORG } from '../../profiles/uri'
import type {
  ProfileObligation,
  ProfilePropertyRule,
  ProfileRequiredInstance,
  ProfileValueKind,
} from '../../profiles/types'
import {
  canonicalIri,
  crateLocalValue,
  floatValue,
  intValue,
  labelForPath,
  listItems,
  literalValue,
  namedNode,
  Notes,
  objectValue,
  propertyNameFor,
  RDF_TYPE,
  SCHEMA_DATASET,
  shortIri,
  termKey,
} from './parse'
import { datatypeAlternation, isNumberOr, unionTargets, type ShapeIndex } from './shapes'

const DCT_CONFORMS_TO = 'http://purl.org/dc/terms/conformsTo'

// The portal's own catalogue entry for a property term: the same value kind and
// target types the builder applies when an author picks the term by hand, used
// only where the file itself states nothing.
function catalogTerm(path: string): PropertyTermOption | undefined {
  return CURATED_PROPERTY_TERMS.find((term) => sameSchemaOrgType(term.uri, path))
}

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

// Emission order recovered from sh:order, applied before the rules are stored.
const ruleOrder = new WeakMap<ProfilePropertyRule, number>()

// sh:order decides; ties (including every rule of a file that declares no order
// at all) fall back to label then term, so an unordered import is stable and
// predictable instead of following RDF-store insertion order.
export function compareRuleOrder(a: ProfilePropertyRule, b: ProfilePropertyRule): number {
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

export function liftRuleGroup(
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
