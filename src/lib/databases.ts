// What the portal shows of the realm's databases. The node answers with ids, the bucket name and a
// state; the dataset's own texts are read from the dataset, with the dataset's access rules.
import type { DatabaseRequestView, DatabaseStateName, DatabaseTarget, DatabaseView } from '@/lib/api'
import { crateGraph, crateRootId, stringProp } from '@/lib/dataEntities'

export interface DatabaseRow {
  entryId: string
  datasetId: string
  /** Empty for a bucket the caller cannot read (curator view only). */
  bucket: string
  ownerGroup: string
  target: DatabaseTarget
  state: DatabaseStateName
  /** The dataset's title when the caller may read the dataset. */
  title: string | null
  documentPath: string | null
  /** Anyone may read the bucket, also without a login. */
  public: boolean
}

export function rowOf(view: DatabaseView): DatabaseRow {
  return {
    entryId: view.entry_id,
    datasetId: view.dataset_id,
    bucket: view.bucket,
    ownerGroup: view.owner_group,
    target: view.target,
    state: view.state,
    title: view.title ?? null,
    documentPath: view.document_path ?? null,
    public: view.public,
  }
}

/** Why an entry is not plain, in words for a person. */
export const STATE_NOTES: Record<DatabaseStateName, string> = {
  active: '',
  description_unavailable: 'Description temporarily unavailable',
  dataset_hidden: 'You cannot read the dataset',
  no_longer_linked: 'No longer linked by its dataset',
}

export function sameTarget(a: DatabaseTarget, b: DatabaseTarget): boolean {
  if (a.kind === 'distributed' && b.kind === 'distributed') return a.set_id === b.set_id
  if (a.kind === 'ordinary' && b.kind === 'ordinary') return a.node_id === b.node_id && a.bucket === b.bucket
  return false
}

/** The target of a bucket: its set when it is stored on more nodes, else the node and the name. */
export function targetOf(bucket: string, nodeId: string, setId: string | null): DatabaseTarget {
  return setId ? { kind: 'distributed', set_id: setId } : { kind: 'ordinary', node_id: nodeId, bucket }
}

/** The database a bucket is, by name. An ordinary bucket also needs its node to match. */
export function databaseOf(rows: readonly DatabaseRow[], bucket: string, nodeId: string): DatabaseRow | undefined {
  return rows.find(
    (row) => row.bucket === bucket && (row.target.kind === 'distributed' || row.target.node_id === nodeId),
  )
}

export function requestOf(requests: readonly DatabaseRequestView[], target: DatabaseTarget): DatabaseRequestView | undefined {
  return requests.find((request) => sameTarget(request.entry.target, target))
}

/** The node whose bucket a database opens on; a set opens on the node asked. */
export function openNode(row: DatabaseRow, localNodeId: string): string {
  return row.target.kind === 'ordinary' ? row.target.node_id : localNodeId
}

/** Rows whose title or bucket contain every word of the query. */
export function searchRows(rows: readonly DatabaseRow[], query: string): DatabaseRow[] {
  const words = query.toLowerCase().split(/\s+/).filter((word) => word.length >= 2)
  if (!words.length) return []
  return rows.filter((row) => {
    const text = `${row.title ?? ''} ${row.bucket}`.toLowerCase()
    return words.every((word) => text.includes(word))
  })
}

export interface DatasetBrief {
  name: string
  description: string
  license: string
}

/** The name, description and license of the crate's root dataset. */
export function briefOf(crate: unknown): DatasetBrief {
  const rootId = crateRootId(crate)
  const root = crateGraph(crate).find((entity) => entity['@id'] === rootId)
  return {
    name: stringProp(root?.name) ?? '',
    description: stringProp(root?.description) ?? '',
    license: stringProp(root?.license) ?? '',
  }
}
