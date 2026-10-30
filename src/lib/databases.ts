// What the portal shows of the realm's databases: buckets whose metadata says `database: true`,
// found with the bucket search. Every member of a distributed bucket answers its own hit.
import type { BucketIdentifier, BucketMetadata, BucketSearchHit } from '@/lib/api'

export type DatabaseTarget =
  | { kind: 'distributed'; set_id: string }
  | { kind: 'ordinary'; node_id: string; bucket: string }

export interface DatabasePlace {
  bucket: string
  nodeId: string
}

export interface DatabaseRow {
  bucket: string
  ownerGroup: string
  target: DatabaseTarget
  /** Each node that answered for the bucket; one per member of a distributed bucket. */
  places: DatabasePlace[]
  title: string | null
  /** The dataset that describes the bucket, when one is named. */
  datasetId: string | null
  /** Anyone may read the bucket, also without a login. */
  public: boolean
  metadata: BucketMetadata
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

export const targetKey = (target: DatabaseTarget) =>
  target.kind === 'distributed' ? `set:${target.set_id}` : `${target.node_id}/${target.bucket}`

/** The database rows of bucket search hits; the members of one distributed bucket form one row. */
export function rowsOf(hits: readonly BucketSearchHit[]): DatabaseRow[] {
  const rows = new Map<string, DatabaseRow>()
  for (const hit of hits) {
    if (!hit.metadata?.database) continue
    const target = targetOf(hit.bucket, hit.node_id, hit.set_id ?? null)
    const place = { bucket: hit.bucket, nodeId: hit.node_id }
    const known = rows.get(targetKey(target))
    if (known) {
      known.places.push(place)
      continue
    }
    rows.set(targetKey(target), {
      bucket: hit.bucket,
      ownerGroup: hit.group_id,
      target,
      places: [place],
      title: hit.metadata.title ?? null,
      datasetId: hit.metadata.dataset ?? null,
      public: hit.public ?? false,
      metadata: hit.metadata,
    })
  }
  return [...rows.values()]
}

/** The database a bucket is: a set by its id, an ordinary bucket by its node and name. */
export function databaseOf(rows: readonly DatabaseRow[], target: DatabaseTarget): DatabaseRow | undefined {
  return rows.find((row) => sameTarget(row.target, target))
}

/** Where a database opens: on this node when it holds it, else on the first node that answered. */
export function placeOf(row: DatabaseRow, localNodeId: string | null): DatabasePlace {
  return row.places.find((place) => place.nodeId === localNodeId) ?? row.places[0]
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

const DOI = /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:)?(10\.\d{4,9}\/\S+)$/i

/** What a "DOI or link" field names: a DOI with its doi.org page, else an http(s) link, else null. */
export function pageIdentifier(text: string): BucketIdentifier | null {
  const value = text.trim()
  const doi = DOI.exec(value)?.[1]
  if (doi) return { name: 'DOI', value: doi, url: `https://doi.org/${doi}` }
  return /^https?:\/\/\S+$/i.test(value) ? { name: 'Link', value, url: value } : null
}

/** Where an identifier resolves: its own http(s) link, else a DOI's doi.org page, else nowhere. */
export function identifierUrl(item: { value: string; url?: string | null }): string | null {
  if (item.url && /^https?:\/\//i.test(item.url)) return item.url
  return pageIdentifier(item.value)?.url ?? null
}

/** The identifiers with the first DOI or link replaced by the field's value; others stay. */
export function withPage(identifiers: readonly BucketIdentifier[], text: string): BucketIdentifier[] {
  const page = pageIdentifier(text)
  const at = identifiers.findIndex((item) => item.name === 'DOI' || item.name === 'Link')
  const rest = identifiers.filter((_, index) => index !== at)
  if (!page) return rest
  return at < 0 ? [page, ...rest] : [...rest.slice(0, at), page, ...rest.slice(at)]
}

/** The "DOI or link" field's text for stored identifiers. */
export const pageText = (identifiers: readonly BucketIdentifier[]) =>
  identifiers.find((item) => item.name === 'DOI' || item.name === 'Link')?.value ?? ''
