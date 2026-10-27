// What the portal shows of the realm's databases. The node answers with ids, the bucket name and a
// state; the dataset's own texts are read from the dataset, with the dataset's access rules.
import type {
  DatabaseRequestView,
  DatabaseStateName,
  DatabaseTarget,
  DatabaseView,
  IdentifierParser,
  PartTargetResponse,
} from '@/lib/api'
import { contextIri, DEFAULT_CRATE_VERSION, specIri } from '@/lib/crate/version'
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
  parser?: IdentifierParser | null
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
    parser: view.parser ?? null,
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

/** The database a bucket is: a set by its id, an ordinary bucket by its node and name. */
export function databaseOf(rows: readonly DatabaseRow[], target: DatabaseTarget): DatabaseRow | undefined {
  return rows.find((row) => sameTarget(row.target, target))
}

export function requestOf(requests: readonly DatabaseRequestView[], target: DatabaseTarget): DatabaseRequestView | undefined {
  return requests.find((request) => sameTarget(request.entry.target, target))
}

export interface DatabasePlace {
  bucket: string
  nodeId: string
}

export const NOT_HELD_HERE = 'This node holds no copy of this database.'

/**
 * Where a database opens: an ordinary bucket on its own node; a set on this node only when the
 * part target of its root says this node holds it. Null when it cannot open here.
 */
export function placeOf(row: DatabaseRow, root: PartTargetResponse | null, localNodeId: string): DatabasePlace | null {
  if (row.target.kind === 'ordinary') return { bucket: row.target.bucket, nodeId: row.target.node_id }
  return root?.held_here && root.bucket ? { bucket: root.bucket, nodeId: localNodeId } : null
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

/** What a new dataset that describes a database says; empty fields are left out. */
export interface DatasetFields {
  name: string
  description: string
  version: string
  license: string
  /** A landing page URL or a DOI. */
  page: string
}

const DOI = /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:)?(10\.\d{4,9}\/\S+)$/i

// A link-like value is kept as a reference, anything else as text.
const reference = (value: string) => (/^https?:\/\//i.test(value) ? { '@id': value } : value)

/** The root fields of a new dataset: a DOI becomes its identifier, any other page its url. */
function rootFields(fields: DatasetFields): Record<string, unknown> {
  const page = fields.page.trim()
  const doi = DOI.exec(page)?.[1]
  return Object.fromEntries(
    Object.entries({
      name: fields.name.trim(),
      description: fields.description.trim(),
      version: fields.version.trim(),
      license: fields.license.trim() ? reference(fields.license.trim()) : '',
      identifier: doi ? `https://doi.org/${doi}` : '',
      url: page && !doi ? page : '',
    }).filter(([, value]) => value !== ''),
  )
}

/** A new crate whose root names the bucket root as its Dataset-typed part, as a mark needs. */
export function databaseCrate(fields: DatasetFields, part: string, bucket: string): unknown {
  return {
    '@context': contextIri(DEFAULT_CRATE_VERSION),
    '@graph': [
      { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' }, conformsTo: { '@id': specIri(DEFAULT_CRATE_VERSION) } },
      { '@id': './', '@type': 'Dataset', ...rootFields(fields), datePublished: new Date().toISOString().slice(0, 10), hasPart: [{ '@id': part }] },
      { '@id': part, '@type': 'Dataset', name: bucket },
    ],
  }
}

/** The crate with the bucket root added as a Dataset-typed part of its root; null when it is one. */
export function withBucketPart(crate: unknown, part: string, bucket: string): unknown | null {
  const graph = crateGraph(crate)
  const rootId = crateRootId(crate)
  const root = graph.find((entity) => entity['@id'] === rootId)
  if (!root) return null
  const parts = root.hasPart === undefined ? [] : Array.isArray(root.hasPart) ? root.hasPart : [root.hasPart]
  const named = parts.some((entry) => stringProp(entry) === part)
  const entity = graph.find((item) => item['@id'] === part)
  const types = entity ? [entity['@type']].flat() : []
  if (named && types.includes('Dataset')) return null
  const next = graph.map((item) => {
    if (item === root && !named) return { ...item, hasPart: [...parts, { '@id': part }] }
    if (item === entity && !types.includes('Dataset')) return { ...item, '@type': [...types.filter(Boolean), 'Dataset'] }
    return item
  })
  if (!entity) next.push({ '@id': part, '@type': 'Dataset', name: bucket })
  return { ...(crate as Record<string, unknown>), '@graph': next }
}
