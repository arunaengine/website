// Checks of an import from another realm that the serving portal makes itself.
import { apiRequest, type RealmInfoResponse } from '@/lib/api'

function normalized(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`
  } catch {
    return ''
  }
}

/** Whether `ownerUrl` is the published API address of a configured node of this realm. */
export function ownerNodeAllowed(ownerUrl: string, realm: RealmInfoResponse): boolean {
  const owner = normalized(ownerUrl)
  if (!owner) return false
  return realm.nodes.some(
    (node) => node.configured && node.info?.urls.api && normalized(node.info.urls.api) === owner,
  )
}

export class OwnerNodeError extends Error {
  name = 'OwnerNodeError'
}

/**
 * The upload node a push named came through the other realm, so it is untrusted. It is
 * used only when this realm's own node list, read from its signed API address, has it.
 */
export async function checkOwnerNode(ownerUrl: string, ownApiUrl: string, token: string): Promise<string> {
  const realm = await apiRequest<RealmInfoResponse>('/system/realm', {}, { baseUrl: ownApiUrl, token })
  if (!ownerNodeAllowed(ownerUrl, realm)) {
    throw new OwnerNodeError('The other realm named a node that is not part of this realm.')
  }
  return ownerUrl
}
