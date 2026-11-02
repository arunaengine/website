<script setup lang="ts">
// This computer as four cards: its state, the linked folders, the local runs and what is moving.
// Every number is what the node reported; a read that is not ready says so instead of a zero.
// It reads the node's lists on every visit.
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, CircleCheck, Clock, Container, Folder, FolderPlus, FolderSync, Gauge, Laptop, Network, Pause, Power, SlidersHorizontal, TriangleAlert, WifiOff, Workflow } from '@lucide/vue'
import Button from '@/components/ui/Button.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import StatusMark from '@/components/ui/StatusMark.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import IconTile from '@/components/ui/IconTile.vue'
import OverviewCell from '@/components/dashboard/OverviewCell.vue'
import BindFolderDialog from '@/components/desktop/BindFolderDialog.vue'
import NodeNameEdit from '@/components/nodes/NodeNameEdit.vue'
import { usePortalFeatures } from '@/composables/usePortalFeatures'
import { useDeviceCompute } from '@/composables/useDeviceCompute'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { useDeviceTransfers } from '@/composables/useDeviceTransfers'
import { useSyncedFolders } from '@/composables/useSyncedFolders'
import { useNodeNames } from '@/composables/useNodeNames'
import { isMoving, type DeviceTransfer } from '@/lib/deviceApi'
import { formatCount } from '@/lib/formatCount'
import { nodePill, plainDuration } from '@/lib/nodePill'
import { needsYouCount, transferLabel } from '@/lib/syncStates'
import { relativeTime } from '@/lib/utils'

/**
 * `nodeId` and `value` let the owner rename this computer through the device route;
 * `connected` counts the realm nodes it reaches now.
 */
const props = defineProps<{ name: string; nodeId?: string | null; value?: string | null; connected?: { count: number; total: number } | null }>()
const { renameDevice } = useNodeNames()

const { shown } = usePortalFeatures()
const { status, refresh, deviceClient } = useDeviceStatus()
const { folders, listState: foldersState, load: loadFolders } = useSyncedFolders()
const { all: transfers, load: loadTransfers, state: transfersState } = useDeviceTransfers()
const { compute, state: computeState, load: loadCompute } = useDeviceCompute()
const showBind = ref(false)

const pill = computed(() => nodePill(status.value))
const running = computed(() => status.value?.state === 'running' && status.value.ready)
const stopped = computed(() => status.value?.state === 'stopped' || status.value?.state === 'error')
const runsShown = computed(() => shown('compute'))

// A read on its way is not the same as one that failed.
const waiting = (state: string) => (state === 'idle' || state === 'loading' ? 'Reading' : 'Not available right now')
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)

const folderState = computed(() => {
  const list = folders.value
  const needsYou = list.reduce((sum, folder) => sum + needsYouCount(folder.counters), 0)
  if (needsYou) return { warn: true, text: `${formatCount(needsYou)} ${plural(needsYou, 'file needs', 'files need')} you` }
  if (list.some((folder) => folder.state === 'error' || folder.last_error || folder.counters.errors)) return { warn: true, text: 'With errors' }
  if (list.some((folder) => folder.state !== 'active' || folder.counters.uploading)) return { warn: false, text: 'Syncing' }
  const last = Math.max(0, ...list.map((folder) => folder.last_reconcile_ms ?? 0))
  return { warn: false, ok: true, text: last ? `In sync, ${relativeTime(new Date(last).toISOString())}` : 'In sync' }
})
const moving = computed(() => transfers.value.filter(isMoving).length)
const recentTransfers = computed(() => transfers.value.slice(0, 2))
const backend = computed(() => {
  const kind = compute.value?.backend ?? ''
  return kind.charAt(0).toUpperCase() + kind.slice(1)
})
const fileName = (transfer: DeviceTransfer) => transfer.key ?? transfer.path

onMounted(async () => {
  const reading = refresh()
  // Only a first visit waits for the node's address; later visits read at once.
  if (!deviceClient.value) await reading
  // Counts change all the time, also by folders linked outside this window, so each visit reads them.
  await Promise.all([loadFolders(), loadTransfers(), loadCompute()])
})
</script>

<template>
  <section aria-labelledby="computer-heading">
    <SectionHeading id="computer-heading" title="This computer" :icon="Laptop" />
    <div class="grid gap-3 sm:grid-cols-2 sm:gap-4" :class="runsShown ? 'xl:grid-cols-4' : 'xl:grid-cols-3'">
      <OverviewCell :label="name" :icon="Power" stacked>
        <template #label>
          <NodeNameEdit v-if="props.nodeId" :name="name" :value="value" :save="(next) => renameDevice(props.nodeId!, next)">{{ name }}</NodeNameEdit>
          <template v-else>{{ name }}</template>
        </template>
        <template #value>
          <span class="inline-flex items-center gap-2"><CircleCheck v-if="running" class="size-5 text-status-ok" />{{ pill.label }}</span>
        </template>
        <template v-if="running">
          <span v-if="connected"><Network />Connected to <b>{{ connected.count }}/{{ connected.total }}</b> {{ plural(connected.total, 'node', 'nodes') }}</span>
          <span v-if="status?.uptimeSeconds"><Clock />Up {{ plainDuration(status.uptimeSeconds) }}</span>
        </template>
        <span v-else-if="stopped"><WifiOff />Not connected to the realm</span>
        <template #action>
          <Button variant="outline" size="sm" as-child>
            <RouterLink :to="{ name: 'device' }"><Laptop class="h-3.5 w-3.5" /> Open this computer</RouterLink>
          </Button>
        </template>
      </OverviewCell>

      <OverviewCell label="Linked folders" :icon="FolderSync" stacked>
        <template #value>{{ foldersState === 'ready' ? formatCount(folders.length) : waiting(foldersState) }}</template>
        <template v-if="foldersState === 'ready'" #unit>{{ plural(folders.length, 'folder', 'folders') }}</template>
        <template v-if="foldersState === 'ready' && folders.length">
          <span v-if="stopped"><Pause />Waits until Aruna runs</span>
          <span v-else :class="folderState.warn ? 'text-status-warn' : ''">
            <TriangleAlert v-if="folderState.warn" /><CircleCheck v-else-if="folderState.ok" class="text-status-ok" />{{ folderState.text }}
          </span>
          <span class="min-w-0"><Folder /><span class="truncate">{{ folders[0].root }} to <b>{{ folders[0].remote.bucket }}</b></span></span>
        </template>
        <template #action>
          <Button variant="outline" size="sm" @click="showBind = true"><FolderPlus class="h-3.5 w-3.5" /> Link a folder</Button>
        </template>
      </OverviewCell>

      <OverviewCell v-if="runsShown" label="Local runs" :icon="Workflow" stacked>
        <template #value>{{ computeState === 'ready' && compute ? formatCount(compute.running) : waiting(computeState) }}</template>
        <template v-if="computeState === 'ready' && compute" #unit>running</template>
        <template v-if="computeState === 'ready' && compute">
          <span v-if="!compute.enabled"><Workflow />Local runs off</span>
          <template v-else>
            <span v-if="backend"><Container />{{ backend }}</span>
            <span v-if="stopped"><Gauge />Off while stopped</span>
            <span v-else-if="compute.limits.max_concurrent"><Gauge /><b>{{ formatCount(compute.limits.max_concurrent) }}</b> {{ plural(compute.limits.max_concurrent, 'job', 'jobs') }} at a time</span>
          </template>
        </template>
        <template #action>
          <Button variant="outline" size="sm" as-child>
            <RouterLink :to="{ name: 'device', query: { section: 'local-runs' } }"><SlidersHorizontal class="h-3.5 w-3.5" /> Change limits</RouterLink>
          </Button>
        </template>
      </OverviewCell>

      <!-- What is moving, with the latest transfers listed at the bottom of the card. -->
      <div class="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border-subtle bg-card text-card-foreground shadow-sm dark:shadow-none">
        <div class="flex items-start justify-between gap-3 p-4 pb-3 sm:p-5 sm:pb-3">
          <div class="min-w-0">
            <p class="type-label">Sync activity</p>
            <p class="mt-2 flex flex-wrap items-baseline gap-x-2">
              <span class="type-number max-sm:text-xl">{{ transfersState === 'ready' ? formatCount(moving) : waiting(transfersState) }}</span>
              <span v-if="transfersState === 'ready'" class="text-sm text-muted-foreground">{{ stopped ? 'moving, paused' : 'moving now' }}</span>
            </p>
          </div>
          <IconTile :icon="ArrowLeftRight" tone="sky" />
        </div>
        <ul v-if="recentTransfers.length" class="mt-auto divide-y divide-border-subtle border-t border-border-subtle">
          <li v-for="transfer in recentTransfers" :key="transfer.id" class="flex items-center gap-3 px-4 py-2.5 sm:px-5">
            <component :is="transfer.direction === 'upload' ? ArrowUpFromLine : ArrowDownToLine" class="size-3.5 shrink-0 text-muted-foreground" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[13px] font-medium text-foreground" :title="fileName(transfer)">{{ fileName(transfer) }}</span>
              <span v-if="transfer.bucket" class="block truncate text-xs text-muted-foreground">{{ transfer.direction === 'upload' ? 'To' : 'From' }} {{ transfer.bucket }}</span>
            </span>
            <StatusMark v-if="transfer.state === 'done'" :label="transfer.direction === 'upload' ? 'Uploaded' : 'Downloaded'" />
            <StatusPill v-else :state="transferLabel(transfer)" :tone="transfer.state === 'failed' ? 'failed' : 'progress'" />
          </li>
        </ul>
        <p v-else-if="transfersState === 'ready'" class="mt-auto border-t border-border-subtle px-4 py-2.5 text-xs text-muted-foreground sm:px-5">Nothing moved yet.</p>
      </div>
    </div>
    <BindFolderDialog v-model:open="showBind" @bound="loadFolders" />
  </section>
</template>
