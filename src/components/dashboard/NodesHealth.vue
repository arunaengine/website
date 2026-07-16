<script setup lang="ts">
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import type { RealmNodeInfo } from '@/lib/api'
import { connectionLabel, connectionVariant, kindVariant } from '@/components/nodes/node-display'
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

function heartbeat(node: RealmNodeInfo): string | null {
  const ms = node.info?.utilization.heartbeat_at_ms
  return ms ? relativeTime(new Date(ms).toISOString()) : null
}

function labelChips(node: RealmNodeInfo): string[] {
  return Object.entries(node.info?.labels ?? {}).map(([key, value]) => `${key}=${value}`)
}
</script>

<template>
  <div class="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
    <button
      v-for="node in nodes"
      :key="node.node_id"
      type="button"
      class="rounded-lg border border-border bg-background p-3.5 text-left transition-colors hover:border-primary/40"
      :aria-label="`View ${truncateMiddle(node.node_id)} on the status page`"
      @click="$emit('select', node.node_id)"
    >
      <div class="flex items-center gap-2">
        <span class="relative flex h-2 w-2 shrink-0">
          <span
            v-if="node.connection_status === 'connected'"
            class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60 opacity-75"
          />
          <span
            :class="[
              'relative inline-flex h-2 w-2 rounded-full',
              node.connection_status === 'connected' ? 'bg-emerald-500' : 'bg-muted-foreground/50',
            ]"
          />
        </span>
        <span class="min-w-0 truncate font-mono text-[13px] font-semibold text-foreground">{{ truncateMiddle(node.node_id) }}</span>
        <span
          v-if="localPeerId && node.node_id === localPeerId"
          class="rounded-sm border border-aruna-aqua/30 bg-aruna-aqua/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-aruna-aqua"
        >
          this node
        </span>
        <Badge :variant="kindVariant[node.kind]" class="ml-auto shrink-0 text-[10px] uppercase">{{ node.kind }}</Badge>
      </div>

      <div class="mt-3">
        <template v-if="node.info">
          <div class="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
            <div class="h-full rounded-full bg-primary/70" :style="{ width: storageWidth(node) }" />
          </div>
          <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
            <span>{{ formatBytes(node.info.utilization.storage_bytes_used) }}</span>
            <span v-if="node.info.utilization.documents_held !== undefined">· {{ formatNumber(node.info.utilization.documents_held) }} docs</span>
            <span v-if="node.info.utilization.load_permille !== undefined">· load {{ node.info.utilization.load_permille }}‰</span>
            <span v-if="heartbeat(node)" class="ml-auto" :title="'Last heartbeat'">♥ {{ heartbeat(node) }}</span>
          </div>
        </template>
        <p v-else class="text-[11px] text-muted-foreground">No published info yet.</p>
      </div>

      <div class="mt-2 flex flex-wrap items-center gap-1">
        <Badge :variant="connectionVariant(node)" class="text-[9px] uppercase">{{ connectionLabel(node) }}</Badge>
        <span v-for="chip in labelChips(node).slice(0, 3)" :key="chip" class="chip text-[10px]">{{ chip }}</span>
        <span v-if="labelChips(node).length > 3" class="text-[10px] text-muted-foreground">+{{ labelChips(node).length - 3 }}</span>
      </div>
    </button>
  </div>
</template>
