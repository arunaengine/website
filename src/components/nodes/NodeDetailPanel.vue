<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import LocalNodeDetails from './LocalNodeDetails.vue'
import NodeNameEdit from './NodeNameEdit.vue'
import { nodeName, statusProblem, statusVariant } from './node-display'
import { nodeApiBase, type NodeProbe } from './node-probe'
import type { RealmNodeInfo } from '@/lib/api'
import { formatBytes, formatNumber } from '@/lib/utils'
import { TriangleAlert } from '@lucide/vue'

defineProps<{
  node: RealmNodeInfo
  isLocal?: boolean
  probe?: NodeProbe | null
  /** Offered to a realm admin: names the node, null resets it. */
  rename?: (nodeId: string, name: string | null) => Promise<void>
  /** The node dialog names the node in its own header. */
  hideName?: boolean
}>()
</script>

<template>
  <div class="space-y-4">
    <div v-if="!hideName">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Name</h2>
      <div class="mt-1 text-xs text-foreground/90">
        <!-- Keyed by node, so a draft for one node never saves onto the next one shown. -->
        <NodeNameEdit v-if="rename" :key="node.node_id" :name="nodeName(node)" :value="node.display_name" :save="(name) => rename!(node.node_id, name)">
          {{ nodeName(node) }}
        </NodeNameEdit>
        <template v-else>{{ nodeName(node) }}</template>
      </div>
    </div>

    <!-- Role and online state are on the card or page header already; these are the rest. -->
    <dl class="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      <div>
        <dt class="type-label">Configured</dt>
        <dd class="mt-1 text-xs text-foreground/90">{{ node.configured ? 'yes' : 'no' }}</dd>
      </div>
      <div v-if="probe?.latencyMs !== undefined" title="Best of two REST /info round trips measured from this browser">
        <dt class="type-label">Latency</dt>
        <dd class="mt-1 font-mono text-xs tabular-nums text-foreground/90">{{ Math.round(probe.latencyMs) }} ms</dd>
      </div>
    </dl>

    <div class="border-t border-border/70 pt-3">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Record placement</h2>
      <dl v-if="node.placement" class="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <!-- "default" names no place, so only a real location shows. -->
        <div v-if="node.placement.location && node.placement.location !== 'default'">
          <dt class="type-label">Location</dt>
          <dd class="mt-0.5 text-xs text-foreground/90">{{ node.placement.location }}</dd>
        </div>
        <div>
          <dt class="type-label">Weight</dt>
          <dd class="mt-0.5 font-mono text-xs tabular-nums text-foreground/90">{{ node.placement.weight }}</dd>
        </div>
        <div>
          <dt class="type-label">Full</dt>
          <dd class="mt-0.5 text-xs text-foreground/90">{{ node.placement.full ? 'yes' : 'no' }}</dd>
        </div>
        <div>
          <dt class="type-label">Draining</dt>
          <dd class="mt-0.5 text-xs text-foreground/90">{{ node.placement.draining ? 'yes' : 'no' }}</dd>
        </div>
      </dl>
      <p v-else class="mt-1 text-xs text-muted-foreground">Not in the realm's record placement map.</p>
    </div>

    <!-- Labels are for admins; they wait folded until asked for. -->
    <details v-if="Object.keys(node.info?.labels ?? {}).length" class="border-t border-border/70 pt-3">
      <summary class="cursor-pointer font-display text-sm font-semibold text-aruna-navy">Labels ({{ Object.keys(node.info?.labels ?? {}).length }})</summary>
      <ul class="mt-1.5 space-y-0.5 font-mono text-[11px] text-foreground/90">
        <li v-for="(value, key) in node.info?.labels" :key="key" class="break-all">{{ key }}={{ value }}</li>
      </ul>
    </details>

    <div>
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Node id</h2>
      <div class="mt-1 flex items-start gap-2 rounded-md border border-border/70 bg-background/60 px-2.5 py-1.5">
        <span class="hash min-w-0 flex-1 break-all text-xs text-foreground/90">{{ node.node_id }}</span>
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
          <dt class="type-label">Objects</dt>
          <dd class="mt-0.5 font-mono text-xs tabular-nums text-foreground/90">{{ formatNumber(probe.usage.objects) }}</dd>
          <dd class="mt-0.5 text-[11px] text-muted-foreground">{{ formatNumber(probe.usage.stored_blobs ?? 0) }} physical blob locations</dd>
        </div>
        <div>
          <dt class="type-label">Stored</dt>
          <dd class="mt-0.5 font-mono text-xs tabular-nums text-foreground/90">{{ formatBytes(probe.usage.stored_bytes ?? 0) }}</dd>
        </div>
        <div>
          <dt class="type-label">Buckets</dt>
          <dd class="mt-0.5 font-mono text-xs tabular-nums text-foreground/90">{{ formatNumber(probe.usage.buckets) }}</dd>
        </div>
      </dl>
    </div>

    <template v-if="probe?.info">
      <div class="border-t border-border/70 pt-3">
        <div class="mb-2 flex items-center gap-2">
          <span class="type-label text-primary">{{ isLocal ? 'This node' : 'Node details' }}</span>
          <!-- A fine status says nothing; only a problem is named. -->
          <Badge v-if="statusProblem(probe.info.node.status)" size="sm" :variant="statusVariant(probe.info.node.status)">{{ statusProblem(probe.info.node.status)!.word }}</Badge>
        </div>
        <LocalNodeDetails
          :info="probe.info"
          :public-api="nodeApiBase(node)"
          :public-s3="node.info?.urls.s3 ?? null"
          :device="node.kind === 'user'"
        />
      </div>
    </template>
  </div>
</template>
