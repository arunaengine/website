<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import LocalNodeDetails from './LocalNodeDetails.vue'
import NodeNameEdit from './NodeNameEdit.vue'
import { connectionLabel, kindLabel, nodeName, statusVariant } from './node-display'
import type { NodeProbe } from './node-probe'
import type { RealmNodeInfo } from '@/lib/api'
import { formatBytes, formatNumber } from '@/lib/utils'
import { TriangleAlert } from '@lucide/vue'

defineProps<{
  node: RealmNodeInfo
  isLocal?: boolean
  probe?: NodeProbe | null
  /** Offered to a realm admin: names the node, null resets it. */
  rename?: (nodeId: string, name: string | null) => Promise<void>
}>()
</script>

<template>
  <div class="space-y-4">
    <div>
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Name</h2>
      <div class="mt-1 text-xs text-foreground/90">
        <NodeNameEdit v-if="rename" :name="nodeName(node)" :value="node.display_name" :save="(name) => rename!(node.node_id, name)">
          {{ nodeName(node) }}
        </NodeNameEdit>
        <template v-else>{{ nodeName(node) }}</template>
      </div>
    </div>

    <dl class="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      <div>
        <dt class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Kind</dt>
        <dd class="mt-1 text-xs text-foreground/90">{{ kindLabel[node.kind] }}</dd>
      </div>
      <div>
        <dt class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Connection</dt>
        <dd class="mt-1 text-xs text-foreground/90">{{ connectionLabel(node) }}</dd>
      </div>
      <div>
        <dt class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Configured</dt>
        <dd class="mt-1 text-xs text-foreground/90">{{ node.configured ? 'yes' : 'no' }}</dd>
      </div>
      <div>
        <dt class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Present</dt>
        <dd class="mt-1 text-xs text-foreground/90">{{ node.present ? 'yes' : 'no' }}</dd>
      </div>
      <div v-if="probe?.latencyMs !== undefined" title="Best of two REST /info round trips measured from this browser">
        <dt class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Latency</dt>
        <dd class="mt-1 font-mono text-xs tabular-nums text-foreground/90">{{ Math.round(probe.latencyMs) }} ms</dd>
      </div>
    </dl>

    <div class="border-t border-border/70 pt-3">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Record placement</h2>
      <dl v-if="node.placement" class="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <div>
          <dt class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Location</dt>
          <dd class="mt-0.5 text-xs text-foreground/90">{{ node.placement.location }}</dd>
        </div>
        <div>
          <dt class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Weight</dt>
          <dd class="mt-0.5 font-mono text-xs tabular-nums text-foreground/90">{{ node.placement.weight }}</dd>
        </div>
        <div>
          <dt class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Full</dt>
          <dd class="mt-0.5 text-xs text-foreground/90">{{ node.placement.full ? 'yes' : 'no' }}</dd>
        </div>
        <div>
          <dt class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Draining</dt>
          <dd class="mt-0.5 text-xs text-foreground/90">{{ node.placement.draining ? 'yes' : 'no' }}</dd>
        </div>
      </dl>
      <p v-else class="mt-1 text-xs text-muted-foreground">Not in the realm's record placement map.</p>
    </div>

    <div v-if="Object.keys(node.info?.labels ?? {}).length" class="border-t border-border/70 pt-3">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Labels</h2>
      <ul class="mt-1.5 space-y-0.5 font-mono text-[11px] text-foreground/90">
        <li v-for="(value, key) in node.info?.labels" :key="key" class="break-all">{{ key }}={{ value }}</li>
      </ul>
    </div>

    <div>
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Node id</h2>
      <div class="mt-1 flex items-start gap-2 rounded-md border border-border/70 bg-background/60 px-2.5 py-1.5">
        <NodeLabel :node-id="node.node_id" copy class="flex-1 text-foreground/90" />
      </div>
    </div>

    <div
      v-if="probe?.state === 'unreachable'"
      class="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-2.5 py-1.5 text-xs text-red-700 dark:text-red-300"
    >
      <TriangleAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span class="min-w-0 break-words">REST endpoint unreachable{{ probe.error ? `: ${probe.error}` : '' }}</span>
    </div>

    <div v-if="probe?.usage" class="border-t border-border/70 pt-3">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Storage usage</h2>
      <dl class="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <div>
          <dt class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Objects</dt>
          <dd class="mt-0.5 font-mono text-xs tabular-nums text-foreground/90">{{ formatNumber(probe.usage.objects) }}</dd>
          <dd class="mt-0.5 text-[11px] text-muted-foreground">{{ formatNumber(probe.usage.stored_blobs ?? 0) }} physical blob locations</dd>
        </div>
        <div>
          <dt class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stored</dt>
          <dd class="mt-0.5 font-mono text-xs tabular-nums text-foreground/90">{{ formatBytes(probe.usage.stored_bytes ?? 0) }}</dd>
        </div>
        <div>
          <dt class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Buckets</dt>
          <dd class="mt-0.5 font-mono text-xs tabular-nums text-foreground/90">{{ formatNumber(probe.usage.buckets) }}</dd>
        </div>
      </dl>
    </div>

    <template v-if="probe?.info">
      <div class="border-t border-border/70 pt-3">
        <div class="mb-2 flex items-center gap-2">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-primary">{{ isLocal ? 'This node' : 'Node details' }}</span>
          <Badge size="sm" :variant="statusVariant(probe.info.node.status)" class="uppercase">{{ probe.info.node.status || 'unknown' }}</Badge>
        </div>
        <LocalNodeDetails :info="probe.info" />
      </div>
    </template>
  </div>
</template>
