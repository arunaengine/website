import { ApiError } from '@/lib/api'
import { displayName, fromRoCrate, rootId, vocabTypeUri, type DraftEntity } from '@/lib/crate/editor'
import {
  entitiesOfType,
  relatedEntities,
  REGISTRY_NAME,
  REGISTRY_PATH,
  withEntities,
} from '@/lib/crate/registry'
import { documentIdFromIri } from '@/lib/graphIri'
import { loadRoCrate } from './aruna/crates'
import { createMetadata, getMetadataDocument, lookupMetadataPath, replaceMetadataRoCrate } from './aruna/documents'
import { runSparql } from './aruna/search'

export interface ReuseSource {
  documentId: string
  title: string
  groupId: string
  registry: boolean
}

export interface ReuseCandidate {
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

async function registryId(groupId: string): Promise<string | null> {
  try {
    return (await lookupMetadataPath(groupId, REGISTRY_PATH)).winner.document_id
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

function candidatesOf(crate: unknown, type: string, source: ReuseSource): ReuseCandidate[] {
  const draft = fromRoCrate(crate)
  const root = rootId(draft)
  return entitiesOfType(draft.entities.filter((entity) => entity.id !== root), type)
    .map((entity) => ({ entity, related: relatedEntities(draft, entity), source }))
}

function graphDocumentId(row: Record<string, string>): string | null {
  return documentIdFromIri(String(row.g ?? '').replace(/^<|>$/g, ''))
}

/** Entities of `type` from the group registry first, then from other readable datasets. */
export async function findCandidates(
  type: string,
  options: { groupId?: string; excludeDocumentId?: string } = {},
): Promise<ReuseSearch> {
  const candidates: ReuseCandidate[] = []
  let partial = false
  let registry: string | null = null
  if (options.groupId) {
    try {
      registry = await registryId(options.groupId)
      if (registry) {
        const source = { documentId: registry, title: REGISTRY_NAME, groupId: options.groupId, registry: true }
        candidates.push(...candidatesOf(await loadRoCrate(registry), type, source))
      }
    } catch {
      partial = true
    }
  }
  const query = `SELECT DISTINCT ?g WHERE { GRAPH ?g { ?s a <${vocabTypeUri(type)}> } } LIMIT ${GRAPH_LIMIT}`
  const result = await runSparql(query, 'distributed-best-effort')
  partial ||= !result.complete
  const documentIds = [...new Set(result.rows.map(graphDocumentId))]
    .filter((id): id is string => Boolean(id) && id !== registry && id !== options.excludeDocumentId)
  if (documentIds.length > DOCUMENT_LIMIT) partial = true
  const loaded = await Promise.all(documentIds.slice(0, DOCUMENT_LIMIT).map(async (documentId) => {
    try {
      const [summary, crate] = await Promise.all([getMetadataDocument(documentId), loadRoCrate(documentId)])
      const draft = fromRoCrate(crate)
      const title = displayName(draft.entities.find((entity) => entity.id === rootId(draft))) || summary.document_path
      return candidatesOf(crate, type, { documentId, title, groupId: summary.group_id, registry: false })
    } catch {
      partial = true
      return []
    }
  }))
  const seen = new Set(candidates.map((candidate) => candidate.entity.id))
  for (const candidate of loaded.flat()) {
    if (seen.has(candidate.entity.id)) continue
    seen.add(candidate.entity.id)
    candidates.push(candidate)
  }
  // Registry entries lead, then the draft's own group; the sort is stable.
  const own = options.groupId
  candidates.sort((a, b) =>
    Number(b.source.registry) - Number(a.source.registry)
    || Number(b.source.groupId === own) - Number(a.source.groupId === own))
  return { candidates, partial }
}

/** Adds `entity` and what it references to the group registry, creating it on first use. */
export async function saveToRegistry(
  groupId: string,
  entity: DraftEntity,
  related: DraftEntity[],
): Promise<{ documentId: string }> {
  const entities = [entity, ...related]
  for (let attempt = 0; ; attempt++) {
    try {
      const existing = await registryId(groupId)
      if (!existing) {
        const created = await createMetadata({
          group_id: groupId,
          path: REGISTRY_PATH,
          public: false,
          rocrate: withEntities(null, entities),
        })
        return { documentId: created.document_id }
      }
      const crate = await loadRoCrate(existing, { force: true })
      await replaceMetadataRoCrate(existing, { rocrate: withEntities(crate, entities) })
      return { documentId: existing }
    } catch (error) {
      // A concurrent save took the path or the revision: read again once.
      if (attempt === 0 && error instanceof ApiError && (error.status === 409 || error.status === 412)) continue
      throw error
    }
  }
}
