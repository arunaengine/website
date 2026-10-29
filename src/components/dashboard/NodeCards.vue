<script setup lang="ts">
// The realm nodes in calm cards: a readable name, its location, whether it is online and one line of
// facts. Devices are summed up in one line, never listed.
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import { nodeApiBase } from '@/components/nodes/node-probe'
import type { NodeImports } from '@/composables/useNodeImports'
import type { RealmNodeInfo } from '@/lib/api'
import { formatCount } from '@/lib/formatCount'
import { LOCATION_AFFINITY_KEY } from '@/lib/placement'
import { formatBytes } from '@/lib/utils'
import { Download } from '@lucide/vue'

const props = defineProps<{ nodes: RealmNodeInfo[]; devices: RealmNodeInfo[]; imports: Map<string, NodeImports> }>()

/** The node's `name` label, else the first part of its API host ("api.node-2.example" is "node-2"). */
function nodeName(node: RealmNodeInfo): string {
  const labels = node.info?.labels ?? {}
  const named = labels['name'] || labels['display_name']
  if (named) return named
  let host = ''
  try {
    host = new URL(nodeApiBase(node) ?? '').hostname
  } catch {
    // No address published yet.
  }
  if (/^[\d.]+$|:/.test(host)) return host
  const parts = host.split('.').filter(Boolean)
  return (parts[0] === 'api' ? parts[1] : parts[0]) || 'Unnamed node'
}

function location(node: RealmNodeInfo): string | null {
  const value = node.info?.labels?.[LOCATION_AFFINITY_KEY] || node.placement?.location || ''
  return value && value !== 'default' ? value : null
}

// load_permille is the 1-minute load average per logical core, so it reads as a CPU share.
function facts(node: RealmNodeInfo): string {
  const utilization = node.info?.utilization
  if (!utilization) return 'No report yet'
  const parts = [`${formatBytes(utilization.storage_bytes_used)} stored`]
  if (utilization.load_permille !== undefined) parts.push(`CPU ${Math.round(utilization.load_permille / 10)}%`)
  return parts.join(', ')
}

function importing(node: RealmNodeInfo): string | null {
  const entry = props.imports.get(node.node_id)
  if (!entry?.running) return null
  return `Importing, ${entry.more ? 'at least ' : ''}${formatCount(entry.running)} ${entry.running === 1 ? 'job' : 'jobs'}`
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
      <li v-for="node in nodes" :key="node.node_id" class="min-w-0 rounded-md border border-border px-3 py-2.5">
        <div class="flex min-w-0 items-center gap-2">
          <span class="truncate text-sm font-medium text-foreground" :title="node.node_id">{{ nodeName(node) }}</span>
          <span v-if="node.kind !== 'server'" class="text-[11px] text-muted-foreground">{{ node.kind }}</span>
          <Badge v-if="location(node)" variant="outline" size="sm">{{ location(node) }}</Badge>
          <span class="ml-auto shrink-0 text-[11px]" :class="node.present ? 'text-muted-foreground' : 'text-destructive'">
            {{ node.present ? 'online' : 'offline' }}
          </span>
        </div>
        <p class="mt-1 truncate text-xs text-muted-foreground">{{ facts(node) }}</p>
        <Badge v-if="importing(node)" variant="sky" size="sm" class="mt-1.5 gap-1">
          <Download class="h-3 w-3" /> {{ importing(node) }}
        </Badge>
      </li>
    </ul>
    <p v-if="devicesLine" class="text-xs text-muted-foreground">{{ devicesLine }}</p>
  </div>
</template>
