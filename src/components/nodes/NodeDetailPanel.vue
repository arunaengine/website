<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import CopyButton from './CopyButton.vue'
import LocalNodeDetails from './LocalNodeDetails.vue'
import { connectionLabel, connectionVariant, kindLabel, kindVariant, statusVariant } from './node-display'
import type { NodeProbe } from './node-probe'
import type { RealmNodeInfo } from '@/lib/api'
import { formatBytes, formatNumber } from '@/lib/utils'
import { TriangleAlert } from '@lucide/vue'

defineProps<{
  node: RealmNodeInfo
  isLocal?: boolean
  probe?: NodeProbe | null
}>()
</script>

<template>
  <div class="space-y-4">
    <dl class="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      <div>
        <dt class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Kind</dt>
        <dd class="mt-1"><Badge size="sm" :variant="kindVariant[node.kind]" class="uppercase">{{ kindLabel[node.kind] }}</Badge></dd>
      </div>
      <div>
        <dt class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Connection</dt>
        <dd class="mt-1"><Badge size="sm" :variant="connectionVariant(node)" class="uppercase">{{ connectionLabel(node) }}</Badge></dd>
      </div>
      <div>
        <dt class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Configured</dt>
        <dd class="mt-1 text-xs text-foreground/90">{{ node.configured ? 'yes' : 'no' }}</dd>
      </div>
      <div>
        <dt class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Present</dt>
        <dd class="mt-1 text-xs text-foreground/90">{{ node.present ? 'yes' : 'no' }}</dd>
      </div>
    </dl>

    <div class="border-t border-border/70 pt-3">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Placement</h2>
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
      <p v-else class="mt-1 text-xs text-muted-foreground">Not in the realm's placement map.</p>
    </div>

    <div>
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Node id</h2>
      <div class="mt-1 flex items-start gap-2 rounded-md border border-border/70 bg-background/60 px-2.5 py-1.5">
        <code class="min-w-0 flex-1 break-all font-mono text-[11px] leading-relaxed text-foreground/90">{{ node.node_id }}</code>
        <CopyButton :value="node.node_id" label="Copy node id" />
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
          <dd class="mt-0.5 text-[11px] text-muted-foreground">{{ formatNumber(probe.usage.stored_blobs) }} physical blob locations</dd>
        </div>
        <div>
          <dt class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stored</dt>
          <dd class="mt-0.5 font-mono text-xs tabular-nums text-foreground/90">{{ formatBytes(probe.usage.stored_bytes) }}</dd>
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
