<script setup lang="ts">
// The realm's nodes as a table: name, location, type, stored data, CPU, what runs there and the
// state. This computer leads in the desktop, offline nodes come first. Five rows a page under a
// search. A row opens the node's details; hovering one lights up its node on the topology.
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import FilterChips from '@/components/ui/FilterChips.vue'
import IconTile from '@/components/ui/IconTile.vue'
import Input from '@/components/ui/Input.vue'
import Pagination from '@/components/ui/Pagination.vue'
import StatusMark from '@/components/ui/StatusMark.vue'
import { nodeActivity, nodeName, nodeOnline, roleLabel } from '@/components/nodes/node-display'
import { computerName } from '@/composables/useRealmNodes'
import type { RealmNodeInfo } from '@/lib/api'
import { LOCATION_AFFINITY_KEY } from '@/lib/placement'
import { formatBytes, relativeTime } from '@/lib/utils'
import { Download, Laptop, MapPin, Server } from '@lucide/vue'

const props = withDefaults(defineProps<{
  nodes: RealmNodeInfo[]
  /** This computer's own device record in the desktop, listed first. */
  computer?: RealmNodeInfo | null
  /** The node lit up on the topology. */
  highlight?: string | null
  /** False for a visitor, whom the node details have nothing to show. */
  linked?: boolean
}>(), { computer: null, highlight: null, linked: true })
const emit = defineEmits<{ hover: [nodeId: string | null] }>()

const PAGE_SIZE = 5

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
// The desktop lists this computer too, so it can show only the nodes or only the devices.
const kind = ref('all')
const kinds = computed(() => [
  { value: 'all', label: 'All', count: rows.value.length },
  { value: 'nodes', label: 'Nodes', count: props.nodes.length },
  { value: 'devices', label: 'Devices', count: props.computer ? 1 : 0 },
])
const shown = computed(() => {
  const term = query.value.trim().toLowerCase()
  return rows.value
    .filter((row) => kind.value === 'all' || row.here === (kind.value === 'devices'))
    .filter((row) => !term || [row.name, row.place ?? '', row.location ?? '', roleLabel[row.node.kind]].some((text) => text.toLowerCase().includes(term)))
    .sort((a, b) => Number(nodeOnline(a.node)) - Number(nodeOnline(b.node)))
})
// A location column only says something when the nodes stand in more than one place.
const where = (row: Row) => [row.place, row.location].filter(Boolean).join(', ')
const onePlace = computed(() => new Set(rows.value.filter((row) => !row.here).map(where)).size <= 1)
const pageCount = computed(() => Math.max(1, Math.ceil(shown.value.length / PAGE_SIZE)))
const pageRows = computed(() => shown.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
watch([query, kind], () => (page.value = 1))
watch(pageCount, (count) => {
  if (page.value > count) page.value = count
})

const cpu = (node: RealmNodeInfo) => {
  const permille = node.info?.utilization.load_permille
  return permille === undefined ? null : Math.round(permille / 10)
}
const open = (row: Row) => props.linked && void router.push({ name: 'node', params: { nodeId: row.node.node_id } })
const typeLabel = (row: Row) => `${roleLabel[row.node.kind].charAt(0).toUpperCase()}${roleLabel[row.node.kind].slice(1)}`
// When an offline node was last heard of: a device by its last contact, a node by its heartbeat.
function lastSeen(node: RealmNodeInfo): string | null {
  const ms = node.kind === 'user' ? node.last_seen_ms : node.info?.utilization.heartbeat_at_ms
  return ms ? relativeTime(new Date(ms).toISOString()) : null
}
</script>

<template>
  <div class="flex min-w-0 flex-col">
    <div class="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-3">
      <Input
        v-model="query"
        :placeholder="computer ? 'Find a node or device' : 'Find a node'"
        :aria-label="computer ? 'Find a node or device' : 'Find a node'"
        class="h-8 max-w-xs text-xs"
      />
      <FilterChips v-if="computer" v-model="kind" :options="kinds" aria-label="Show" />
    </div>
    <div class="overflow-x-auto">
      <table class="data-table data-table-tall">
        <thead>
          <tr>
            <th class="pl-4">Node</th>
            <th v-if="!onePlace" class="hidden 2xl:table-cell">Location</th>
            <th class="hidden sm:table-cell lg:hidden xl:table-cell">Type</th>
            <th class="num">Stored</th>
            <th class="num hidden md:table-cell">CPU</th>
            <th class="hidden 2xl:table-cell">Activity</th>
            <th class="pr-4 text-right">State</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in pageRows"
            :key="row.node.node_id"
            :class="[highlight === row.node.node_id ? 'bg-muted/60' : '', linked ? 'cursor-pointer' : '']"
            :tabindex="linked ? 0 : undefined"
            @click="open(row)"
            @keydown.enter="open(row)"
            @mouseenter="emit('hover', row.node.node_id)"
            @mouseleave="emit('hover', null)"
            @focusin="emit('hover', row.node.node_id)"
            @focusout="emit('hover', null)"
          >
            <td class="w-full min-w-48 max-w-0 pl-4">
              <span class="flex items-center gap-3">
                <IconTile :icon="row.here ? Laptop : Server" :tone="row.here ? 'aqua' : nodeOnline(row.node) ? 'royal' : 'muted'" size="sm" />
                <span class="min-w-0">
                  <RouterLink
                    v-if="linked"
                    :to="{ name: 'node', params: { nodeId: row.node.node_id } }"
                    class="block truncate font-medium text-foreground hover:underline max-sm:whitespace-normal"
                    :title="`${row.name} (${row.node.node_id})`"
                    @click.stop
                  >
                    {{ row.name }}
                  </RouterLink>
                  <span v-else class="block truncate font-medium text-foreground max-sm:whitespace-normal" :title="row.name">{{ row.name }}</span>
                  <!-- What the hidden columns would say, in a small line under the name. -->
                  <span class="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    <span class="sm:hidden lg:inline xl:hidden">{{ typeLabel(row) }}</span>
                    <span v-if="row.here">This computer</span>
                    <span v-else-if="!onePlace && where(row)" class="2xl:hidden">{{ where(row) }}</span>
                    <span v-if="nodeActivity(row.node)" class="inline-flex items-center gap-1 whitespace-nowrap text-sky-700 dark:text-aruna-aqua 2xl:hidden">
                      <Download class="h-3 w-3" />{{ nodeActivity(row.node) }}
                    </span>
                    <span v-if="!nodeOnline(row.node) && lastSeen(row.node)">Last seen {{ lastSeen(row.node) }}</span>
                  </span>
                </span>
              </span>
            </td>
            <td v-if="!onePlace" class="hidden whitespace-nowrap text-xs 2xl:table-cell">
              <span v-if="row.here" class="text-muted-foreground">This computer</span>
              <span v-else-if="where(row)" class="inline-flex items-center gap-1.5 text-foreground"><MapPin class="h-3 w-3 text-muted-foreground" />{{ where(row) }}</span>
            </td>
            <td class="hidden whitespace-nowrap text-xs text-muted-foreground sm:table-cell lg:hidden xl:table-cell">{{ typeLabel(row) }}</td>
            <td class="num whitespace-nowrap">{{ row.node.info ? formatBytes(row.node.info.utilization.storage_bytes_used) : '' }}</td>
            <td class="num hidden whitespace-nowrap md:table-cell" :title="cpu(row.node) !== null ? `1-minute load at ${cpu(row.node)}% of the CPU cores` : undefined">
              <template v-if="cpu(row.node) !== null">{{ cpu(row.node) }}%</template>
              <span v-else class="text-muted-foreground">-</span>
            </td>
            <td class="hidden whitespace-nowrap 2xl:table-cell">
              <span v-if="nodeActivity(row.node)" class="inline-flex items-center gap-1 text-xs text-sky-700 dark:text-aruna-aqua"><Download class="h-3 w-3" />{{ nodeActivity(row.node) }}</span>
            </td>
            <td class="pr-4 text-right">
              <StatusMark v-if="nodeOnline(row.node)" label="Online" />
              <StatusMark v-else label="Offline" offline />
            </td>
          </tr>
          <tr v-if="!pageRows.length">
            <td colspan="7" class="px-4 py-4 text-center text-xs text-muted-foreground">No node matches.</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="pageCount > 1" class="mt-auto flex justify-end border-t border-border-subtle px-4 py-2">
      <Pagination v-model:page="page" :page-count="pageCount" :has-next="page < pageCount" />
    </div>
  </div>
</template>
