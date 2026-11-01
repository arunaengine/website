<script setup lang="ts">
// The realm nodes in calm cards: a readable name, its location, an online mark and one line of
// facts. Devices are summed up in one line, never listed. The Status page adds a Details link.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import IconTile from '@/components/ui/IconTile.vue'
import StatusMark from '@/components/ui/StatusMark.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import NodeJobsPopover from '@/components/nodes/NodeJobsPopover.vue'
import NodeNameEdit from '@/components/nodes/NodeNameEdit.vue'
import { nodeActivity, nodeName } from '@/components/nodes/node-display'
import type { RealmNodeInfo } from '@/lib/api'
import { formatCount } from '@/lib/formatCount'
import { LOCATION_AFFINITY_KEY } from '@/lib/placement'
import { formatBytes } from '@/lib/utils'
import { Info, MapPin, Server, WifiOff } from '@lucide/vue'

const props = defineProps<{
  nodes: RealmNodeInfo[]
  devices: RealmNodeInfo[]
  /** The node serving this portal, named as such. */
  localNodeId?: string | null
  /** Offers a Details button per card that opens the node's dialog. */
  details?: boolean
  /** Offered to a realm admin: names a node, null resets it. */
  rename?: (nodeId: string, name: string | null) => Promise<void>
}>()
defineEmits<{ details: [nodeId: string] }>()

function location(node: RealmNodeInfo): string | null {
  const value = node.info?.labels?.[LOCATION_AFFINITY_KEY] || node.placement?.location || ''
  return value && value !== 'default' ? value : null
}

// load_permille is the 1-minute load average per logical core, so it reads as a CPU share.
// A role other than storage leads the facts, so the header keeps room for the name.
function facts(node: RealmNodeInfo): string {
  const role = node.kind === 'management' ? 'Management node' : null
  const utilization = node.info?.utilization
  if (!utilization) return [role, 'No report yet'].filter(Boolean).join(', ')
  const parts = [role, `${formatBytes(utilization.storage_bytes_used)} stored`].filter((part): part is string => Boolean(part))
  if (utilization.load_permille !== undefined) parts.push(`CPU ${Math.round(utilization.load_permille / 10)}%`)
  if (node.placement?.full) parts.push('full')
  if (node.placement?.draining) parts.push('draining')
  return parts.join(', ')
}

const activity = nodeActivity

const devicesLine = computed(() => {
  const count = props.devices.length
  if (!count) return null
  const active = props.devices.filter((device) => device.connection_status === 'seen').length
  return `${formatCount(count)} ${count === 1 ? 'device' : 'devices'}, ${formatCount(active)} active`
})
</script>

<template>
  <div class="space-y-2">
    <ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      <li v-for="node in nodes" :key="node.node_id" class="group surface flex min-w-0 flex-col gap-3 p-4">
        <div class="flex min-w-0 items-center gap-3">
          <IconTile :icon="Server" :tone="node.present ? 'royal' : 'muted'" size="sm" />
          <div class="min-w-0 flex-1">
            <NodeNameEdit v-if="rename" quiet :name="nodeName(node)" :value="node.display_name" :save="(name) => rename!(node.node_id, name)">
              <RouterLink :to="{ name: 'node', params: { nodeId: node.node_id } }" class="truncate text-sm font-medium text-foreground hover:underline" :title="node.node_id">{{ nodeName(node) }}</RouterLink>
            </NodeNameEdit>
            <RouterLink v-else :to="{ name: 'node', params: { nodeId: node.node_id } }" class="block truncate text-sm font-medium text-foreground hover:underline" :title="node.node_id">{{ nodeName(node) }}</RouterLink>
            <p class="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
              <span v-if="node.node_id === localNodeId">This node</span>
              <span v-if="location(node)" class="inline-flex items-center gap-1"><MapPin class="size-3.5" />{{ location(node) }}</span>
            </p>
          </div>
          <StatusMark v-if="node.present" label="Online" />
          <StatusPill v-else state="Offline" tone="failed" :icon="WifiOff" />
        </div>
        <p class="text-xs text-muted-foreground">{{ facts(node) }}</p>
        <NodeJobsPopover v-if="activity(node)" :node-id="node.node_id" :label="activity(node)!" />
        <Button
          v-if="details"
          variant="outline"
          size="sm"
          class="mt-auto self-start"
          @click="$emit('details', node.node_id)"
        >
          <Info class="h-3.5 w-3.5" /> Details
        </Button>
      </li>
    </ul>
    <p v-if="devicesLine" class="text-xs text-muted-foreground">{{ devicesLine }}</p>
  </div>
</template>
