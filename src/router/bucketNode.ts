// A bucket address without a node opens on the node that holds the bucket. The realm bucket
// search answers before the Data view mounts, so none of its panels asks a node without the bucket.
import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'
import { useAruna } from '@/composables/useAruna'
import { activeGroupId } from '@/composables/useGroupSelection'
import { useRealmNodes } from '@/composables/useRealmNodes'

// A slow search gives up, and the view finds the node itself as before.
const SEARCH_LIMIT_MS = 3_000

export async function bucketNodeRoute(to: RouteLocationNormalized): Promise<true | RouteLocationRaw> {
  const bucket = to.params.bucketId
  if (to.query.node || typeof bucket !== 'string' || !bucket) return true
  const { bootstrapped, refresh, currentUser, searchBuckets } = useAruna()
  if (!bootstrapped.value) await refresh().catch(() => undefined)
  if (!currentUser.value) return true
  const queryGroup = typeof to.query.group === 'string' ? to.query.group : ''
  const groupId = queryGroup || activeGroupId.value || ''
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SEARCH_LIMIT_MS)
  const found = await searchBuckets(bucket, { limit: 50, groupId: groupId || undefined, signal: controller.signal })
    .catch(() => null)
    .finally(() => clearTimeout(timer))
  const hits = (found?.hits ?? []).filter((hit) => hit.bucket === bucket && (!groupId || hit.group_id === groupId))
  const { isLocalNode } = useRealmNodes()
  if (!hits.length || hits.some((hit) => isLocalNode(hit.node_id))) return true
  const holder = hits[0]
  return { name: 'bucket', params: to.params, query: { ...to.query, node: holder.node_id, ...(groupId ? {} : { group: holder.group_id }) }, hash: to.hash, replace: true }
}
