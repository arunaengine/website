import { toArray } from '@/lib/contextualEntities'
import { crateGraph, crateRootId, entityKind, stringProp, typesOf } from '@/lib/dataEntities'

export const GRAPH_KINDS = ['Runs', 'Files', 'Folders', 'People', 'Organizations', 'Places', 'Software', 'Other'] as const
export type GraphKind = (typeof GRAPH_KINDS)[number]

const ENTITY_KINDS: Partial<Record<string, GraphKind>> = { people: 'People', organizations: 'Organizations', places: 'Places', software: 'Software' }

export function graphKindOf(entity: Record<string, unknown>): GraphKind {
  const types = typesOf(entity)
  if (types.some((type) => /Action$/.test(type))) return 'Runs'
  if (types.some((type) => type === 'File' || type.endsWith('MediaObject'))) return 'Files'
  if (types.includes('Dataset')) return 'Folders'
  return ENTITY_KINDS[entityKind(types)] ?? 'Other'
}

const isFrame = (crate: unknown, entity: Record<string, unknown>) =>
  entity['@id'] === 'ro-crate-metadata.json' || entity['@id'] === crateRootId(crate)

/** How many entities of each kind the crate holds, in the fixed kind order. */
export function kindCounts(crate: unknown): Array<{ kind: GraphKind; count: number }> {
  const counts = new Map<GraphKind, number>()
  for (const entity of crateGraph(crate)) {
    if (isFrame(crate, entity)) continue
    const kind = graphKindOf(entity)
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }
  return GRAPH_KINDS.filter((kind) => counts.has(kind)).map((kind) => ({ kind, count: counts.get(kind)! }))
}

/** The crate without the hidden kinds; references to a hidden entity go too, so none dangles. */
export function withoutKinds(crate: unknown, hidden: ReadonlySet<GraphKind>): unknown {
  if (!hidden.size) return crate
  const graph = crateGraph(crate)
  const gone = new Set(graph.filter((entity) => !isFrame(crate, entity) && hidden.has(graphKindOf(entity))).map((entity) => String(entity['@id'])))
  const kept = graph
    .filter((entity) => !gone.has(String(entity['@id'])))
    .map((entity) => {
      const copy: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(entity)) {
        if (key.startsWith('@')) {
          copy[key] = value
          continue
        }
        const values = toArray(value).filter((entry) => !(entry && typeof entry === 'object' && gone.has(stringProp(entry) ?? '')))
        if (values.length) copy[key] = Array.isArray(value) ? values : values[0]
      }
      return copy
    })
  return { ...(crate as Record<string, unknown>), '@graph': kept }
}
