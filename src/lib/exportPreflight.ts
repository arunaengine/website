import { ApiError } from '@/lib/api/client'
import { documentIdFromIri, isDocumentId } from '@/lib/graphIri'
import { subcrateLinksOf, type SubcrateLink } from '@/lib/subcrates'

export interface ExportPreflight {
  /** Linked datasets the caller may not read; their references remain external. */
  restricted: SubcrateLink[]
  /** Linked crates outside this realm's catalog, which cannot be checked here. */
  unchecked: SubcrateLink[]
  /** A lookup failed for another reason, so the lists may be incomplete. */
  failed: boolean
}

export function linkedDocumentId(link: SubcrateLink): string | null {
  if (link.identifier && isDocumentId(link.identifier)) return link.identifier
  return documentIdFromIri(link.iri)
}

// Check access to linked datasets without implying that export bundles them.
export async function preflightExport(
  crate: unknown,
  getDocument: (documentId: string) => Promise<unknown>,
): Promise<ExportPreflight> {
  const result: ExportPreflight = { restricted: [], unchecked: [], failed: false }
  await Promise.all(subcrateLinksOf(crate).map(async (link) => {
    const documentId = linkedDocumentId(link)
    if (!documentId) {
      result.unchecked.push(link)
      return
    }
    try {
      await getDocument(documentId)
    } catch (error) {
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) result.restricted.push(link)
      else result.failed = true
    }
  }))
  return result
}
