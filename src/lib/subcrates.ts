import { crateGraph, crateRootId, stringProp } from '@/lib/dataEntities'

// Subcrate linking per RO-Crate 1.2 "Referencing other RO-Crates" (data
// entities spec): a referenced crate is a dataset data entity linked from the
// root via hasPart, whose conformsTo is the version-less RO-Crate profile URI.
// Because the child's persistent @id may not resolve to a crate directly, the
// spec's fallback adds subjectOf pointing at a CreativeWork contextual entity
// for the child's crate JSON. Nothing beyond the spec mechanism is written.

export const RO_CRATE_PROFILE_IRI = 'https://w3id.org/ro/crate'

export interface SubcrateLink {
  /** The child crate's persistent identifier (its graph IRI) used as @id. */
  iri: string
  name: string
  /** The child's portal document id (schema.org identifier), when known. */
  identifier?: string
  /** Resolvable URL of the child's crate JSON, written as subjectOf. */
  subjectOf?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function rootOf(crate: unknown): Record<string, unknown> | undefined {
  const graph = crateGraph(crate)
  const rootId = crateRootId(crate)
  return rootId ? graph.find((entity) => entity['@id'] === rootId) : undefined
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
}

function refId(value: unknown): string {
  if (typeof value === 'string') return value
  if (isRecord(value) && typeof value['@id'] === 'string') return value['@id']
  return ''
}

// Detection is lenient (a versioned profile IRI still identifies a subcrate);
// writes always use the version-less URI the spec mandates.
function conformsToRoCrate(entity: Record<string, unknown> | undefined): boolean {
  if (!entity) return false
  return toArray(entity.conformsTo).some((ref) => {
    const iri = refId(ref)
    return iri === RO_CRATE_PROFILE_IRI || iri.startsWith(`${RO_CRATE_PROFILE_IRI}/`)
  })
}

// The root's hasPart entries whose entities declare RO-Crate conformance.
export function subcrateLinksOf(crate: unknown): SubcrateLink[] {
  const root = rootOf(crate)
  if (!root) return []
  const graph = crateGraph(crate)
  const links: SubcrateLink[] = []
  const seen = new Set<string>()
  for (const ref of toArray(root.hasPart)) {
    const iri = refId(ref)
    if (!iri || seen.has(iri)) continue
    const entity = graph.find((e) => e['@id'] === iri)
    if (!entity || !conformsToRoCrate(entity)) continue
    seen.add(iri)
    links.push({
      iri,
      name: stringProp(entity.name) || iri,
      identifier: stringProp(entity.identifier),
      subjectOf: refId(toArray(entity.subjectOf)[0]) || undefined,
    })
  }
  return links
}

// A "project crate" is purely a crate that references subcrates; no marker is
// written into the JSON (machine-readable typing belongs to profiles).
export function isProjectCrate(crate: unknown): boolean {
  return subcrateLinksOf(crate).length > 0
}
