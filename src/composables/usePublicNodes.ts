// The realm's nodes for the dashboard. Signed out, a realm that lists no node records still
// publishes each node's address; such a node is online when its /system/info answers.
import { computed, ref, watch, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import type { RealmNodeInfo } from '@/lib/api'

export function usePublicNodes(recorded: Ref<RealmNodeInfo[]>) {
  const { currentUser, getNodeInfo, realmInfo } = useAruna()
  // Each published node's answer of the last round; null until every node answered or failed.
  const online = ref<Map<string, boolean> | null>(null)
  let round = 0

  const published = computed(() => (currentUser.value || recorded.value.length ? [] : realmInfo.value?.public_nodes ?? []))

  watch([published, realmInfo], async () => {
    const mine = ++round
    const nodes = published.value
    if (!nodes.length) {
      online.value = null
      return
    }
    const answers = await Promise.all(nodes.map((node) => getNodeInfo(node.node_id).then(() => true, () => false)))
    if (mine === round) online.value = new Map(nodes.map((node, index) => [node.node_id, answers[index]!]))
  }, { immediate: true })

  return computed<RealmNodeInfo[]>(() => {
    if (recorded.value.length || !online.value) return recorded.value
    const management = new Set(realmInfo.value?.management_urls ?? [])
    return published.value.map((node) => {
      const up = online.value?.get(node.node_id) === true
      return {
        node_id: node.node_id,
        kind: management.has(node.api_url) ? 'management' : 'server',
        configured: true,
        present: up,
        connection_status: up ? 'connected' : 'configured',
        rest_url: node.api_url,
      }
    })
  })
}
