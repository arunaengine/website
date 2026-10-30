import { toArray } from '@/lib/contextualEntities'
import { crateGraph, stringProp } from '@/lib/dataEntities'

// A bucket described as a whole: a folder entity with a file count, a layout of RFC 6570 URI
// templates (hydra:IriTemplate) and the variables they use (hydra:IriTemplateMapping).
const TERMS = 'https://w3id.org/aruna/terms/'
const HYDRA = 'http://www.w3.org/ns/hydra/core#'

type Entity = Record<string, unknown>

function term(entity: Entity | undefined, name: string, base = TERMS): unknown {
  return entity?.[`${base}${name}`] ?? entity?.[name]
}

function count(value: unknown): number | null {
  const number = Number(stringProp(value))
  return stringProp(value) !== undefined && Number.isInteger(number) && number >= 0 ? number : null
}

/** The files a folder entity says it holds, listed or not; null when it does not say. */
export function declaredFiles(entity: Entity | undefined): number | null {
  return count(term(entity, 'fileCount'))
}

export interface LayoutRow {
  id: string
  template: string
  description: string
  folder: boolean
  format: string
  count: number | null
  size: number | null
}

export interface BucketLayout {
  rows: LayoutRow[]
  variables: Array<{ name: string; description: string; example: string }>
}

export function bucketLayout(crate: unknown): BucketLayout {
  const graph = crateGraph(crate)
  const byId = new Map(graph.map((entity) => [String(entity['@id']), entity]))
  const refs = (entity: Entity, name: string) =>
    toArray(term(entity, name)).map((value) => byId.get(stringProp(value) ?? '')).filter((found): found is Entity => Boolean(found))
  const rows: LayoutRow[] = []
  const variables: BucketLayout['variables'] = []
  for (const entity of graph) {
    for (const part of refs(entity, 'layout')) {
      const folder = /FolderPattern$/.test(stringProp(part.additionalType) ?? '')
      const size = count(part.contentSize)
      rows.push({
        id: String(part['@id']),
        template: stringProp(term(part, 'urlTemplate', '')) ?? stringProp(term(part, 'template', HYDRA)) ?? stringProp(part.name) ?? '',
        description: stringProp(part.description) ?? '',
        folder,
        format: folder ? '' : stringProp(part.encodingFormat) ?? '',
        count: count(term(part, folder ? 'folderCount' : 'fileCount')),
        size,
      })
    }
    for (const variable of refs(entity, 'variables')) {
      variables.push({
        name: stringProp(term(variable, 'variable', HYDRA)) ?? stringProp(variable.name) ?? '',
        description: stringProp(variable.description) ?? '',
        example: stringProp(term(variable, 'example')) ?? '',
      })
    }
  }
  return { rows, variables }
}

/** Files the crate's top folders declare beyond the files listed below them. */
export function unlistedFiles(crate: unknown): number {
  const graph = crateGraph(crate)
  const byId = new Map(graph.map((entity) => [String(entity['@id']), entity]))
  const listed = (id: string, seen = new Set<string>()): number => {
    if (seen.has(id)) return 0
    seen.add(id)
    return toArray(byId.get(id)?.hasPart).reduce<number>((sum, value) => {
      const child = byId.get(stringProp(value) ?? '')
      if (!child) return sum
      const types = toArray(child['@type'])
      return sum + (types.includes('File') ? 1 : listed(String(child['@id']), seen))
    }, 0)
  }
  const root = byId.get(stringProp(byId.get('ro-crate-metadata.json')?.about) ?? './')
  return toArray(root?.hasPart).reduce<number>((sum, value) => {
    const id = stringProp(value) ?? ''
    const declared = declaredFiles(byId.get(id))
    return sum + (declared === null ? 0 : Math.max(0, declared - listed(id)))
  }, 0)
}
