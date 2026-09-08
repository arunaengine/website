import { displayName, findEntity, fromRoCrate, rootId, typeLabel, type DraftEntity } from '@/lib/crate/editor'
import {
  entitiesOfType,
  relatedEntities,
  isRegistry,
  type EntityReference,
} from '@/lib/crate/registry'
import { isDocumentId } from '@/lib/graphIri'
import { CATALOG_PAGE_SIZE, listCatalogPage } from './aruna/catalog'
import type { ListMetadataResponse, MetadataDocumentListItem } from '@/lib/api'
import { fetchRoCrateRaw } from './aruna/crates'
import { getMetadataDocument } from './aruna/documents'
import { assertCurrentSession, refreshContext } from './aruna/state'

export interface ReuseSource {
  documentId: string
  title: string
  groupId: string
  public?: boolean
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
  loadMore?: () => Promise<ReuseSearch>
}

interface SearchOptions {
  groupId?: string
  excludeDocumentId?: string
  query?: string
  accept?: (candidate: ReuseCandidate) => boolean
  signal?: AbortSignal
}

const CANDIDATE_LIMIT = 20

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
      public: summary.public,
    },
  }
}

/** Recent suggestions and searches share the entire paged group corpus. */
export function findRecentCandidates(options: SearchOptions = {}): Promise<ReuseSearch> {
  return searchCandidates(null, options)
}

export function findCandidates(type: string, options: SearchOptions = {}): Promise<ReuseSearch> {
  return searchCandidates(type, options)
}

async function searchCandidates(type: string | null, options: SearchOptions): Promise<ReuseSearch> {
  const epoch = refreshContext().epoch
  const needle = options.query?.trim().toLowerCase() ?? ''
  let scope: 'group' | 'public' = options.groupId ? 'group' : 'public'
  let offset = 0
  let exhausted = false
  let finished = false
  let partial = false
  const documents: MetadataDocumentListItem[] = []
  const pending: ReuseCandidate[] = []
  const seen = new Set<string>()
  function current() {
    assertCurrentSession(epoch)
    options.signal?.throwIfAborted()
  }
  async function loadMore(): Promise<ReuseSearch> {
    const candidates: ReuseCandidate[] = []
    while (candidates.length < CANDIDATE_LIMIT) {
      current()
      if (pending.length) {
        candidates.push(pending.shift()!)
        continue
      }
      if (documents.length) {
        const document = documents.shift()!
        if (seen.has(document.document_id) || document.document_id === options.excludeDocumentId
          || document.document_path.startsWith('profiles/')) continue
        if (scope === 'group' && document.group_id !== options.groupId) continue
        if (scope === 'public' && (!document.public || document.group_id === options.groupId)) continue
        seen.add(document.document_id)
        try {
          const crate = await fetchRoCrateRaw(document.document_id, options.signal)
          current()
          if (isRegistry(crate)) continue
          const draft = fromRoCrate(crate)
          const title = displayName(findEntity(draft, rootId(draft))) || document.document_path
          const found = candidatesOf(crate, type, { documentId: document.document_id, title,
            groupId: document.group_id, public: document.public })
          pending.push(...found.filter((candidate) => (!options.accept || options.accept(candidate))
            && (!needle || [displayName(candidate.entity), candidate.entity.id, title,
              ...candidate.entity.types.map(typeLabel),
              ...(candidate.entity.properties.identifier ?? []).map((value) => value.value)]
              .some((value) => value.toLowerCase().includes(needle)))))
        } catch {
          current()
          partial = true
        }
        continue
      }
      if (exhausted) {
        if (scope === 'public') { finished = true; break }
        scope = 'public'
        offset = 0
        exhausted = false
      }
      let page: ListMetadataResponse
      try {
        page = await listCatalogPage({ groupId: scope === 'group' ? options.groupId : undefined,
          offset, limit: CATALOG_PAGE_SIZE, order: 'recent', signal: options.signal })
      } catch (error) {
        current()
        if (!candidates.length) throw error
        partial = true
        return { candidates, partial, loadMore }
      }
      current()
      documents.push(...page.documents)
      exhausted = page.total_returned < page.limit
      const next = page.offset + page.total_returned
      if (!exhausted && next <= offset) throw new Error('Dataset discovery did not advance.')
      offset = next
    }
    current()
    return { candidates, partial, ...(finished ? {} : { loadMore }) }
  }
  return loadMore()
}
