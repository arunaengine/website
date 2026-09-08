import {
  ApiError,
  apiRequest,
  type CreateMetadataRequest,
  type CreateMetadataResponse,
  type MetadataDocumentListItem,
  type MetadataDocumentSummary,
  type MetadataRoCrateResponse,
  type ReplaceMetadataRoCrateRequest,
} from '@/lib/api'
import { loadMetadata } from './catalog'
import { CRATE_POLL_DELAYS_MS, CrateNotReadyError, invalidateCrate, loadRoCrate } from './crates'
import {
  acceptedProfileItems,
  assertCurrentSession,
  fullCrates,
  metadataItems,
  profileItems,
  recentlyCreatedMetadataIds,
  refreshContext,
  request,
  saving,
} from './state'
import {
  invalidateProfileValidationAfterWrite,
  refreshProfileValidationAfterWrite,
} from './validation'

export async function createMetadata(input: CreateMetadataRequest) {
  saving.value = true
  try {
    const summary = await request<CreateMetadataResponse>('/metadata', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    recentlyCreatedMetadataIds.add(summary.document_id)
    if (summary.document_path.startsWith('profiles/')) {
      acceptedProfileItems.set(summary.document_id, summary)
      profileItems.value = [
        ...profileItems.value.filter((item) => item.document_id !== summary.document_id),
        summary,
      ]
    }
    // The document is already created; a failing catalog refresh here (e.g. the
    // projection race) must not surface as a create failure.
    await loadMetadata().catch(() => undefined)
    return summary
  } finally {
    saving.value = false
  }
}

export async function getMetadataDocument(
  documentId: string,
  options: { pollPreparing?: boolean; onPreparing?: (recentlyCreated: boolean) => void } = {},
): Promise<MetadataDocumentSummary> {
  const context = refreshContext()
  const recentlyCreated = recentlyCreatedMetadataIds.has(documentId)
  for (let attempt = 0; ; attempt++) {
    try {
      const summary = await apiRequest<MetadataDocumentSummary>(
        `/metadata/${encodeURIComponent(documentId)}`,
        {},
        context.client,
      )
      assertCurrentSession(context.epoch)
      recentlyCreatedMetadataIds.delete(documentId)
      return summary
    } catch (err) {
      assertCurrentSession(context.epoch)
      const status = err instanceof ApiError ? err.status : 0
      const preparing = options.pollPreparing && (status === 503 || (recentlyCreated && status === 404))
      if (!preparing) throw err
      options.onPreparing?.(recentlyCreated)
      if (attempt >= CRATE_POLL_DELAYS_MS.length) throw new CrateNotReadyError(documentId)
      await new Promise((resolve) => setTimeout(resolve, CRATE_POLL_DELAYS_MS[attempt]))
    }
  }
}

// An accepted update re-materializes the graph asynchronously, and until it
// lands the document GET answers 503 while the catalog listing still exports
// the pre-update summaries. Polling the (cheap, registry-only) GET is the
// barrier that keeps the refresh after a replace from re-reading and then
// rendering the state the update just replaced. Gives up quietly after the
// poll window; the refresh then behaves no worse than without the barrier.
export async function awaitCrateMaterialized(documentId: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await getMetadataDocument(documentId)
      return
    } catch (err) {
      const materializing = err instanceof ApiError && err.status === 503
      if (!materializing || attempt >= CRATE_POLL_DELAYS_MS.length) return
      await new Promise((resolve) => setTimeout(resolve, CRATE_POLL_DELAYS_MS[attempt]))
    }
  }
}

export async function replaceMetadataRoCrate(
  documentId: string,
  input: ReplaceMetadataRoCrateRequest,
): Promise<MetadataDocumentSummary> {
  saving.value = true
  try {
    const summary = await request<MetadataDocumentSummary>(`/metadata/${encodeURIComponent(documentId)}/rocrate`, {
      method: 'PUT',
      body: JSON.stringify(input),
    })
    const validationDocumentIds = invalidateProfileValidationAfterWrite(documentId)
    const wasCached = documentId in fullCrates.value
    invalidateCrate(documentId)
    await awaitCrateMaterialized(documentId)
    // A document someone had on screen must come back as the new full crate,
    // not as a summary-parsed downgrade of it; re-prime before the catalog
    // refresh remaps. The update is accepted at this point, so neither a
    // failing re-prime nor a failing refresh may surface as a save failure.
    if (wasCached) await loadRoCrate(documentId, { force: true }).catch(() => undefined)
    await loadMetadata().catch(() => undefined)
    await refreshProfileValidationAfterWrite(validationDocumentIds)
    return summary
  } finally {
    saving.value = false
  }
}

export async function deleteMetadataDocument(documentId: string): Promise<void> {
  saving.value = true
  try {
    await request<void>(`/metadata/${encodeURIComponent(documentId)}`, { method: 'DELETE' })
    invalidateCrate(documentId)
    metadataItems.value = metadataItems.value.filter((item) => item.document_id !== documentId)
    profileItems.value = profileItems.value.filter((item) => item.document_id !== documentId)
    acceptedProfileItems.delete(documentId)
    await loadMetadata().catch(() => undefined)
  } finally {
    saving.value = false
  }
}

// Registry summary plus the document's summary crate: the per-document
// equivalent of one `include=summary` list row, for ids known up front.
export async function getMetadataItem(documentId: string): Promise<MetadataDocumentListItem> {
  const context = refreshContext()
  const [summary, crate] = await Promise.all([
    getMetadataDocument(documentId),
    apiRequest<MetadataRoCrateResponse>(
      `/metadata/${encodeURIComponent(documentId)}/rocrate`,
      { query: { view: 'summary' } },
      context.client,
    ).catch(() => null),
  ])
  assertCurrentSession(context.epoch)
  return { ...summary, rocrate_summary: crate?.rocrate }
}
