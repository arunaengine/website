<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import NodesHealth from '@/components/dashboard/NodesHealth.vue'
import type { RealmNodeInfo } from '@/lib/api'
import { kindVariant } from '@/components/nodes/node-display'

const props = defineProps<{
  nodes: RealmNodeInfo[]
  replicationFactor: number
  /** peer id of the node this portal is connected to */
  localPeerId?: string
}>()

const router = useRouter()

function openNode(id: string) {
  void router.push({ name: 'status', query: { node: id } })
}

const connectedCount = computed(() => props.nodes.filter((node) => node.connection_status === 'connected').length)

const kindCounts = computed<Array<[RealmNodeInfo['kind'], number]>>(() => {
  const counts = new Map<RealmNodeInfo['kind'], number>()
  for (const node of props.nodes) counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1)
  return [...counts.entries()]
})

// Published labels flattened across nodes into `key=value → count`, most common
// first. Only real, self-published labels — no fabricated per-node numbers.
const labelCounts = computed<Array<[string, number]>>(() => {
  const counts = new Map<string, number>()
  for (const node of props.nodes) {
    for (const [key, value] of Object.entries(node.info?.labels ?? {})) {
      const chip = `${key}=${value}`
      counts.set(chip, (counts.get(chip) ?? 0) + 1)
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
})
</script>

<template>
  <section>
    <div class="mb-3.5 flex flex-wrap items-center justify-between gap-2">
      <h2 class="font-display text-[15px] font-semibold text-foreground/85">Federation network</h2>
      <div class="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <Badge variant="outline" class="tabular-nums">{{ nodes.length }} nodes</Badge>
        <Badge variant="outline" class="tabular-nums">{{ connectedCount }} connected</Badge>
        <Badge variant="outline">replication ×{{ replicationFactor }}</Badge>
        <RouterLink to="/app/status" class="text-xs font-medium text-primary hover:underline">Node status</RouterLink>
      </div>
    </div>

    <div class="surface overflow-hidden rounded-xl p-0">
      <div v-if="!nodes.length" class="px-5 py-12 text-center text-xs text-muted-foreground">
        This realm has no nodes yet.
      </div>

      <template v-else>
        <!-- Real aggregates: kinds and self-published labels -->
        <div class="flex flex-wrap items-center gap-2 border-b border-border/60 px-5 py-3">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Kinds</span>
          <Badge v-for="[kind, count] in kindCounts" :key="kind" :variant="kindVariant[kind]" class="text-[10px]">
            {{ kind }} · {{ count }}
          </Badge>
        </div>
        <div class="flex flex-wrap items-center gap-2 border-b border-border/60 px-5 py-3">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Labels</span>
          <template v-if="labelCounts.length">
            <span v-for="[label, count] in labelCounts" :key="label" class="chip">{{ label }} · {{ count }}</span>
          </template>
          <span v-else class="text-[11px] text-muted-foreground">No nodes have published labels yet.</span>
        </div>

        <!-- Node health grid: only data the realm actually reports -->
        <NodesHealth :nodes="nodes" :local-peer-id="localPeerId" @select="openNode" />
      </template>
    </div>
  </section>
</template>
