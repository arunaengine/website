<script setup lang="ts">
import { computed } from 'vue'
import { useNow } from '@vueuse/core'
import Badge from '@/components/ui/Badge.vue'
import LabelChip from '@/components/ui/LabelChip.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import type { RealmNodeInfo } from '@/lib/api'
import { connectionLabel, connectionVariant, kindLabel, kindVariant } from '@/components/nodes/node-display'
import { stateTone, toneVariant } from '@/lib/stateBadge'
import { formatBytes, formatNumber, relativeTime, truncateMiddle } from '@/lib/utils'

// Visual node-health grid over the realm's real published node data (no
// fabricated quotas): connection state, self-published utilization with a
// relative storage bar, heartbeat age and labels.
const props = defineProps<{
  nodes: RealmNodeInfo[]
  localPeerId?: string
}>()

defineEmits<{ (e: 'select', nodeId: string): void }>()

// Relative bar: each node's storage share of the largest reporter. Honest
// (ratios of real numbers), no invented capacity.
const maxStorage = computed(() =>
  props.nodes.reduce((max, node) => Math.max(max, node.info?.utilization.storage_bytes_used ?? 0), 0) || 1,
)

function storageWidth(node: RealmNodeInfo): string {
  const used = node.info?.utilization.storage_bytes_used ?? 0
  return `${Math.min((used / maxStorage.value) * 100, 100)}%`
}

// Reading `now` re-renders the labels as time passes; 1s so ages count up
// smoothly instead of jumping.
const now = useNow({ interval: 1_000 })
function heartbeat(node: RealmNodeInfo): string | null {
  const ms = node.info?.utilization.heartbeat_at_ms
  return ms && now.value ? relativeTime(new Date(ms).toISOString()) : null
}

// load_permille is the 1-minute load average scaled to permille of logical
// cores (1000‰ = one runnable process per core), clamped 0..1000 by the node.
function loadPermille(node: RealmNodeInfo): number {
  return node.info?.utilization.load_permille ?? 0
}

function loadPercent(node: RealmNodeInfo): number {
  return Math.round(loadPermille(node) / 10)
}

function loadWidth(node: RealmNodeInfo): string {
  return `${Math.min(loadPermille(node) / 10, 100)}%`
}

function loadFill(node: RealmNodeInfo): string {
  const permille = loadPermille(node)
  if (permille >= 800) return 'bg-destructive'
  if (permille >= 500) return 'bg-amber-500'
  return 'bg-emerald-500'
}

function loadTextTone(node: RealmNodeInfo): string {
  const permille = loadPermille(node)
  if (permille >= 800) return 'text-destructive'
  if (permille >= 500) return 'text-amber-600 dark:text-amber-500'
  return 'text-muted-foreground'
}

// Mirrors connectionVariant: no recent contact is a missing signal, not a fault.
function connectionTone(node: RealmNodeInfo) {
  return node.connection_status === 'unknown' ? ('idle' as const) : stateTone(node.connection_status)
}

function labelChips(node: RealmNodeInfo): string[] {
  return Object.entries(node.info?.labels ?? {}).map(([key, value]) => `${key}=${value}`)
}
</script>

<template>
  <div class="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
    <div
      v-for="node in nodes"
      :key="node.node_id"
      class="rounded-lg border border-border bg-background p-3.5 transition-colors hover:border-primary/40"
    >
      <button
        type="button"
        class="block w-full text-left"
        :aria-label="`View ${truncateMiddle(node.node_id)} on the status page`"
        @click="$emit('select', node.node_id)"
      >
        <div class="flex items-center gap-2">
          <StatusDot :tone="connectionTone(node)" :label="connectionLabel(node)" />
          <NodeLabel :node-id="node.node_id" class="font-semibold text-foreground" />
          <Badge
            v-if="localPeerId && node.node_id === localPeerId"
            :variant="toneVariant('info')"
            size="sm"
            class="uppercase tracking-wider"
          >
            this node
          </Badge>
          <Badge :variant="kindVariant[node.kind]" size="sm" class="ml-auto shrink-0 uppercase">{{ kindLabel[node.kind] }}</Badge>
        </div>

        <div class="mt-3">
          <template v-if="node.info">
            <div class="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
              <div class="h-full rounded-full bg-primary/70" :style="{ width: storageWidth(node) }" />
            </div>
            <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-muted-foreground">
              <span>{{ formatBytes(node.info.utilization.storage_bytes_used) }}</span>
              <span
                v-if="node.info.utilization.documents_held !== undefined"
                title="Datasets this node holds by placement shard"
              >
                · {{ formatNumber(node.info.utilization.documents_held) }} datasets
              </span>
              <span
                v-if="node.info.utilization.load_permille !== undefined"
                class="inline-flex items-center gap-1"
                :title="`1-minute load average at ${loadPercent(node)}% of CPU cores (1000‰ = one runnable process per core)`"
              >
                ·
                <span class="inline-block h-1.5 w-8 overflow-hidden rounded-full bg-muted">
                  <span class="block h-full rounded-full" :class="loadFill(node)" :style="{ width: loadWidth(node) }" />
                </span>
                <span :class="loadTextTone(node)">{{ loadPercent(node) }}%</span>
              </span>
              <span v-if="heartbeat(node)" class="ml-auto" title="Last heartbeat">♥ {{ heartbeat(node) }}</span>
            </div>
          </template>
          <p v-else class="text-[11px] text-muted-foreground">No published info yet.</p>
        </div>
      </button>

      <!-- Outside the card button: a chip is itself a button and must not nest. -->
      <div class="mt-2 flex flex-wrap items-center gap-1">
        <Badge :variant="connectionVariant(node)" size="sm" class="uppercase">{{ connectionLabel(node) }}</Badge>
        <LabelChip v-for="chip in labelChips(node).slice(0, 3)" :key="chip" :value="chip" class="text-[10px]" />
        <span v-if="labelChips(node).length > 3" class="text-[10px] text-muted-foreground">+{{ labelChips(node).length - 3 }}</span>
      </div>
    </div>
  </div>
</template>
