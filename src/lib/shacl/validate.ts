import jsonld from 'jsonld'
import { DataFactory, Parser, Store } from 'n3'
import { Validator } from 'shacl-engine'
import type { ShaclEngineResult } from 'shacl-engine'
import roCrateContext from './ro-crate-context-1.2.json'
import { CRATE_BASE_IRI, SH } from './projection'
import { isDatasetType } from '../profiles/uri'
import type { ShaclFinding, ShaclSeverity } from './findings'

// Deep in-browser crate validation (plan section 8). This module carries the
// whole RDF stack (jsonld + n3 + shacl-engine) and is therefore ONLY imported
// by worker.ts — never from main-bundle code. Engine choice (2026-07): both
// candidates passed the full feature fixture (minCount/maxCount/datatype/
// class/node/nodeKind/in/pattern/lengths/ranges/hasValue/qualifiedValueShape/
// severity/or, 14/14 scenarios); shacl-engine (MIT) validated ~2.5x faster
// than rdf-validate-shacl (5.3 ms vs 13.5 ms per fixture run), so it is the
// engine. runEngine() below is the single seam to swap it.

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'

// Context URLs answered from the bundled RO-Crate 1.2 context. Any other
// remote context is refused offline and reported as a single info finding —
// never fetched, never a hard failure.
const BUNDLED_CONTEXT_URLS = new Set([
  'https://w3id.org/ro/crate/1.2/context',
  'http://w3id.org/ro/crate/1.2/context',
  'https://www.researchobject.org/ro-crate/1.2/context.jsonld',
])

export async function validateCrate(
  crateJson: unknown,
  shapesTtl: string[],
  rootId: string,
): Promise<ShaclFinding[]> {
  const crate = typeof crateJson === 'string' ? (JSON.parse(crateJson) as unknown) : crateJson

  const refusedContexts: string[] = []
  const documentLoader = async (url: string) => {
    if (BUNDLED_CONTEXT_URLS.has(url)) {
      return { contextUrl: undefined, document: roCrateContext, documentUrl: url }
    }
    refusedContexts.push(url)
    throw new Error(`Remote context not available offline: ${url}`)
  }

  let nquads: string
  try {
    nquads = (await jsonld.toRDF(crate as never, {
      base: CRATE_BASE_IRI,
      format: 'application/n-quads',
      documentLoader,
    } as never)) as unknown as string
  } catch (err) {
    if (refusedContexts.length) {
      return [
        {
          focusId: rootId,
          message: `Deep validation skipped: the crate uses a remote context that is not bundled (${refusedContexts.join(', ')}). Only the RO-Crate 1.2 context is available offline.`,
          severity: 'info',
          sourceShape: '',
        },
      ]
    }
    throw err
  }

  const data = new Store()
  data.addQuads(new Parser({ format: 'N-Quads' }).parse(nquads))

  const shapes = new Store()
  for (const ttl of shapesTtl) {
    if (!ttl.trim()) continue
    // Shapes are parsed against the same base the data graph is anchored under,
    // so crate-local ids in sh:hasValue line up with the resolved data IRIs.
    shapes.addQuads(new Parser({ baseIRI: CRATE_BASE_IRI }).parse(ttl))
  }
  bindRootTargets(shapes, rootId)

  const results = await runEngine(shapes, data)
  const findings: ShaclFinding[] = []
  // Deliberately NOT keyed on the source shape: a profile that both generates
  // shapes from its rules and attaches the SHACL file those rules were lifted
  // from expresses some constraints twice, and one complaint about one node
  // reads as a single problem whichever shape raised it.
  const seen = new Set<string>()
  for (const result of results) {
    const finding = toFinding(result)
    const key = `${finding.focusId}\u0000${finding.path ?? ''}\u0000${finding.severity}\u0000${finding.message}`
    if (seen.has(key)) continue
    seen.add(key)
    findings.push(finding)
  }
  return findings
}

// The generated root Dataset shape carries no static target (crate roots have
// crate-local ids; class targeting would also hit non-root Datasets), so every
// top-level node shape without a target — and not used as part of another
// shape — is bound to the crate root via sh:targetNode at runtime. For
// attached expert shapes this doubles as a feature: a target-less root shape
// validates the root entity.
function bindRootTargets(shapes: Store, rootId: string) {
  const rootIri = DataFactory.namedNode(resolveCrateIri(rootId))
  const nodeShapes = shapes
    .getQuads(null, RDF_TYPE, DataFactory.namedNode(`${SH}NodeShape`), null)
    .map((quad) => quad.subject)
  const rootClasses = new Set(
    nodeShapes.flatMap((shape) =>
      shapes.getQuads(shape, `${SH}class`, null, null).some((quad) => isDatasetType(quad.object.value))
        ? shapes.getQuads(shape, `${SH}targetClass`, null, null).map((quad) => quad.object.value)
        : [],
    ),
  )
  for (const shape of nodeShapes) {
    if (shapes.getQuads(shape, `${SH}targetClass`, null, null).some((quad) => rootClasses.has(quad.object.value))) {
      shapes.addQuad(shape, DataFactory.namedNode(`${SH}targetNode`), rootIri)
      continue
    }
    const targeted =
      shapes.getQuads(shape, `${SH}targetClass`, null, null).length +
      shapes.getQuads(shape, `${SH}targetNode`, null, null).length +
      shapes.getQuads(shape, `${SH}targetSubjectsOf`, null, null).length +
      shapes.getQuads(shape, `${SH}targetObjectsOf`, null, null).length
    if (targeted) continue
    // Used as a member of another shape, so it describes part of something else.
    const member =
      shapes.getQuads(null, `${SH}property`, shape, null).length +
      shapes.getQuads(null, `${SH}qualifiedValueShape`, shape, null).length +
      shapes.getQuads(null, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first', shape, null).length +
      shapes.getQuads(null, `${SH}not`, shape, null).length
    if (member) continue
    // sh:node alone does NOT disqualify a shape from being the crate root: the
    // projection emits `sh:node <root shape>` for every rule whose target type
    // is the crate's own Dataset (hasPart is the common case), which used to
    // leave the whole root shape unbound and silently unvalidated. A value
    // shape that pins the class of its values does describe another type, so
    // that one stays unbound. lift.ts recognizes the root by the same rule.
    const valueShape = shapes.getQuads(null, `${SH}node`, shape, null).length
    if (valueShape && shapes.getQuads(shape, `${SH}class`, null, null).length) continue
    shapes.addQuad(shape, DataFactory.namedNode(`${SH}targetNode`), rootIri)
  }
}

// Engine seam: everything engine-specific stays inside this function.
async function runEngine(shapes: Store, data: Store): Promise<ShaclEngineResult[]> {
  const validator = new Validator(shapes, { factory: DataFactory })
  const report = await validator.validate({ dataset: data })
  return report.results
}

function toFinding(result: ShaclEngineResult): ShaclFinding {
  const severity = severityFrom(result.severity?.value)
  const path = result.path?.[0]?.predicates?.[0]?.value
  const message =
    (result.message ?? [])
      .map((term) => term.value)
      .filter(Boolean)
      .join(' ') || defaultMessage(result.constraintComponent?.value, severity)
  return {
    focusId: crateLocalId(result.focusNode?.term?.value ?? ''),
    ...(path ? { path } : {}),
    message,
    severity,
    sourceShape: result.shape?.ptr?.term?.value ?? '',
  }
}

function severityFrom(iri: string | undefined): ShaclSeverity {
  if (iri === `${SH}Warning`) return 'warning'
  if (iri === `${SH}Info`) return 'info'
  return 'error'
}

// Reverse of the base-IRI anchoring: report focus nodes by their crate-local
// id so callers can match them against @graph entries and rendered controls.
export function crateLocalId(iri: string): string {
  if (iri === CRATE_BASE_IRI) return './'
  if (iri.startsWith(CRATE_BASE_IRI)) return iri.slice(CRATE_BASE_IRI.length)
  return iri
}

// The absolute IRI a crate-local id resolves to under the fixed base — the
// same resolution jsonld.toRDF applies to the crate's @id values.
export function resolveCrateIri(id: string): string {
  const value = id.trim() || './'
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return value
  try {
    return new URL(value, CRATE_BASE_IRI).href
  } catch {
    return value
  }
}

// Fallback texts for results whose shapes carry no sh:message; keyed by the
// SHACL core constraint component, phrased like the bespoke validator.
function defaultMessage(component: string | undefined, severity: ShaclSeverity): string {
  const local = component?.startsWith(SH) ? component.slice(SH.length) : component ?? ''
  switch (local) {
    case 'MinCountConstraintComponent':
      return severity === 'warning' ? 'A recommended value is missing.' : 'A required value is missing.'
    case 'MaxCountConstraintComponent':
      return 'Too many values.'
    case 'DatatypeConstraintComponent':
      return 'Value has the wrong type.'
    case 'NodeKindConstraintComponent':
      return 'Value must be a reference.'
    case 'ClassConstraintComponent':
      return 'Referenced entity has the wrong type.'
    case 'NodeConstraintComponent':
      return 'Referenced entity does not satisfy its shape.'
    case 'PatternConstraintComponent':
      return 'Value does not match the required pattern.'
    case 'MinLengthConstraintComponent':
      return 'Value is too short.'
    case 'MaxLengthConstraintComponent':
      return 'Value is too long.'
    case 'MinInclusiveConstraintComponent':
      return 'Value is below the allowed minimum.'
    case 'MaxInclusiveConstraintComponent':
      return 'Value is above the allowed maximum.'
    case 'InConstraintComponent':
      return 'Value is not one of the allowed values.'
    case 'HasValueConstraintComponent':
      return 'A required entry is missing.'
    case 'QualifiedMinCountConstraintComponent':
      return 'A required entry is missing.'
    case 'OrConstraintComponent':
      return 'Value does not match any allowed form.'
    default:
      return local ? `Does not conform (${local.replace(/ConstraintComponent$/, '')}).` : 'Does not conform to the profile shapes.'
  }
}
