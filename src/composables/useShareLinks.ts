// Owner side of share links: the client of the node that holds the data, the link a visitor
// opens and the refusals in plain words. Links live on that node only, there is no realm index.
import { ApiError, apiErrorMessage, getShare, shareUrl, type ApiClientOptions } from '@/lib/api'
import { isDesktop, realmWebsite } from '@/lib/desktop'
import { nodeClientReady, nodeInfo } from './aruna/state'

/** The realm website the link points at; the desktop has none of its own. */
export function linkSite(): string | null {
  return isDesktop() ? realmWebsite() : window.location.origin
}

/** The node id in the link: the node that holds the data, or the connected one. */
export function linkNode(nodeId: string | null): string | null {
  return nodeId ?? nodeInfo.value?.node.peer_id ?? null
}

export function shareClient(nodeId: string | null): Promise<ApiClientOptions> {
  return nodeClientReady(nodeId)
}

/** Reads the token again, for a link created earlier. */
export async function linkFor(id: string, nodeId: string | null): Promise<string> {
  const site = linkSite()
  const node = linkNode(nodeId)
  if (!site) throw new Error('The realm website is not known, so there is no link.')
  if (!node) throw new Error('The node of this link is not known yet.')
  const { token } = await getShare(id, await shareClient(nodeId))
  return shareUrl(site, node, token)
}

export function shareErrorMessage(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.code === 'dataset_not_here') return 'This node holds no copy of the dataset, so it cannot share it.'
    if (cause.status === 403) return 'You cannot share this, or a policy does not allow share links here.'
  }
  return apiErrorMessage(cause)
}
