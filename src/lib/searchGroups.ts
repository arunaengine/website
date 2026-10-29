// The whole-bucket search results, one row per record folder: hits that carry kept metadata and
// share their first path segment (an assembly folder) form one group. Hits without metadata or at
// the bucket root stay single rows. Rows keep the order of their first hit, so later pages only
// append to them.
import type { ObjectSearchHit } from './api'

export type SearchRow =
  | { kind: 'hit'; key: string; hit: ObjectSearchHit }
  | { kind: 'group'; key: string; folder: string; nodeId: string; hits: ObjectSearchHit[]; metadata: Record<string, string> }

const hasMetadata = (hit: ObjectSearchHit) => Object.keys(hit.metadata ?? {}).length > 0
const folderOf = (key: string) => (key.includes('/') ? key.slice(0, key.indexOf('/')) : null)

export function groupHits(hits: readonly ObjectSearchHit[]): SearchRow[] {
  const rows: SearchRow[] = []
  const groups = new Map<string, Extract<SearchRow, { kind: 'group' }>>()
  for (const hit of hits) {
    const folder = hasMetadata(hit) ? folderOf(hit.key) : null
    if (!folder) {
      rows.push({ kind: 'hit', key: `${hit.issuer_node_id}/${hit.key}`, hit })
      continue
    }
    const key = `${hit.issuer_node_id}/${folder}/`
    const group = groups.get(key)
    if (group) {
      group.hits.push(hit)
      continue
    }
    const created = { kind: 'group' as const, key, folder, nodeId: hit.issuer_node_id, hits: [hit], metadata: hit.metadata! }
    groups.set(key, created)
    rows.push(created)
  }
  return rows
}

/**
 * "Escherichia coli str. K-12 substr. MG1655": the strain is added only where the name lacks it,
 * and a name that ends with the strain's first word gets only the rest ("str. Sakai" + "Sakai
 * substr. RIMD 0509952" reads "str. Sakai substr. RIMD 0509952").
 */
export function groupTitle(group: Extract<SearchRow, { kind: 'group' }>): string {
  const organism = group.metadata.organism_name?.trim()
  if (!organism) return group.folder
  const strain = group.metadata.infraspecific_name?.replace(/^[a-z_]+=/i, '').trim()
  if (!strain || organism.includes(strain)) return organism
  const [first, ...rest] = strain.split(/\s+/)
  if (organism.split(/\s+/).at(-1) === first) return rest.length ? `${organism} ${rest.join(' ')}` : organism
  return `${organism} ${strain}`
}

/** The group's files: the folder's own entry is not one of them. */
export function groupFiles(group: Extract<SearchRow, { kind: 'group' }>): ObjectSearchHit[] {
  return group.hits.filter((hit) => !hit.key.endsWith('/'))
}
