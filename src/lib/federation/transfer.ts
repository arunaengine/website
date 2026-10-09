// Checks of an import from another realm that the serving portal makes itself.
import { apiRequest, type ExportGrant, type ImportDestination, type RealmInfoResponse } from '@/lib/api'
import { postcardString, realmIdBytes, toHex } from './descriptor'

function normalized(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`
  } catch {
    return ''
  }
}

/** A published API address as the node serves its API: under `/api/v1`. */
function apiBase(url: string): string {
  const base = normalized(url)
  return !base || base.endsWith('/api/v1') ? base : `${base}/api/v1`
}

/** How many configured nodes of this realm publish `ownerUrl` as their API address. */
function ownerNodeCount(ownerUrl: string, realm: RealmInfoResponse): number {
  const owner = normalized(ownerUrl)
  if (!owner) return 0
  return realm.nodes.filter(
    (node) => node.configured && node.info?.urls.api && apiBase(node.info.urls.api) === owner,
  ).length
}

/** Whether exactly one configured node of this realm publishes `ownerUrl` as its API. */
export function ownerNodeAllowed(ownerUrl: string, realm: RealmInfoResponse): boolean {
  return ownerNodeCount(ownerUrl, realm) === 1
}

export class OwnerNodeError extends Error {
  name = 'OwnerNodeError'
  ambiguous = false
}

/**
 * The upload node a push named came through the other realm, so it is untrusted. It is
 * used only when this realm's own node list, read from its signed API address, has it.
 */
export async function checkOwnerNode(ownerUrl: string, ownApiUrl: string, token: string): Promise<string> {
  const realm = await apiRequest<RealmInfoResponse>('/system/realm', {}, { baseUrl: ownApiUrl, token })
  if (ownerNodeCount(ownerUrl, realm) > 1) {
    const error = new OwnerNodeError('More than one node of this realm has that address.')
    error.ambiguous = true
    throw error
  }
  if (!ownerNodeAllowed(ownerUrl, realm)) {
    throw new OwnerNodeError('The other realm named a node that is not part of this realm.')
  }
  return ownerUrl
}

/**
 * The import's idempotency key, as core `transfer::import_key` makes it: SHA-256 over the
 * postcard encoding of source realm, document, digests and destination. Equal for retries.
 */
export async function importKey(grant: ExportGrant, destination: ImportDestination): Promise<string> {
  const source = realmIdBytes(grant.source)
  if (!source) throw new Error('The export details are malformed.')
  const bytes = Uint8Array.from([
    ...source,
    ...[grant.document_id, grant.dataset_digest, grant.selection_digest].flatMap(postcardString),
    ...[destination.bucket, destination.prefix, destination.metadata_path].flatMap(postcardString),
  ])
  return `federation-${toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))}`
}
