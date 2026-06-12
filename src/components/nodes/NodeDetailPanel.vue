<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import CopyButton from './CopyButton.vue'
import LocalNodeDetails from './LocalNodeDetails.vue'
import { connectionLabel, connectionVariant, kindVariant, statusVariant } from './node-display'
import type { InfoResponse, RealmNodeInfo } from '@/lib/api'

defineProps<{
  node: RealmNodeInfo
  isLocal?: boolean
  info?: InfoResponse | null
}>()
</script>

<template>
  <div class="space-y-4">
    <dl class="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      <div>
        <dt class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Kind</dt>
        <dd class="mt-1"><Badge :variant="kindVariant[node.kind]" class="text-[10px] uppercase">{{ node.kind }}</Badge></dd>
      </div>
      <div>
        <dt class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Connection</dt>
        <dd class="mt-1"><Badge :variant="connectionVariant(node)" class="text-[10px] uppercase">{{ connectionLabel(node) }}</Badge></dd>
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

    <div>
      <div class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Node id</div>
      <div class="mt-1 flex items-start gap-2 rounded-md border border-border/70 bg-background/60 px-2.5 py-1.5">
        <code class="min-w-0 flex-1 break-all font-mono text-[11px] leading-relaxed text-foreground/90">{{ node.node_id }}</code>
        <CopyButton :value="node.node_id" label="Copy node id" />
      </div>
    </div>

    <template v-if="isLocal && info">
      <div class="border-t border-border/70 pt-3">
        <div class="mb-2 flex items-center gap-2">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-primary">This node</span>
          <Badge :variant="statusVariant(info.node.status)" class="text-[10px] uppercase">{{ info.node.status || 'unknown' }}</Badge>
        </div>
        <LocalNodeDetails :info="info" />
      </div>
    </template>
  </div>
</template>
