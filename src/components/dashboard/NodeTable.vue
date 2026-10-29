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
  <!-- The table fits its own width: a narrow card folds role, location and then the work into a
       small line under the name; the state always stays. -->
  <div class="@container min-w-0">
    <div v-if="rows.length > PAGE_SIZE" class="px-4 pt-3">
      <Input v-model="query" placeholder="Find a node" aria-label="Find a node" class="h-8 max-w-xs text-xs" />
    </div>
    <div class="overflow-x-auto">
      <table class="data-table">
        <thead>
          <tr>
            <th class="px-3 py-2 pl-4">Node</th>
            <th class="hidden px-3 py-2 @min-[40rem]:table-cell">Location</th>
            <th class="hidden px-3 py-2 @min-[48rem]:table-cell">Role</th>
            <th class="num px-3 py-2">Stored</th>
            <th class="num px-3 py-2">CPU</th>
            <th class="hidden px-3 py-2 @min-[32rem]:table-cell">Activity</th>
            <th class="px-3 py-2 pr-4 text-right">State</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in pageRows"
            :key="row.node.node_id"
            class="cursor-pointer border-t border-border hover:bg-muted/40"
            @click="open(row)"
          >
            <td class="w-full max-w-0 px-3 py-2.5 pl-4">
              <RouterLink :to="{ name: 'node', params: { nodeId: row.node.node_id } }" class="block truncate font-medium text-foreground hover:underline" :title="`${row.name} (${row.node.node_id})`" @click.stop>
                {{ row.name }}
              </RouterLink>
              <span class="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground @min-[48rem]:hidden">
                <span>{{ roleLabel[row.node.kind] }}<template v-if="row.here || row.place || row.location"><span class="@min-[40rem]:hidden">, {{ row.here ? 'this computer' : [row.place, row.location].filter(Boolean).join(', ') }}</span></template></span>
                <Badge v-if="nodeActivity(row.node)" variant="sky" size="sm" class="gap-1 @min-[32rem]:hidden"><Download class="h-3 w-3" /> {{ nodeActivity(row.node) }}</Badge>
              </span>
            </td>
            <td class="hidden whitespace-nowrap px-3 py-2.5 text-xs @min-[40rem]:table-cell">
              <span v-if="row.here" class="text-muted-foreground">this computer</span>
              <span v-else class="inline-flex items-center gap-1.5">
                <span v-if="row.place" class="text-foreground">{{ row.place }}</span>
                <Badge v-if="row.location" variant="outline" size="sm">{{ row.location }}</Badge>
              </span>
            </td>
            <td class="hidden whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground @min-[48rem]:table-cell">{{ roleLabel[row.node.kind] }}</td>
            <td class="num whitespace-nowrap px-3 py-2.5 text-foreground">{{ row.node.info ? formatBytes(row.node.info.utilization.storage_bytes_used) : '' }}</td>
            <td class="num whitespace-nowrap px-3 py-2.5">
              <span v-if="cpu(row.node) !== null" class="inline-flex items-center gap-2" :title="`1-minute load at ${cpu(row.node)}% of the CPU cores`">
                <span class="hidden h-1.5 w-8 overflow-hidden rounded-full bg-muted @min-[40rem]:inline-block">
                  <span
                    class="block h-full rounded-full"
                    :class="cpu(row.node)! > 70 ? 'bg-amber-500' : 'bg-aruna-royal'"
                    :style="{ width: `${Math.min(100, cpu(row.node)!)}%` }"
                  />
                </span>
                {{ cpu(row.node) }}%
              </span>
            </td>
            <td class="hidden whitespace-nowrap px-3 py-2.5 text-xs @min-[32rem]:table-cell">
              <Badge v-if="nodeActivity(row.node)" variant="sky" size="sm" class="gap-1"><Download class="h-3 w-3" /> {{ nodeActivity(row.node) }}</Badge>
            </td>
            <td class="whitespace-nowrap px-3 py-2.5 pr-4 text-right text-xs" :class="nodeOnline(row.node) ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'">
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
