import { crateGraph, crateRootId, stringProp } from '@/lib/dataEntities'

// Subcrate linking per RO-Crate 1.2 "Referencing other RO-Crates" (data
// entities spec): a referenced crate is a Dataset data entity linked from the
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

// Adds (or completes) one subcrate reference on a crate CLONE: the hasPart
// ref, the Dataset data entity, and the subjectOf CreativeWork fallback.
// Everything else in the crate is left untouched. Idempotent per iri.
export function addSubcrateLink(crate: unknown, link: SubcrateLink): void {
  if (!isRecord(crate)) return
  const root = rootOf(crate)
  if (!root) return

  const hasPart = toArray(root.hasPart)
  if (!hasPart.some((ref) => refId(ref) === link.iri)) hasPart.push({ '@id': link.iri })
  root.hasPart = hasPart

  const graph = Array.isArray(crate['@graph']) ? (crate['@graph'] as unknown[]) : []
  const existing = graph.find((entity): entity is Record<string, unknown> => isRecord(entity) && entity['@id'] === link.iri)
  if (existing) {
    if (!conformsToRoCrate(existing)) {
      existing.conformsTo = [...toArray(existing.conformsTo), { '@id': RO_CRATE_PROFILE_IRI }]
    }
    if (!stringProp(existing.name) && link.name) existing.name = link.name
    if (!stringProp(existing.identifier) && link.identifier) existing.identifier = link.identifier
    if (!toArray(existing.subjectOf).length && link.subjectOf) existing.subjectOf = { '@id': link.subjectOf }
  } else {
    graph.push({
      '@id': link.iri,
      '@type': 'Dataset',
      conformsTo: { '@id': RO_CRATE_PROFILE_IRI },
      name: link.name,
      ...(link.identifier ? { identifier: link.identifier } : {}),
      ...(link.subjectOf ? { subjectOf: { '@id': link.subjectOf } } : {}),
    })
  }
  if (link.subjectOf && !graph.some((entity) => isRecord(entity) && entity['@id'] === link.subjectOf)) {
    graph.push({
      '@id': link.subjectOf,
      '@type': 'CreativeWork',
      encodingFormat: 'application/ld+json',
    })
  }
  crate['@graph'] = graph
}

// True when any entity other than `excludeId`'s own node references `iri`
// somewhere in its property values.
function referencedElsewhere(graph: unknown[], iri: string, excludeId: string): boolean {
  const hit = (value: unknown): boolean => {
    if (typeof value === 'string') return value === iri
    if (Array.isArray(value)) return value.some(hit)
    if (isRecord(value)) {
      if (typeof value['@id'] === 'string') return value['@id'] === iri
      return Object.values(value).some(hit)
    }
    return false
  }
  return graph.some((entity) => {
    if (!isRecord(entity) || entity['@id'] === excludeId || entity['@id'] === iri) return false
    for (const [key, value] of Object.entries(entity)) {
      if (key === '@id' || key === '@type' || key === '@context') continue
      if (hit(value)) return true
    }
    return false
  })
}

// Removes one subcrate reference from a crate CLONE: the hasPart ref, the
// Dataset entity, and its subjectOf CreativeWork when nothing else still
// references it.
export function removeSubcrateLink(crate: unknown, iri: string): void {
  if (!isRecord(crate)) return
  const root = rootOf(crate)
  if (!root) return

  const hasPart = toArray(root.hasPart).filter((ref) => refId(ref) !== iri)
  if (hasPart.length) root.hasPart = hasPart
  else delete root.hasPart

  let graph = Array.isArray(crate['@graph']) ? (crate['@graph'] as unknown[]) : []
  const entity = graph.find((e): e is Record<string, unknown> => isRecord(e) && e['@id'] === iri)
  // Only the subcrate data entity is removed; an unrelated entity with the
  // same id (no RO-Crate conformance) keeps living.
  if (!entity || !conformsToRoCrate(entity)) {
    crate['@graph'] = graph
    return
  }
  const subjectIris = toArray(entity.subjectOf).map(refId).filter(Boolean)
  graph = graph.filter((e) => e !== entity)
  for (const subjectIri of subjectIris) {
    if (referencedElsewhere(graph, subjectIri, iri)) continue
    graph = graph.filter((e) => !(isRecord(e) && e['@id'] === subjectIri))
  }
  crate['@graph'] = graph
}
