<script setup lang="ts">
// The realm nodes in calm cards: a readable name, its location, whether it is online and one line of
// facts. Devices are summed up in one line, never listed. The Status page adds a Details link.
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import NodeNameEdit from '@/components/nodes/NodeNameEdit.vue'
import { nodeName } from '@/components/nodes/node-display'
import type { RealmNodeInfo } from '@/lib/api'
import { formatCount } from '@/lib/formatCount'
import { LOCATION_AFFINITY_KEY } from '@/lib/placement'
import { formatBytes } from '@/lib/utils'
import { Download } from '@lucide/vue'

const props = defineProps<{
  nodes: RealmNodeInfo[]
  devices: RealmNodeInfo[]
  /** The node serving this portal, named as such. */
  localNodeId?: string | null
  /** Offers a Details link per card; `openId` is the card whose details show. */
  details?: boolean
  openId?: string
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

// What the node's last heartbeat says it runs: imports first, as they explain a busy node.
function activity(node: RealmNodeInfo): string | null {
  const utilization = node.info?.utilization
  const jobs = (count: number) => `${formatCount(count)} ${count === 1 ? 'job' : 'jobs'}`
  if (utilization?.imports_running) return `Importing, ${jobs(utilization.imports_running)}`
  if (utilization?.jobs_running) return `Busy, ${jobs(utilization.jobs_running)}`
  return null
}

const devicesLine = computed(() => {
  const count = props.devices.length
  if (!count) return null
  const active = props.devices.filter((device) => device.connection_status === 'seen').length
  return `${formatCount(count)} ${count === 1 ? 'device' : 'devices'}, ${formatCount(active)} active`
})
</script>

<template>
  <div class="space-y-2">
    <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <li v-for="node in nodes" :key="node.node_id" class="group min-w-0 rounded-md border border-border px-3 py-2.5">
        <div class="flex min-w-0 items-center gap-2">
          <NodeNameEdit v-if="rename" quiet :name="nodeName(node)" :value="node.display_name" :save="(name) => rename!(node.node_id, name)">
            <span class="truncate text-sm font-medium text-foreground" :title="node.node_id">{{ nodeName(node) }}</span>
          </NodeNameEdit>
          <span v-else class="truncate text-sm font-medium text-foreground" :title="node.node_id">{{ nodeName(node) }}</span>
          <span v-if="node.node_id === localNodeId" class="text-[11px] text-muted-foreground">this node</span>
          <Badge v-if="location(node)" variant="outline" size="sm">{{ location(node) }}</Badge>
          <span class="ml-auto shrink-0 text-[11px]" :class="node.present ? 'text-muted-foreground' : 'text-destructive'">
            {{ node.present ? 'online' : 'offline' }}
          </span>
        </div>
        <p class="mt-1 truncate text-xs text-muted-foreground">{{ facts(node) }}</p>
        <Badge v-if="activity(node)" variant="sky" size="sm" class="mt-1.5 gap-1">
          <Download class="h-3 w-3" /> {{ activity(node) }}
        </Badge>
        <button
          v-if="details"
          type="button"
          class="mt-1 block text-[11px] font-medium text-primary hover:underline"
          :aria-expanded="openId === node.node_id"
          @click="$emit('details', node.node_id)"
        >
          {{ openId === node.node_id ? 'Hide details' : 'Details' }}
        </button>
      </li>
    </ul>
    <p v-if="devicesLine" class="text-xs text-muted-foreground">{{ devicesLine }}</p>
  </div>
</template>
