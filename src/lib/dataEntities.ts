// Shared RO-Crate data-entity helpers: the union of a root's hasPart references
// and File/Dataset entities that both the metadata detail view and the files
// editor list, plus the write-back that keeps @ids verbatim and only drops a
// removed entity when nothing else in the crate still references it.

export interface DataEntity {
  id: string
  name: string
  types: string[]
  encodingFormat?: string
  contentSize?: string
  contentUrl?: string
  description?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function crateGraph(crate: unknown): Array<Record<string, unknown>> {
  if (!isRecord(crate)) return []
  const g = crate['@graph']
  return Array.isArray(g) ? g.filter(isRecord) : []
}

// The root dataset is the entity referenced by the ro-crate-metadata.json
// descriptor's `about`, falling back to the first non-descriptor entity.
export function crateRootId(crate: unknown): string | undefined {
  const g = crateGraph(crate)
  const descriptor = g.find((e) => e['@id'] === 'ro-crate-metadata.json')
  const about = descriptor?.about
  if (isRecord(about) && typeof about['@id'] === 'string') return about['@id']
  return g.find((e) => e['@id'] !== 'ro-crate-metadata.json')?.['@id'] as string | undefined
}

export function stringProp(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return stringProp(value[0])
  if (isRecord(value)) return typeof value['@id'] === 'string' ? value['@id'] : undefined
  return undefined
}

function typesOf(entity: Record<string, unknown>): string[] {
  const t = entity['@type']
  if (typeof t === 'string') return [t]
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string')
  return []
}

// The union of entities referenced from the root's hasPart (in hasPart order) and
// every File/Dataset entity, excluding the root and the metadata descriptor. A
// hasPart id without an inline entity is still listed, keyed by its verbatim @id.
export function dataEntitiesOf(crate: unknown): DataEntity[] {
  const g = crateGraph(crate)
  if (!g.length) return []
  const rootId = crateRootId(crate)
  const root = rootId ? g.find((e) => e['@id'] === rootId) : undefined
  const byId = new Map(g.map((e) => [typeof e['@id'] === 'string' ? (e['@id'] as string) : '', e]))
  const rows: DataEntity[] = []
  const seen = new Set<string>()
  const push = (id: string, entity: Record<string, unknown> | undefined) => {
    if (!id || id === 'ro-crate-metadata.json' || id === rootId || seen.has(id)) return
    seen.add(id)
    const types = entity ? typesOf(entity) : []
    rows.push({
      id,
      name: stringProp(entity?.name) || id,
      types: types.length ? types : ['File'],
      encodingFormat: stringProp(entity?.encodingFormat),
      contentSize: stringProp(entity?.contentSize),
      contentUrl: stringProp(entity?.contentUrl),
      description: stringProp(entity?.description),
    })
  }
  const hasPart = root?.hasPart
  for (const ref of Array.isArray(hasPart) ? hasPart : hasPart ? [hasPart] : []) {
    const id = stringProp(ref)
    if (id) push(id, byId.get(id))
  }
  for (const entity of g) {
    const types = typesOf(entity)
    if (types.includes('File') || types.includes('Dataset')) {
      push(typeof entity['@id'] === 'string' ? (entity['@id'] as string) : '', entity)
    }
  }
  return rows
}

function setOrDelete(entity: Record<string, unknown>, key: string, value: string | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (trimmed) entity[key] = trimmed
  else delete entity[key]
}

// True when any entity other than `id`'s own node references `id` through a
// property value (a string id, an { "@id" } node, or nested arrays/objects).
function referencedElsewhere(graph: Array<Record<string, unknown>>, id: string): boolean {
  const hit = (value: unknown): boolean => {
    if (typeof value === 'string') return value === id
    if (Array.isArray(value)) return value.some(hit)
    if (isRecord(value)) {
      if (typeof value['@id'] === 'string') return value['@id'] === id
      return Object.values(value).some(hit)
    }
    return false
  }
  return graph.some((entity) => {
    if (entity['@id'] === id) return false
    for (const [key, value] of Object.entries(entity)) {
      if (key === '@id' || key === '@type' || key === '@context') continue
      if (hit(value)) return true
    }
    return false
  })
}

// Writes the editor's file list back into a crate clone: rebuilds the root's
// hasPart in list order, upserts each File entity (ids kept verbatim), and drops
// a removed entity only when nothing else in the crate still references it.
export function applyDataEntities(crate: unknown, files: DataEntity[]): void {
  if (!isRecord(crate)) return
  const rootId = crateRootId(crate)
  const graph = crateGraph(crate)
  const root = rootId ? graph.find((e) => e['@id'] === rootId) : graph.find((e) => e['@id'] !== 'ro-crate-metadata.json')
  if (!root) return
  const originalIds = new Set(dataEntitiesOf(crate).map((entity) => entity.id))
  const newIds = new Set(files.map((file) => file.id))

  if (files.length) root.hasPart = files.map((file) => ({ '@id': file.id }))
  else delete root.hasPart

  const liveGraph = (Array.isArray(crate['@graph']) ? crate['@graph'] : []) as Array<Record<string, unknown>>
  crate['@graph'] = liveGraph
  for (const file of files) {
    let entity = liveGraph.find((e) => isRecord(e) && e['@id'] === file.id)
    if (!entity) {
      entity = { '@id': file.id }
      liveGraph.push(entity)
    }
    const types = file.types.length ? file.types : ['File']
    entity['@type'] = types.length === 1 ? types[0] : types
    setOrDelete(entity, 'name', file.name.trim() || file.id)
    setOrDelete(entity, 'encodingFormat', file.encodingFormat)
    setOrDelete(entity, 'contentSize', file.contentSize)
    setOrDelete(entity, 'description', file.description)
  }

  const removed = [...originalIds].filter((id) => !newIds.has(id))
  if (removed.length) {
    crate['@graph'] = liveGraph.filter((entity) => {
      const id = entity['@id']
      if (typeof id !== 'string' || !removed.includes(id)) return true
      return referencedElsewhere(liveGraph, id)
    })
  }
}
