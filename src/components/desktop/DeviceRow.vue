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
import { isMoving } from '@/lib/deviceApi'
import { formatCount } from '@/lib/formatCount'
import { nodePill } from '@/lib/nodePill'
import { needsYouCount } from '@/lib/syncStates'
import { FolderPlus, Laptop } from '@lucide/vue'

defineProps<{ name: string }>()

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
const runsText = computed(() => {
  if (!shown('compute')) return null
  if (computeState.value !== 'ready' || !compute.value) return `Local runs ${waiting(computeState.value)}`
  if (!compute.value.enabled) return 'runs here: off'
  const limit = compute.value.limits.max_concurrent
  return `runs here: ${[compute.value.backend, limit ? `${formatCount(limit)} at a time` : null].filter(Boolean).join(', ')}`
})
const facts = computed(() => [foldersText.value, movingText.value, runsText.value].filter((fact): fact is string => Boolean(fact)))

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
    <RouterLink :to="{ name: 'device' }" class="text-sm font-semibold text-foreground hover:underline">{{ name }}</RouterLink>
    <Badge variant="secondary" size="sm">this computer</Badge>
    <Badge :variant="pill.variant" size="sm">{{ pill.label }}</Badge>
    <p class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
      <template v-for="(fact, index) in facts" :key="fact">
        <span v-if="index" aria-hidden="true" class="text-border">|</span>
        <span>{{ fact }}</span>
      </template>
    </p>
    <Button variant="outline" size="sm" @click="showBind = true"><FolderPlus class="h-3.5 w-3.5" /> Link a folder</Button>
    <BindFolderDialog v-model:open="showBind" @bound="loadFolders" />
  </div>
</template>
