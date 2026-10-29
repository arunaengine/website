// Renames realm nodes and devices. The name lives in the replicated realm configuration, so the realm
// listing is read again afterwards; other nodes learn it a moment later.
import { request } from '@/composables/aruna/state'
import { useAruna } from '@/composables/useAruna'

export function useNodeNames() {
  const { loadInfo } = useAruna()

  async function save(path: string, name: string | null) {
    await request(path, { method: 'PATCH', body: JSON.stringify({ display_name: name }) })
    await loadInfo().catch(() => undefined)
  }

  return {
    /** A realm admin names any node; null resets it to the node's own name. */
    renameNode: (nodeId: string, name: string | null) => save(`/system/realm/nodes/${encodeURIComponent(nodeId)}`, name),
    /** The owner names an enrolled device, addressed by its node id. */
    renameDevice: (nodeId: string, name: string | null) => save(`/access/users/me/devices/${encodeURIComponent(nodeId)}`, name),
  }
}
