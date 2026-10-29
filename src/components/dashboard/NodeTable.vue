<script setup lang="ts">
// The realm's nodes as a table that scales: name, location, role, stored data, CPU, what runs there and
// the state, one word each. This computer leads in the desktop. Eight rows a page, a search above
// once there are more. A row opens the node's page.
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import Pagination from '@/components/ui/Pagination.vue'
import { nodeActivity, nodeName, nodeOnline, roleLabel } from '@/components/nodes/node-display'
import { computerName } from '@/composables/useRealmNodes'
import type { RealmNodeInfo } from '@/lib/api'
import { LOCATION_AFFINITY_KEY } from '@/lib/placement'
import { formatBytes } from '@/lib/utils'
import { Download } from '@lucide/vue'

const props = defineProps<{
  nodes: RealmNodeInfo[]
  /** This computer's own device record in the desktop, listed first. */
  computer?: RealmNodeInfo | null
}>()

const PAGE_SIZE = 8

const router = useRouter()
const query = ref('')
const page = ref(1)

interface Row {
  node: RealmNodeInfo
  name: string
  place: string | null
  location: string | null
  here: boolean
}
const location = (node: RealmNodeInfo) => {
  const value = node.info?.labels?.[LOCATION_AFFINITY_KEY] || node.placement?.location || ''
  return value && value !== 'default' ? value : null
}
// The node's place first; its location label or placement location after, unless the same.
const rows = computed<Row[]>(() => [
  ...(props.computer ? [{ node: props.computer, name: computerName(props.computer), place: null, location: null, here: true }] : []),
  ...props.nodes.map((node) => {
    const place = node.place?.trim() || null
    const at = location(node)
    return { node, name: nodeName(node), place, location: at && at !== place ? at : null, here: false }
  }),
])
const shown = computed(() => {
  const term = query.value.trim().toLowerCase()
  if (!term) return rows.value
  return rows.value.filter((row) => [row.name, row.place ?? '', row.location ?? '', roleLabel[row.node.kind]].some((text) => text.toLowerCase().includes(term)))
})
const pageCount = computed(() => Math.max(1, Math.ceil(shown.value.length / PAGE_SIZE)))
const pageRows = computed(() => shown.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
watch(query, () => (page.value = 1))
watch(pageCount, (count) => {
  if (page.value > count) page.value = count
})

const cpu = (node: RealmNodeInfo) => {
  const permille = node.info?.utilization.load_permille
  return permille === undefined ? null : Math.round(permille / 10)
}
const open = (row: Row) => void router.push({ name: 'node', params: { nodeId: row.node.node_id } })
</script>

<template>
  <div class="min-w-0">
    <div v-if="rows.length > PAGE_SIZE" class="px-4 pt-3">
      <Input v-model="query" placeholder="Find a node" aria-label="Find a node" class="h-8 max-w-xs text-xs" />
    </div>
    <div class="overflow-x-auto">
      <table class="w-full min-w-max text-sm">
        <thead class="text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th class="px-4 py-2 text-left font-semibold">Node</th>
            <th class="px-4 py-2 text-left font-semibold">Location</th>
            <th class="px-4 py-2 text-left font-semibold">Role</th>
            <th class="px-4 py-2 text-left font-semibold">Stored</th>
            <th class="px-4 py-2 text-left font-semibold">CPU</th>
            <th class="px-4 py-2 text-left font-semibold">Activity</th>
            <th class="px-4 py-2 text-left font-semibold">State</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in pageRows"
            :key="row.node.node_id"
            class="cursor-pointer border-t border-border hover:bg-muted/40"
            @click="open(row)"
          >
            <td class="px-4 py-2.5">
              <RouterLink :to="{ name: 'node', params: { nodeId: row.node.node_id } }" class="font-medium text-foreground hover:underline" :title="row.node.node_id" @click.stop>
                {{ row.name }}
              </RouterLink>
            </td>
            <td class="px-4 py-2.5 text-xs">
              <span v-if="row.here" class="text-muted-foreground">this computer</span>
              <span v-else class="inline-flex items-center gap-1.5">
                <span v-if="row.place" class="text-foreground">{{ row.place }}</span>
                <Badge v-if="row.location" variant="outline" size="sm">{{ row.location }}</Badge>
              </span>
            </td>
            <td class="px-4 py-2.5 text-xs text-muted-foreground">{{ roleLabel[row.node.kind] }}</td>
            <td class="px-4 py-2.5 text-xs tabular-nums text-foreground">{{ row.node.info ? formatBytes(row.node.info.utilization.storage_bytes_used) : '' }}</td>
            <td class="px-4 py-2.5 text-xs tabular-nums">
              <span v-if="cpu(row.node) !== null" class="inline-flex items-center gap-2" :title="`1-minute load at ${cpu(row.node)}% of the CPU cores`">
                <span class="inline-block h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                  <span
                    class="block h-full rounded-full"
                    :class="cpu(row.node)! > 70 ? 'bg-amber-500' : 'bg-aruna-royal'"
                    :style="{ width: `${Math.min(100, cpu(row.node)!)}%` }"
                  />
                </span>
                {{ cpu(row.node) }}%
              </span>
            </td>
            <td class="px-4 py-2.5 text-xs">
              <Badge v-if="nodeActivity(row.node)" variant="sky" size="sm" class="gap-1"><Download class="h-3 w-3" /> {{ nodeActivity(row.node) }}</Badge>
            </td>
            <td class="px-4 py-2.5 text-xs" :class="nodeOnline(row.node) ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'">
              {{ nodeOnline(row.node) ? 'online' : 'offline' }}
            </td>
          </tr>
          <tr v-if="!pageRows.length">
            <td colspan="7" class="px-4 py-4 text-center text-xs text-muted-foreground">No node matches.</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
      <span>Click a node for details.</span>
      <Pagination v-if="pageCount > 1" v-model:page="page" :page-count="pageCount" :has-next="page < pageCount" />
    </div>
  </div>
</template>
