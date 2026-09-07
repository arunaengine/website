import { ApiError } from '@/lib/api'
import { displayName, findEntity, fromRoCrate, rootId, vocabTypeUri, type DraftEntity } from '@/lib/crate/editor'
import {
  entitiesOfType,
  relatedEntities,
  REGISTRY_PATH,
  isRegistry,
  referenceKey,
  referenceNode,
  registryCrate,
  registryReferences,
  type EntityReference,
} from '@/lib/crate/registry'
import { documentIdFromIri, isDocumentId } from '@/lib/graphIri'
import { fetchRoCrateRaw } from './aruna/crates'
import { createMetadata, getMetadataDocument, lookupMetadataPath, upsertContextualEntity } from './aruna/documents'
import { runSparql } from './aruna/search'
import { assertCurrentSession, refreshContext } from './aruna/state'

export interface ReuseSource {
  documentId: string
  title: string
  groupId: string
  registry: boolean
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
  unavailable: boolean
}

const GRAPH_LIMIT = 20
const DOCUMENT_LIMIT = 8

async function registryCopies(groupId: string) {
  let lookup
  try {
    lookup = await lookupMetadataPath(groupId, REGISTRY_PATH)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return { copies: [], occupied: false, partial: false }
    throw error
  }
  const ids = [...new Set([lookup.winner.document_id, ...lookup.conflicts])]
  const copies: Array<{ documentId: string; crate: unknown }> = []
  let partial = false
  for (let offset = 0; offset < ids.length; offset += DOCUMENT_LIMIT) {
    const loaded = await Promise.all(ids.slice(offset, offset + DOCUMENT_LIMIT).map(async (documentId) => {
      try {
        const crate = await fetchRoCrateRaw(documentId)
        return isRegistry(crate) ? { documentId, crate } : null
      } catch {
        partial = true
        return null
      }
    }))
    copies.push(...loaded.filter((copy): copy is { documentId: string; crate: unknown } => copy !== null))
  }
  return { copies, occupied: true, partial }
}

function candidatesOf(crate: unknown, type: string, source: ReuseSource): ReuseCandidate[] {
  const draft = fromRoCrate(crate)
  const root = rootId(draft)
  return entitiesOfType(draft.entities.filter((entity) => entity.id !== root), type)
    .map((entity) => ({ reference: { documentId: source.documentId, entityId: entity.id }, entity, related: relatedEntities(draft, entity), source }))
}

export async function resolveReference(reference: EntityReference, registry = false): Promise<ReuseCandidate> {
  if (!isDocumentId(reference.documentId) || !reference.entityId) throw new Error('Save the dataset first before saving an entity reference.')
  const epoch = refreshContext().epoch
  const [summary, crate] = await Promise.all([
    getMetadataDocument(reference.documentId), fetchRoCrateRaw(reference.documentId),
  ])
  assertCurrentSession(epoch)
  const draft = fromRoCrate(crate)
  const entity = findEntity(draft, reference.entityId)
  if (!entity) throw new Error('This entity is not in the saved dataset. Save the dataset changes first.')
  return {
    reference,
    entity,
    related: relatedEntities(draft, entity),
    source: {
      documentId: reference.documentId,
      title: displayName(draft.entities.find((item) => item.id === rootId(draft))) || summary.document_path,
      groupId: summary.group_id,
      registry,
    },
  }
}

function graphDocumentId(row: Record<string, string>): string | null {
  return documentIdFromIri(String(row.g ?? '').replace(/^<|>$/g, ''))
}

/** Entities of `type` from the group registry first, then from other readable datasets. */
export async function findCandidates(
  type: string,
  options: { groupId?: string; excludeDocumentId?: string } = {},
): Promise<ReuseSearch> {
  const epoch = refreshContext().epoch
  const candidates: ReuseCandidate[] = []
  let partial = false
  let unavailable = false
  const registries = new Set<string>()
  if (options.groupId) {
    try {
      const result = await registryCopies(options.groupId)
      partial ||= result.partial
      const references = new Map<string, EntityReference>()
      for (const copy of result.copies) {
        registries.add(copy.documentId)
        for (const reference of registryReferences(copy.crate)) references.set(referenceKey(reference), reference)
      }
      const pending = [...references.values()].filter((reference) => reference.documentId !== options.excludeDocumentId)
      for (let offset = 0; offset < pending.length; offset += DOCUMENT_LIMIT) {
        const loaded = await Promise.all(pending.slice(offset, offset + DOCUMENT_LIMIT).map(async (reference) => {
          try {
            const candidate = await resolveReference(reference, true)
            return entitiesOfType([candidate.entity], type).length ? candidate : null
          } catch {
            unavailable = true
            return null
          }
        }))
        candidates.push(...loaded.filter((candidate): candidate is ReuseCandidate => candidate !== null))
      }
    } catch {
      partial = true
    }
  }
  const query = `SELECT DISTINCT ?g WHERE { GRAPH ?g { ?s a <${vocabTypeUri(type)}> } } LIMIT ${GRAPH_LIMIT}`
  let rows: Array<Record<string, string>> = []
  try {
    const result = await runSparql(query, 'distributed-best-effort')
    rows = result.rows
    partial ||= !result.complete
  } catch (error) {
    // The registry hits still stand; a failed search must not hide them.
    if (!candidates.length) throw error
    partial = true
  }
  const documentIds = [...new Set(rows.map(graphDocumentId))]
    .filter((id): id is string => Boolean(id) && !registries.has(id!) && id !== options.excludeDocumentId)
  if (documentIds.length > DOCUMENT_LIMIT) partial = true
  const loaded = await Promise.all(documentIds.slice(0, DOCUMENT_LIMIT).map(async (documentId) => {
    try {
      const [summary, crate] = await Promise.all([getMetadataDocument(documentId), fetchRoCrateRaw(documentId)])
      if (isRegistry(crate)) return []
      const draft = fromRoCrate(crate)
      const title = displayName(draft.entities.find((entity) => entity.id === rootId(draft))) || summary.document_path
      return candidatesOf(crate, type, { documentId, title, groupId: summary.group_id, registry: false })
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
  // Registry entries lead, then the draft's own group; the sort is stable.
  const own = options.groupId
  candidates.sort((a, b) =>
    Number(b.source.registry) - Number(a.source.registry)
    || Number(b.source.groupId === own) - Number(a.source.groupId === own))
  assertCurrentSession(epoch)
  return { candidates, partial: partial || unavailable, unavailable }
}

/** Saves a reference to an entity in an existing dataset, never its description. */
export async function saveToRegistry(
  groupId: string,
  reference: EntityReference,
): Promise<{ documentId: string }> {
  const epoch = refreshContext().epoch
  await resolveReference(reference)
  const result = await registryCopies(groupId)
  assertCurrentSession(epoch)
  const existing = result.copies[0]
  if (existing) {
    await upsertContextualEntity(existing.documentId, referenceNode(reference))
    assertCurrentSession(epoch)
    return { documentId: existing.documentId }
  }
  if (result.partial) throw new Error('The group registry could not be loaded. Try again.')
  if (result.occupied) throw new Error('The entity-registry path is already used by another dataset.')
  const created = await createMetadata({
    group_id: groupId, path: REGISTRY_PATH, public: false, rocrate: registryCrate(reference),
  })
  assertCurrentSession(epoch)
  return { documentId: created.document_id }
}
