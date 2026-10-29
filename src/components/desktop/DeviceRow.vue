<script setup lang="ts">
// This computer in one row of the Overview: its name, whether it is online, and what it does right
// now. Every number is what the node reported; a read that is not ready says so instead of a zero.
// It reads the node's lists on every visit; the first steps above follow the same lists.
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import BindFolderDialog from '@/components/desktop/BindFolderDialog.vue'
import { usePortalFeatures } from '@/composables/usePortalFeatures'
import { useDeviceCompute } from '@/composables/useDeviceCompute'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { useDeviceTransfers } from '@/composables/useDeviceTransfers'
import { useSyncedFolders } from '@/composables/useSyncedFolders'
import { THIS_COMPUTER } from '@/composables/useRealmNodes'
import { useNodeNames } from '@/composables/useNodeNames'
import NodeNameEdit from '@/components/nodes/NodeNameEdit.vue'
import { isMoving } from '@/lib/deviceApi'
import { formatCount } from '@/lib/formatCount'
import { nodePill } from '@/lib/nodePill'
import { needsYouCount } from '@/lib/syncStates'
import { FolderPlus, Laptop } from '@lucide/vue'

/** `nodeId` and `value` let the owner rename this computer through the device route. */
const props = defineProps<{ name: string; nodeId?: string | null; value?: string | null }>()
const { renameDevice } = useNodeNames()

const { shown } = usePortalFeatures()
const { status, refresh, deviceClient } = useDeviceStatus()
const { folders, listState: foldersState, load: loadFolders } = useSyncedFolders()
const { all: transfers, load: loadTransfers, state: transfersState } = useDeviceTransfers()
const { compute, state: computeState, load: loadCompute } = useDeviceCompute()
const showBind = ref(false)

// A running node is online; the other states keep the words the desktop uses for them.
const pill = computed(() => {
  const value = nodePill(status.value)
  return value.label === 'Running' ? { ...value, label: 'online' } : { ...value, label: value.label.toLowerCase() }
})

// A read on its way is not the same as one that failed.
const waiting = (state: string) => (state === 'idle' || state === 'loading' ? 'reading' : 'not available right now')
const plural = (count: number, one: string, many: string) => `${formatCount(count)} ${count === 1 ? one : many}`

const foldersText = computed(() => {
  if (foldersState.value !== 'ready') return `Linked folders ${waiting(foldersState.value)}`
  const list = folders.value
  if (!list.length) return 'No linked folders'
  const needsYou = list.reduce((sum, folder) => sum + needsYouCount(folder.counters), 0)
  const state = needsYou
    ? `${plural(needsYou, 'file needs', 'files need')} you`
    : list.some((folder) => folder.state === 'error' || folder.last_error || folder.counters.errors)
      ? 'with errors'
      : list.some((folder) => folder.state !== 'active' || folder.counters.uploading)
        ? 'syncing'
        : 'in sync'
  return `${plural(list.length, 'linked folder', 'linked folders')}, ${state}`
})
const movingText = computed(() =>
  transfersState.value === 'ready' ? `${plural(transfers.value.filter(isMoving).length, 'file', 'files')} moving` : `Transfers ${waiting(transfersState.value)}`,
)
// How many runs run here now, then the runtime, which opens the local run settings.
const runsFacts = computed<Fact[]>(() => {
  if (!shown('compute')) return []
  const settings = { name: 'device', query: { section: 'local-runs' } }
  if (computeState.value !== 'ready' || !compute.value) return [{ text: `Local runs ${waiting(computeState.value)}` }]
  if (!compute.value.enabled) return [{ text: 'Local runs off', to: settings }]
  const running = compute.value.running
  const kind = compute.value.backend ?? ''
  const backend = kind.charAt(0).toUpperCase() + kind.slice(1)
  const limit = compute.value.limits.max_concurrent
  return [
    { text: `${plural(running, 'run', 'runs')} running here` },
    { text: [backend, limit ? `${formatCount(limit)} at a time` : null].filter(Boolean).join(', '), to: settings },
  ]
})
// Each fact with a place of its own on the device page links there.
interface Fact {
  text: string
  to?: { name: string; query: Record<string, string> }
}
const facts = computed<Fact[]>(() => [
  { text: foldersText.value, to: { name: 'device', query: { section: 'folders' } } },
  { text: movingText.value, to: { name: 'device', query: { section: 'activity' } } },
  ...runsFacts.value,
])

onMounted(async () => {
  const reading = refresh()
  // Only a first visit waits for the node's address; later visits read at once.
  if (!deviceClient.value) await reading
  // Counts change all the time, also by folders linked outside this window, so each visit reads them.
  await Promise.all([loadFolders(), loadTransfers(), loadCompute()])
})
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-5 py-3" aria-label="This computer">
    <Laptop class="h-4 w-4 shrink-0 text-muted-foreground" />
    <NodeNameEdit v-if="props.nodeId" :name="name" :value="value" :save="(next) => renameDevice(props.nodeId!, next)">
      <RouterLink :to="{ name: 'device' }" class="text-sm font-semibold text-foreground hover:underline">{{ name }}</RouterLink>
    </NodeNameEdit>
    <RouterLink v-else :to="{ name: 'device' }" class="text-sm font-semibold text-foreground hover:underline">{{ name }}</RouterLink>
    <Badge v-if="name !== THIS_COMPUTER" variant="secondary" size="sm">this computer</Badge>
    <Badge :variant="pill.variant" size="sm">{{ pill.label }}</Badge>
    <p class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
      <template v-for="(fact, index) in facts" :key="fact.text">
        <span v-if="index" aria-hidden="true" class="text-border">|</span>
        <RouterLink v-if="fact.to" :to="fact.to" class="hover:text-foreground hover:underline">{{ fact.text }}</RouterLink>
        <span v-else>{{ fact.text }}</span>
      </template>
    </p>
    <Button variant="outline" size="sm" @click="showBind = true"><FolderPlus class="h-3.5 w-3.5" /> Link a folder</Button>
    <BindFolderDialog v-model:open="showBind" @bound="loadFolders" />
  </div>
</template>
