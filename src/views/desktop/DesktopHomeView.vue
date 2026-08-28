<script setup lang="ts">
// Home of Aruna Desktop: the state of this machine first, the realm behind it.
// Every card degrades on its own, so a node that is down or a route that is not
// served yet costs one card, never the page.
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import NewRunMenu from '@/components/compute/NewRunMenu.vue'
import BindFolderDialog from '@/components/desktop/BindFolderDialog.vue'
import DeviceSurfaceState from '@/components/desktop/DeviceSurfaceState.vue'
import { useAruna } from '@/composables/useAruna'
import { useDeviceCompute } from '@/composables/useDeviceCompute'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { useDeviceSync } from '@/composables/useDeviceSync'
import { useDeviceTransfers } from '@/composables/useDeviceTransfers'
import { useJobsList } from '@/composables/useJobs'
import { useRefresh } from '@/composables/useRefresh'
import { useSyncedFolders } from '@/composables/useSyncedFolders'
import { useRealm } from '@/composables/useRealm'
import { featureEnabled } from '@/lib/config'
import { classify, folderName, listDrafts, type DeviceDraft, type DeviceState } from '@/lib/deviceApi'
import { isTerminalJobState, listJobs, type JobStatusResponse } from '@/lib/jobs'
import { itemChip } from '@/lib/syncStates'
import { formatDuration, relativeTime, truncateMiddle } from '@/lib/utils'
import { Boxes, FileText, Play, Plus, RefreshCw } from '@lucide/vue'

const { realm } = useRealm()
const { currentUser } = useAruna()
const { status, label: nodeLabel, state: nodeState, identity, deviceClient, refresh } = useDeviceStatus()
const {
  folders,
  listState: foldersState,
  listError: foldersError,
  needsYouTotal,
  ensureLoaded: ensureFolders,
} = useSyncedFolders()
const { all: syncTransfers, load: loadTransfers } = useDeviceTransfers()
const { compute, ensureLoaded: ensureCompute } = useDeviceCompute()
const { status: syncStatus, state: syncState, load: loadSync } = useDeviceSync()

const jobsEnabled = featureEnabled('jobs')
const realmRuns = useJobsList({ pageSize: 10 })

const localRuns = ref<JobStatusResponse[]>([])
const localRunsState = ref<DeviceState>('idle')
const drafts = ref<DeviceDraft[]>([])
const draftsState = ref<DeviceState>('idle')
const showBind = ref(false)

const online = computed(() => nodeState.value === 'running' && status.value?.ready === true)
const nodeTone = computed(() =>
  online.value ? (status.value?.enrolled ? 'success' : 'warn') : nodeState.value === 'error' ? 'destructive' : 'secondary',
)

// The node names itself only through its own API, so the shell's empty node id
// is no reason to call an enrolled device unconfigured.
const nodeId = computed(() => identity.value?.nodeId ?? status.value?.nodeId ?? null)
const nodeFallback = computed(() => {
  if (status.value?.enrolled) return 'joined'
  return status.value?.enrolling ? 'joining the realm' : 'not set up'
})

const facts = computed(() => [
  { label: 'Realm', value: realm.value.shortName },
  { label: 'Node', value: nodeId.value ? truncateMiddle(nodeId.value, 8, 6) : nodeFallback.value },
  { label: 'Version', value: status.value?.version ?? 'n/a' },
  {
    label: 'Uptime',
    value: status.value?.uptimeSeconds == null ? 'n/a' : formatDuration(status.value.uptimeSeconds * 1000),
  },
])

const activeLocalRuns = computed(() => localRuns.value.filter((job) => !isTerminalJobState(job.state)))
const activeRealmRuns = computed(() => realmRuns.jobs.value.filter((job) => !isTerminalJobState(job.state)))
async function loadLocalRuns(): Promise<void> {
  const client = deviceClient.value
  if (!client) {
    localRuns.value = []
    localRunsState.value = 'offline'
    return
  }
  try {
    localRuns.value = (await listJobs({ limit: 5 }, client)).jobs
    localRunsState.value = 'ready'
  } catch (err) {
    localRuns.value = []
    localRunsState.value = classify(err)
  }
}

async function loadDrafts(): Promise<void> {
  const client = deviceClient.value
  if (!client) {
    drafts.value = []
    draftsState.value = 'offline'
    return
  }
  try {
    drafts.value = await listDrafts(client)
    draftsState.value = 'ready'
  } catch (err) {
    drafts.value = []
    draftsState.value = classify(err)
  }
}

async function reload(): Promise<void> {
  await refresh()
  await Promise.all([
    ensureFolders(),
    loadTransfers(),
    ensureCompute(),
    loadSync(),
    loadLocalRuns(),
    loadDrafts(),
    jobsEnabled && currentUser.value ? realmRuns.load() : Promise.resolve(),
  ])
}

const { busy: refreshBusy, refresh: onRefresh } = useRefresh(reload)

onMounted(() => void reload())
</script>

<template>
  <div>
    <PageHeader
      eyebrow="This computer"
      title="Your data on this machine"
      :description="`Signed in to ${realm.name}.`"
    >
      <template #breadcrumbs>
        <Badge :variant="nodeTone">{{ nodeLabel }}</Badge>
      </template>
      <template #actions>
        <RefreshButton :busy="refreshBusy" @click="onRefresh" />
        <Button size="sm" @click="showBind = true"><Plus class="h-4 w-4" /> Sync a folder</Button>
      </template>
    </PageHeader>

    <div class="container space-y-5 py-5">
      <!-- The machine plate: what the node on this disk is, in one line. -->
      <section class="surface flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
        <div v-for="fact in facts" :key="fact.label" class="min-w-0">
          <dt class="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{{ fact.label }}</dt>
          <dd class="mt-0.5 truncate font-mono text-[13px] text-foreground">{{ fact.value }}</dd>
        </div>
        <div class="ml-auto flex items-center gap-2">
          <RouterLink :to="{ name: 'device' }"><Button variant="outline" size="sm">This device</Button></RouterLink>
        </div>
      </section>

      <p v-if="status?.message && !online" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
        {{ status.message }}
      </p>

      <div class="grid gap-4 lg:grid-cols-2">
        <!-- Sync -->
        <section class="surface flex flex-col overflow-hidden lg:col-span-2">
          <header class="flex items-center justify-between border-b border-border px-5 py-3">
            <div class="flex items-center gap-2">
              <RefreshCw class="h-4 w-4 text-primary" />
              <h2 class="font-display text-sm font-semibold text-aruna-navy">Sync</h2>
            </div>
            <RouterLink :to="{ name: 'sync' }" class="text-xs font-medium text-primary hover:underline">Open</RouterLink>
          </header>
          <div class="flex-1 px-5 py-4">
            <div class="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <Badge :variant="syncStatus.realmReachable ? 'success' : 'secondary'">
                {{ syncStatus.realmReachable ? 'Realm reachable' : 'Realm not answering' }}
              </Badge>
              <span>·</span>
              <span>
                last sync
                {{ syncStatus.lastSyncMs ? relativeTime(new Date(syncStatus.lastSyncMs).toISOString()) : 'never' }}
              </span>
              <span>·</span>
              <span>{{ syncStatus.pendingTotal }} {{ syncStatus.pendingTotal === 1 ? 'change' : 'changes' }} pending</span>
            </div>

            <Skeleton v-if="foldersState === 'loading' || syncState === 'loading'" class="mt-3 h-12" />
            <DeviceSurfaceState
              v-else-if="foldersState !== 'ready'"
              class="mt-3"
              :state="foldersState"
              subject="its folders"
              :error="foldersError"
              compact
            />
            <DeviceSurfaceState
              v-else-if="syncState !== 'ready'"
              class="mt-3"
              :state="syncState"
              subject="its sync status"
              compact
            />

            <ul v-else-if="folders.length || syncStatus.documents.length" class="mt-3 divide-y divide-border/70">
              <li
                v-for="item in [...folders, ...syncStatus.documents].slice(0, 3)"
                :key="'folder_id' in item ? `folder:${item.folder_id}` : `document:${item.documentId}`"
                class="flex items-start gap-3 py-2.5"
              >
                <div class="min-w-0 flex-1">
                  <RouterLink
                    :to="
                      'folder_id' in item
                        ? { name: 'folder', params: { folderId: item.folder_id } }
                        : { name: 'metadata-detail', params: { id: item.documentId } }
                    "
                    class="truncate text-sm font-medium text-foreground hover:text-primary hover:underline"
                  >{{ 'folder_id' in item ? folderName(item.root) : item.path || item.documentId }}</RouterLink>
                  <p class="truncate font-mono text-[10px] text-muted-foreground">
                    {{ 'folder_id' in item ? item.root : item.path || item.documentId }}
                  </p>
                  <p
                    v-if="
                      itemChip(
                        'folder_id' in item
                          ? {
                              kind: 'folder',
                              folder: item,
                              transfers: syncTransfers.filter((transfer) => transfer.folder_id === item.folder_id),
                            }
                          : { kind: 'document', document: item },
                      ).detail
                    "
                    class="mt-0.5 text-[10px] text-muted-foreground"
                  >
                    {{
                      itemChip(
                        'folder_id' in item
                          ? {
                              kind: 'folder',
                              folder: item,
                              transfers: syncTransfers.filter((transfer) => transfer.folder_id === item.folder_id),
                            }
                          : { kind: 'document', document: item },
                      ).detail
                    }}
                  </p>
                </div>
                <Badge
                  :variant="
                    itemChip(
                      'folder_id' in item
                        ? {
                            kind: 'folder',
                            folder: item,
                            transfers: syncTransfers.filter((transfer) => transfer.folder_id === item.folder_id),
                          }
                        : { kind: 'document', document: item },
                    ).variant
                  "
                  class="text-[10px]"
                >{{
                  itemChip(
                    'folder_id' in item
                      ? {
                          kind: 'folder',
                          folder: item,
                          transfers: syncTransfers.filter((transfer) => transfer.folder_id === item.folder_id),
                        }
                      : { kind: 'document', document: item },
                  ).label
                }}</Badge>
              </li>
            </ul>

            <div v-else class="mt-3 flex flex-wrap items-center gap-3">
              <p class="text-sm text-muted-foreground">Nothing syncs with this computer yet.</p>
              <Button variant="outline" size="sm" @click="showBind = true">Sync a folder</Button>
            </div>

            <RouterLink
              v-if="needsYouTotal"
              :to="{ name: 'sync' }"
              class="mt-3 inline-flex rounded-md bg-amber-500/10 px-2.5 py-1 text-[12px] font-medium text-amber-800 hover:bg-amber-500/15 dark:text-amber-200"
            >{{ needsYouTotal }} waiting for your decision</RouterLink>
          </div>
        </section>

        <!-- Runs -->
        <section class="surface flex flex-col overflow-hidden">
          <header class="flex items-center justify-between border-b border-border px-5 py-3">
            <div class="flex items-center gap-2">
              <Play class="h-4 w-4 text-primary" />
              <h2 class="font-display text-sm font-semibold text-aruna-navy">Runs</h2>
            </div>
            <RouterLink :to="{ name: 'runs' }" class="text-xs font-medium text-primary hover:underline">Open</RouterLink>
          </header>
          <div class="flex-1 space-y-3 px-5 py-4">
            <div class="flex flex-wrap gap-x-8 gap-y-2">
              <div>
                <p class="font-display text-xl font-bold text-foreground">{{ activeLocalRuns.length }}</p>
                <p class="text-[11px] text-muted-foreground">on this computer</p>
              </div>
              <div>
                <p class="font-display text-xl font-bold text-foreground">{{ activeRealmRuns.length }}</p>
                <p class="text-[11px] text-muted-foreground">in {{ realm.shortName }}</p>
              </div>
            </div>
            <p v-if="compute && !compute.enabled" class="text-[11px] text-muted-foreground">
              This computer runs no jobs itself yet. Turn it on under This device.
            </p>
            <DeviceSurfaceState
              v-else-if="localRunsState !== 'ready'"
              :state="localRunsState"
              subject="its runs"
              compact
            />
            <ul v-else class="space-y-1">
              <li v-for="job in localRuns.slice(0, 3)" :key="job.job_id" class="truncate text-[11px] text-muted-foreground">
                <span class="capitalize text-foreground">{{ job.kind }}</span> · {{ job.state }} ·
                {{ relativeTime(job.created_at) }}
              </li>
            </ul>
          </div>
        </section>

        <!-- Drafts -->
        <section class="surface flex flex-col overflow-hidden">
          <header class="flex items-center justify-between border-b border-border px-5 py-3">
            <div class="flex items-center gap-2">
              <FileText class="h-4 w-4 text-primary" />
              <h2 class="font-display text-sm font-semibold text-aruna-navy">Drafts on this device</h2>
            </div>
            <RouterLink :to="{ name: 'device' }" class="text-xs font-medium text-primary hover:underline">This device</RouterLink>
          </header>
          <div class="flex-1 px-5 py-4">
            <Skeleton v-if="draftsState === 'idle' || draftsState === 'loading'" class="h-12" />
            <DeviceSurfaceState
              v-else-if="draftsState !== 'ready'"
              :state="draftsState"
              subject="its drafts"
              compact
            />
            <template v-else-if="drafts.length">
              <p class="text-sm text-foreground">
                <span class="font-display text-xl font-bold">{{ drafts.length }}</span>
                waiting to be published
              </p>
              <ul class="mt-2 space-y-1">
                <li v-for="draft in drafts.slice(0, 3)" :key="draft.draft_id" class="truncate text-[11px] text-muted-foreground">
                  {{ draft.path || draft.draft_id }}
                </li>
              </ul>
            </template>
            <p v-else class="text-sm text-muted-foreground">
              Nothing authored offline is waiting. Metadata you write without a realm lands here.
            </p>
          </div>
        </section>
      </div>

      <section class="flex flex-wrap items-center gap-2">
        <NewRunMenu variant="outline" size="sm" />
        <RouterLink :to="{ name: 'buckets' }">
          <Button variant="outline" size="sm"><Boxes class="h-3.5 w-3.5" /> Open buckets</Button>
        </RouterLink>
      </section>
    </div>

    <BindFolderDialog v-model:open="showBind" @bound="ensureFolders" />
  </div>
</template>
