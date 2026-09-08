import { displayName, findEntity, fromRoCrate, rootId, vocabTypeUri, type DraftEntity } from '@/lib/crate/editor'
import {
  entitiesOfType,
  relatedEntities,
  isRegistry,
  referenceKey,
  type EntityReference,
} from '@/lib/crate/registry'
import { documentIdFromIri, isDocumentId } from '@/lib/graphIri'
import { listRecentMetadata } from './aruna/catalog'
import { fetchRoCrateRaw } from './aruna/crates'
import { getMetadataDocument } from './aruna/documents'
import { runSparql } from './aruna/search'
import { assertCurrentSession, refreshContext } from './aruna/state'

export interface ReuseSource {
  documentId: string
  title: string
  groupId: string
}

export interface ReuseCandidate {
  reference: EntityReference
  entity: DraftEntity
  /** Contextual entities the candidate references directly, copied along with it. */
  related: DraftEntity[]
  source: ReuseSource
}

export interface ReuseSearch {
  candidates: ReuseCandidate[]
  /** Some datasets were not searched or could not be read, so more may exist. */
  partial: boolean
}

const GRAPH_LIMIT = 20
const DOCUMENT_LIMIT = 8

function candidatesOf(crate: unknown, type: string | null, source: ReuseSource): ReuseCandidate[] {
  const draft = fromRoCrate(crate)
  const root = rootId(draft)
  const entities = draft.entities.filter((entity) => entity.id !== root)
  return (type ? entitiesOfType(entities, type) : entities)
    .map((entity) => ({ reference: { documentId: source.documentId, entityId: entity.id }, entity, related: relatedEntities(draft, entity), source }))
}

export async function resolveReference(reference: EntityReference): Promise<ReuseCandidate> {
  if (!isDocumentId(reference.documentId) || !reference.entityId) throw new Error('This entity has no saved source dataset.')
  const epoch = refreshContext().epoch
  const [summary, crate] = await Promise.all([
    getMetadataDocument(reference.documentId), fetchRoCrateRaw(reference.documentId),
  ])
  assertCurrentSession(epoch)
  const draft = fromRoCrate(crate)
  const entity = findEntity(draft, reference.entityId)
  if (!entity) throw new Error('This entity is no longer in the saved source dataset.')
  return {
    reference,
    entity,
    related: relatedEntities(draft, entity),
    source: {
      documentId: reference.documentId,
      title: displayName(draft.entities.find((item) => item.id === rootId(draft))) || summary.document_path,
      groupId: summary.group_id,
    },
  }
}

/** Entities from the most recently updated readable datasets. */
export async function findRecentCandidates(
  options: { excludeDocumentId?: string } = {},
): Promise<ReuseSearch> {
  const epoch = refreshContext().epoch
  const recent = await listRecentMetadata(DOCUMENT_LIMIT)
  assertCurrentSession(epoch)
  if (!recent) return { candidates: [], partial: false }
  let partial = false
  const loaded = await Promise.all(recent
    .filter((document) => document.ulid !== options.excludeDocumentId)
    .map(async (document) => {
      try {
        const crate = await fetchRoCrateRaw(document.ulid)
        if (isRegistry(crate)) return []
        return candidatesOf(crate, null, {
          documentId: document.ulid,
          title: document.title,
          groupId: document.realmId,
        })
      } catch {
        partial = true
        return []
      }
    }))
  assertCurrentSession(epoch)
  return { candidates: loaded.flat(), partial }
}

function graphDocumentId(row: Record<string, string>): string | null {
  return documentIdFromIri(String(row.g ?? '').replace(/^<|>$/g, ''))
}

/** Entities of `type` from readable datasets. */
export async function findCandidates(
  type: string,
  options: { groupId?: string; excludeDocumentId?: string } = {},
): Promise<ReuseSearch> {
  const epoch = refreshContext().epoch
  const candidates: ReuseCandidate[] = []
  let partial = false
  const query = `SELECT DISTINCT ?g WHERE { GRAPH ?g { ?s a <${vocabTypeUri(type)}> } } LIMIT ${GRAPH_LIMIT}`
  const result = await runSparql(query, 'distributed-best-effort')
  const rows = result.rows
  partial ||= !result.complete
  const documentIds = [...new Set(rows.map(graphDocumentId))]
    .filter((id): id is string => Boolean(id) && id !== options.excludeDocumentId)
  if (documentIds.length > DOCUMENT_LIMIT) partial = true
  const loaded = await Promise.all(documentIds.slice(0, DOCUMENT_LIMIT).map(async (documentId) => {
    try {
      const [summary, crate] = await Promise.all([getMetadataDocument(documentId), fetchRoCrateRaw(documentId)])
      if (isRegistry(crate)) return []
      const draft = fromRoCrate(crate)
      const title = displayName(draft.entities.find((entity) => entity.id === rootId(draft))) || summary.document_path
      return candidatesOf(crate, type, { documentId, title, groupId: summary.group_id })
    } catch {
      partial = true
      return []
    }
  }))
  const seen = new Set(candidates.map((candidate) => referenceKey(candidate.reference)))
  for (const candidate of loaded.flat()) {
    const key = referenceKey(candidate.reference)
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push(candidate)
  }
  // The draft's own group leads; the sort is stable.
  const own = options.groupId
  candidates.sort((a, b) => Number(b.source.groupId === own) - Number(a.source.groupId === own))
  assertCurrentSession(epoch)
  return { candidates, partial }
}
