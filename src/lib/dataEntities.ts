// Shared RO-Crate data-entity helpers: the union of a root's hasPart references
// and File/Dataset entities that both the metadata detail view and the files
// editor list, plus the write-back that keeps @ids verbatim and only drops a
// removed entity when nothing else in the crate still references it.

import { formatBytes } from '@/lib/utils'

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

// Data-entity detection accepts both compact and full-URI types. MediaObject
// and its media subtypes count as files; Dataset marks a sub-directory whose
// own hasPart may nest further data entities.
export const DATA_ENTITY_TYPES = new Set(['File', 'MediaObject', 'Dataset', 'ImageObject', 'AudioObject', 'VideoObject'])

function typeShortName(type: string): string {
  return type.split(/[#/]/).filter(Boolean).pop() ?? type
}

function isDataType(types: string[]): boolean {
  return types.some((type) => DATA_ENTITY_TYPES.has(typeShortName(type)))
}

function isDirectoryType(types: string[]): boolean {
  return types.some((type) => typeShortName(type) === 'Dataset')
}

export interface DataEntityNode extends DataEntity {
  depth: number
  parentId: string
  // Dataset-typed part (a sub-directory); may carry its own hasPart.
  directory: boolean
  childIds: string[]
}

// Depth-first walk of the root's hasPart in list order: files stay leaves,
// Dataset-typed parts recurse into their own hasPart. Data entities the walk
// never reaches (graph strays without a hasPart chain) are appended at depth
// zero, so nothing the flat union used to list disappears. Cycles terminate on
// the visited set; each id is listed once, at its first position.
export function dataEntityTreeOf(crate: unknown, maxDepth = 8): DataEntityNode[] {
  const g = crateGraph(crate)
  if (!g.length) return []
  const rootId = crateRootId(crate)
  const byId = new Map(g.map((e) => [typeof e['@id'] === 'string' ? (e['@id'] as string) : '', e]))
  const rows: DataEntityNode[] = []
  const seen = new Set<string>()

  const partIds = (entity: Record<string, unknown> | undefined): string[] =>
    (Array.isArray(entity?.hasPart) ? entity.hasPart : entity?.hasPart ? [entity.hasPart] : [])
      .map((ref) => stringProp(ref) ?? '')
      .filter((id) => id && id !== 'ro-crate-metadata.json' && id !== rootId)

  const walk = (id: string, depth: number, parentId: string) => {
    if (seen.has(id)) return
    seen.add(id)
    const entity = byId.get(id)
    const types = entity ? typesOf(entity) : []
    const node: DataEntityNode = {
      id,
      name: stringProp(entity?.name) || id,
      types: types.length ? types : ['File'],
      encodingFormat: stringProp(entity?.encodingFormat),
      contentSize: stringProp(entity?.contentSize),
      contentUrl: stringProp(entity?.contentUrl),
      description: stringProp(entity?.description),
      depth,
      parentId,
      directory: isDirectoryType(types),
      childIds: [],
    }
    rows.push(node)
    if (!node.directory || depth >= maxDepth) return
    for (const childId of partIds(entity)) {
      node.childIds.push(childId)
      walk(childId, depth + 1, id)
    }
  }

  for (const id of partIds(rootId ? byId.get(rootId) : undefined)) walk(id, 0, rootId ?? '')
  for (const entity of g) {
    const id = typeof entity['@id'] === 'string' ? (entity['@id'] as string) : ''
    if (!id || id === 'ro-crate-metadata.json' || id === rootId || seen.has(id)) continue
    if (isDataType(typesOf(entity))) walk(id, 0, rootId ?? '')
  }
  return rows
}

// A crate's contentSize is spec-wise a string: numeric values format as bytes,
// anything else renders verbatim.
export function formatContentSize(value?: string): string {
  if (!value || value.trim() === '') return '-'
  const bytes = Number(value)
  return Number.isFinite(bytes) ? formatBytes(bytes) : value
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
  // Only the root's own hasPart is under the editor's control: a nested
  // entity (a sub-dataset's part) is neither hoisted into the root nor pruned
  // when the editor list, which shows depth-zero rows, is written back.
  const rootParts = Array.isArray(root.hasPart) ? root.hasPart : root.hasPart ? [root.hasPart] : []
  const originalIds = new Set(rootParts.map((ref) => stringProp(ref) ?? '').filter(Boolean))
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
