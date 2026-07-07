import type { MetadataDocumentListItem } from './api'

export interface CrateObjectReference {
  documentId: string
  title: string
}

// Builds an index of "bucket/key" -> referencing documents from client-side
// crate caches ONLY (never issues a request). Two verified URL forms point into
// the node's buckets:
//   s3://{bucket}/{key}              (SelectDataDialog data references)
//   {s3endpoint}/{bucket}/{key}      (path-style https contentUrl, useProfilePublish)
// The lookup is honest-by-construction: it only knows about crates the portal
// has already fetched this session, so the badge tooltip says exactly that.
export function buildCrateReferenceIndex(
  crates: Record<string, unknown>,
  listItems: MetadataDocumentListItem[],
  s3Endpoint: string | null,
): Map<string, CrateObjectReference[]> {
  const index = new Map<string, CrateObjectReference[]>()
  const seen = new Map<string, Set<string>>() // bucketKey -> documentIds already added
  const listItemById = new Map(listItems.map((item) => [item.document_id, item]))

  const add = (documentId: string, crate: unknown, fallbackTitle: string) => {
    const title = rootTitle(crate, fallbackTitle)
    for (const entity of graphOf(crate)) {
      for (const url of urlStrings(entity)) {
        const bucketKey = toBucketKey(url, s3Endpoint)
        if (!bucketKey) continue
        let ids = seen.get(bucketKey)
        if (!ids) {
          ids = new Set()
          seen.set(bucketKey, ids)
        }
        if (ids.has(documentId)) continue // one reference per (object, document)
        ids.add(documentId)
        const list = index.get(bucketKey)
        if (list) list.push({ documentId, title })
        else index.set(bucketKey, [{ documentId, title }])
      }
    }
  }

  // fullCrates win over list summaries: process them first so their (usually
  // richer) title sticks and the summary's duplicate reference is skipped.
  for (const [documentId, crate] of Object.entries(crates)) {
    add(documentId, crate, listItemById.get(documentId)?.document_path || documentId)
  }
  for (const item of listItems) {
    if (item.rocrate_summary) add(item.document_id, item.rocrate_summary, item.document_path || item.document_id)
  }

  return index
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function graphOf(crate: unknown): Array<Record<string, unknown>> {
  if (!isRecord(crate)) return []
  const graph = crate['@graph']
  return Array.isArray(graph) ? graph.filter(isRecord) : []
}

function stringVal(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return stringVal(value[0])
  if (isRecord(value)) return stringVal(value.name ?? value['@id'])
  return ''
}

function idOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return idOf(value[0])
  if (isRecord(value)) return idOf(value['@id'])
  return ''
}

// Descriptor's about -> root entity name; else first non-descriptor name; else fallback.
function rootTitle(crate: unknown, fallback: string): string {
  const graph = graphOf(crate)
  const descriptor = graph.find((entity) => entity['@id'] === 'ro-crate-metadata.json')
  const rootId = idOf(descriptor?.about)
  const root = rootId ? graph.find((entity) => entity['@id'] === rootId) : undefined
  const rootName = stringVal(root?.name)
  if (rootName) return rootName
  const firstName = stringVal(graph.find((entity) => entity['@id'] !== 'ro-crate-metadata.json')?.name)
  return firstName || fallback
}

// Object URLs live on @id and contentUrl, each of which may be a string, an
// { "@id": ... } node, or an array of either.
function urlStrings(entity: Record<string, unknown>): string[] {
  return [...collectUrls(entity['@id']), ...collectUrls(entity.contentUrl)]
}

function collectUrls(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(collectUrls)
  if (isRecord(value)) {
    const id = value['@id']
    return typeof id === 'string' ? [id] : []
  }
  return []
}

function toBucketKey(url: string, endpoint: string | null): string | null {
  let rest: string | null = null
  if (url.startsWith('s3://')) {
    rest = url.slice('s3://'.length)
  } else if (endpoint) {
    const base = endpoint.replace(/\/$/, '')
    if (url.startsWith(`${base}/`)) rest = url.slice(base.length + 1)
  }
  if (rest === null) return null
  const slash = rest.indexOf('/')
  if (slash < 0) return null
  const bucket = rest.slice(0, slash)
  let key = rest.slice(slash + 1)
  if (!bucket || !key) return null
  try {
    key = decodeURIComponent(key)
  } catch {
    // Keep the raw key when it is not valid percent-encoding.
  }
  return `${bucket}/${key}`
}
