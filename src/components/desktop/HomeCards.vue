<script setup lang="ts">
// Home of Aruna Desktop: your folders and what is moving, then the realm behind
// them. Every card degrades on its own, so a node that is down or a route that
// is not served yet costs one card, never the page.
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useLocalStorage } from '@vueuse/core'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Notice from '@/components/ui/Notice.vue'
import Progress from '@/components/ui/Progress.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import BindFolderDialog from '@/components/desktop/BindFolderDialog.vue'
import DeviceSurfaceState from '@/components/desktop/DeviceSurfaceState.vue'
import SyncItemRow from '@/components/desktop/SyncItemRow.vue'
import JobStateBadge from '@/components/jobs/JobStateBadge.vue'
import { useAruna } from '@/composables/useAruna'
import { usePortalFeatures } from '@/composables/usePortalFeatures'
import { useDeviceCompute } from '@/composables/useDeviceCompute'
import { useDeviceKeys } from '@/composables/useDeviceKeys'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { useDeviceTransfers } from '@/composables/useDeviceTransfers'
import { useFolderDecisions } from '@/composables/useFolderDecisions'
import { useJobsList } from '@/composables/useJobs'
import { useNodeControl } from '@/composables/useNodeControl'
import { useSyncedFolders } from '@/composables/useSyncedFolders'
import { useRealm } from '@/composables/useRealm'
import { featureEnabled } from '@/lib/config'
import { classify, folderName, isMoving, listDrafts, type DeviceDraft, type DeviceState } from '@/lib/deviceApi'
import { isTerminalJobState, jobKindLabel, listJobs, type JobStatusResponse } from '@/lib/jobs'
import { nodePill, plainDuration } from '@/lib/nodePill'
import { transferPercent, type SyncItem } from '@/lib/syncStates'
import { relativeTime } from '@/lib/utils'
import { Check, Play, Plus, SquareTerminal } from '@lucide/vue'

const { realm } = useRealm()
const { currentUser } = useAruna()
const deviceKeys = useDeviceKeys()
const { shown } = usePortalFeatures()
const { status, state: nodeState, deviceClient, refresh } = useDeviceStatus()
const {
  folders,
  listState: foldersState,
  listError: foldersError,
  ensureLoaded: ensureFolders,
  sync: syncFolder,
} = useSyncedFolders()
const { all: syncTransfers, load: loadTransfers, state: transfersState } = useDeviceTransfers()
const { compute, ensureLoaded: ensureCompute } = useDeviceCompute()
const decisions = useFolderDecisions()
const control = useNodeControl()

const jobsEnabled = featureEnabled('jobs')
const realmRuns = useJobsList({ pageSize: 10 })

const localRuns = ref<JobStatusResponse[]>([])
const localRunsState = ref<DeviceState>('idle')
const drafts = ref<DeviceDraft[]>([])
const showBind = ref(false)
const retrying = ref(false)
const startHidden = useLocalStorage('aruna:desktop:get-started-hidden', false)

const pill = computed(() => nodePill(status.value))
const notRunning = computed(() => nodeState.value === 'stopped' || nodeState.value === 'error')
const runsOn = computed(() => shown('compute') && compute.value?.enabled === true)

// Each step is done only when the node or the realm said so.
const steps = computed(() => {
  const first = folders.value[0]
  const list = [
    {
      key: 'folder',
      title: 'Sync a folder',
      done: folders.value.length > 0,
      text: first ? `${folderName(first.root)} is set up with Aruna.` : 'Keep a folder on this computer in step with a bucket.',
      action: null,
    },
    {
      key: 'tools',
      title: 'Connect your tools',
      done: deviceKeys.active.value.length > 0,
      text: 'Use aws, rclone, Python or an AI assistant with your data.',
      action: { label: 'Connect', to: { name: 'tools' } },
    },
    ...(shown('compute')
      ? [
          {
            key: 'runs',
            title: 'Turn on local runs',
            done: compute.value?.enabled === true,
            text: 'Run analysis jobs on this computer, next to your data.',
            action: { label: 'Turn on', to: { name: 'device' } },
          },
        ]
      : []),
  ]
  return list
})
const stepsDone = computed(() => steps.value.filter((step) => step.done).length)
// Only loaded lists can say a step is open, so nothing shows before that.
const showSteps = computed(
  () =>
    !startHidden.value &&
    foldersState.value === 'ready' &&
    deviceKeys.state.value !== 'idle' &&
    deviceKeys.state.value !== 'loading' &&
    stepsDone.value < steps.value.length,
)

const folderItems = computed<SyncItem[]>(() =>
  folders.value.slice(0, 5).map((folder) => ({
    kind: 'folder',
    folder,
    transfers: syncTransfers.value.filter((transfer) => transfer.folder_id === folder.folder_id),
  })),
)

const movingNow = computed(() => syncTransfers.value.filter(isMoving).slice(0, 3))
const failedTransfers = computed(() => syncTransfers.value.filter((transfer) => transfer.state === 'failed'))

async function retryFailed(): Promise<void> {
  retrying.value = true
  try {
    const ids = new Set(failedTransfers.value.map((transfer) => transfer.folder_id).filter((id): id is string => !!id))
    await Promise.allSettled([...ids].map((id) => syncFolder(id)))
    await loadTransfers()
  } finally {
    retrying.value = false
  }
}

const activeLocalRuns = computed(() => localRuns.value.filter((job) => !isTerminalJobState(job.state)))
const activeRealmRuns = computed(() => realmRuns.jobs.value.filter((job) => !isTerminalJobState(job.state)))
const activeDrafts = computed(() => drafts.value.filter((draft) => draft.status === 'pending' || draft.status === 'publishing'))
const failedDrafts = computed(() => drafts.value.filter((draft) => draft.status === 'failed'))

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
    return
  }
  try {
    drafts.value = await listDrafts(client)
  } catch {
    drafts.value = []
  }
}

async function reload(): Promise<void> {
  await refresh()
  await Promise.all([ensureFolders(), loadTransfers(), ensureCompute(), loadDrafts()])
  await Promise.all([
    decisions.load(),
    compute.value?.enabled ? loadLocalRuns() : Promise.resolve(),
    jobsEnabled && currentUser.value ? realmRuns.load() : Promise.resolve(),
  ])
}

onMounted(() => void reload())
</script>

<template>
  <div>
    <PageHeader
      eyebrow="This computer"
      title="Your data on this computer"
      :description="`Signed in to ${realm.name}.`"
      :docs="{ topic: 'where-data-lives', section: 'Syncs' }"
    >
      <template #breadcrumbs>
        <span>·</span>
        <Tooltip side="bottom">
          <RouterLink :to="{ name: 'device' }" data-testid="node-pill">
            <Badge :variant="pill.variant">{{ pill.label }}</Badge>
          </RouterLink>
          <template #content>
            <span class="block font-medium text-foreground">
              {{ pill.label === 'Running' ? 'This computer is running' : `This computer: ${pill.label.toLowerCase()}` }}
            </span>
            <span v-if="status?.version" class="block text-muted-foreground">
              Version <span class="font-mono">{{ status.version }}</span>
            </span>
            <span v-if="status?.uptimeSeconds != null" class="block text-muted-foreground">
              Running for {{ plainDuration(status.uptimeSeconds) }}
            </span>
            <span class="block text-muted-foreground">Signed in to {{ realm.name }}</span>
          </template>
        </Tooltip>
      </template>
      <template #actions>
        <Button variant="outline" size="sm" as-child>
          <RouterLink :to="{ name: 'tools' }"><SquareTerminal class="h-3.5 w-3.5" /> Connect your tools</RouterLink>
        </Button>
        <Button size="sm" @click="showBind = true"><Plus class="h-4 w-4" /> Sync a folder</Button>
      </template>
    </PageHeader>

    <div class="container space-y-5 py-5">
      <Notice v-if="notRunning" tone="warning">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="font-medium">This computer is not running.</p>
            <p class="mt-0.5">
              {{ status?.message || 'Your folders, tools and local runs wait until it runs again.' }}
            </p>
            <p v-if="control.error.value" class="mt-1 text-destructive">{{ control.error.value }}</p>
          </div>
          <Button variant="outline" size="sm" :disabled="control.busy.value" @click="control.start">
            <Play class="h-3.5 w-3.5" /> Start
          </Button>
        </div>
      </Notice>
      <Notice v-else-if="status?.message && pill.label !== 'Running'" tone="warning">{{ status.message }}</Notice>

      <!-- First steps: leave once every one is done. -->
      <section v-if="showSteps" class="surface overflow-hidden">
        <header class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
          <div class="flex items-center gap-2">
            <h2 class="font-display text-sm font-semibold text-aruna-navy">Get started</h2>
            <Badge variant="secondary" size="sm">{{ stepsDone }} of {{ steps.length }} done</Badge>
          </div>
          <button
            type="button"
            class="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
            @click="startHidden = true"
          >
            Hide
          </button>
        </header>
        <ul class="divide-y divide-border/70">
          <li v-for="step in steps" :key="step.key" class="flex items-start gap-3 px-5 py-3">
            <span
              v-if="step.done"
              class="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"
            >
              <Check class="h-3 w-3" />
            </span>
            <span v-else class="mt-0.5 inline-block size-5 shrink-0 rounded-full border-2 border-border" />
            <div class="min-w-0 flex-1">
              <span
                class="text-sm font-medium"
                :class="step.done ? 'text-muted-foreground line-through' : 'text-foreground'"
                >{{ step.title }}</span
              >
              <p class="mt-0.5 text-[11px] text-muted-foreground">{{ step.text }}</p>
            </div>
            <Button v-if="step.action && !step.done" variant="outline" size="sm" as-child>
              <RouterLink :to="step.action.to">{{ step.action.label }}</RouterLink>
            </Button>
          </li>
        </ul>
        <p class="border-t border-border/70 px-5 py-2 text-[11px] text-muted-foreground">
          This list goes away when all {{ steps.length === 3 ? 'three' : steps.length }} are done.
        </p>
      </section>

      <div class="grid gap-4 lg:grid-cols-2">
        <!-- Folders -->
        <section class="surface flex flex-col overflow-hidden lg:col-span-2">
          <header class="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 class="font-display text-sm font-semibold text-aruna-navy">Folders</h2>
            <RouterLink :to="{ name: 'sync' }" class="text-xs font-medium text-primary hover:underline">Open</RouterLink>
          </header>
          <div class="flex-1 px-5 py-2">
            <Skeleton v-if="foldersState === 'idle' || foldersState === 'loading'" class="my-3 h-12" />
            <DeviceSurfaceState
              v-else-if="foldersState !== 'ready'"
              class="my-3"
              :state="foldersState"
              subject="its folders"
              :error="foldersError"
              compact
            />
            <ul v-else-if="folderItems.length" class="divide-y divide-border/70">
              <SyncItemRow v-for="item in folderItems" :key="item.kind === 'folder' ? item.folder.folder_id : ''" :item="item" compact />
            </ul>
            <EmptyState v-else compact class="my-3" title="Nothing syncs with this computer yet.">
              <Button variant="outline" size="sm" @click="showBind = true">Sync a folder</Button>
            </EmptyState>
          </div>
        </section>

        <!-- Activity -->
        <section class="surface flex flex-col overflow-hidden">
          <header class="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 class="font-display text-sm font-semibold text-aruna-navy">Activity</h2>
            <RouterLink :to="{ name: 'activity' }" class="text-xs font-medium text-primary hover:underline">Open</RouterLink>
          </header>
          <div class="flex-1 space-y-3 px-5 py-4">
            <Skeleton v-if="transfersState === 'idle' || transfersState === 'loading'" class="h-12" />
            <DeviceSurfaceState
              v-else-if="transfersState !== 'ready'"
              :state="transfersState"
              subject="its transfers"
              compact
            />
            <template v-else>
              <div v-if="movingNow.length" class="space-y-2 text-[11px]">
                <div v-for="transfer in movingNow" :key="transfer.id" class="flex items-center gap-2">
                  <span class="hash min-w-0 flex-1 truncate text-foreground" :title="transfer.path">{{ transfer.path }}</span>
                  <span v-if="transferPercent(transfer) !== null" class="text-muted-foreground">
                    {{ transferPercent(transfer) }}%
                  </span>
                  <Progress
                    :value="transferPercent(transfer) ?? 0"
                    :indeterminate="transferPercent(transfer) === null"
                    :label="transfer.path"
                    class="h-1.5 w-20 shrink-0"
                  />
                </div>
              </div>
              <p v-else class="text-sm text-muted-foreground">Nothing is moving right now.</p>
              <ul
                v-if="failedTransfers.length || decisions.latest.value"
                class="space-y-1 border-t border-border/70 pt-3 text-[11px] text-muted-foreground"
              >
                <li v-if="failedTransfers.length" class="flex items-center gap-1.5">
                  {{ failedTransfers.length }} {{ failedTransfers.length === 1 ? 'file' : 'files' }} failed ·
                  <button
                    type="button"
                    class="text-primary hover:underline disabled:opacity-60"
                    :disabled="retrying"
                    @click="retryFailed"
                  >
                    Retry
                  </button>
                </li>
                <li v-if="decisions.latest.value">
                  {{ decisions.latest.value.text }}
                  <template v-if="decisions.latest.value.atMs">
                    · {{ relativeTime(new Date(decisions.latest.value.atMs).toISOString()) }}
                  </template>
                </li>
              </ul>
            </template>
          </div>
        </section>

        <!-- Runs: only while this computer runs jobs itself. -->
        <section v-if="runsOn" class="surface flex flex-col overflow-hidden">
          <header class="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 class="font-display text-sm font-semibold text-aruna-navy">Runs</h2>
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
            <DeviceSurfaceState v-if="localRunsState !== 'ready'" :state="localRunsState" subject="its runs" compact />
            <ul v-else class="space-y-1">
              <li
                v-for="job in localRuns.slice(0, 3)"
                :key="job.job_id"
                class="flex items-center gap-2 truncate text-[11px] text-muted-foreground"
              >
                <span class="text-foreground">{{ jobKindLabel(job.kind) }}</span>
                <JobStateBadge :state="job.state" />
                <span>{{ relativeTime(job.created_at) }}</span>
              </li>
            </ul>
          </div>
        </section>

        <!-- Drafts: only while one waits or failed. -->
        <section v-if="activeDrafts.length || failedDrafts.length" class="surface flex flex-col overflow-hidden">
          <header class="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 class="font-display text-sm font-semibold text-aruna-navy">Drafts on this computer</h2>
          </header>
          <div class="flex-1 px-5 py-4">
            <template v-if="activeDrafts.length">
              <p class="text-sm text-foreground">
                <span class="font-display text-xl font-bold">{{ activeDrafts.length }}</span>
                waiting to be published
              </p>
              <ul class="mt-2 space-y-1">
                <li v-for="draft in activeDrafts.slice(0, 3)" :key="draft.draft_id" class="truncate text-[11px] text-muted-foreground">
                  {{ draft.path || draft.draft_id }}
                </li>
              </ul>
            </template>
            <Notice
              v-if="failedDrafts.length"
              tone="error"
              class="mt-3"
              :title="`${failedDrafts.length} ${failedDrafts.length === 1 ? 'draft' : 'drafts'} failed to publish`"
              :lines="failedDrafts.slice(0, 3).map((draft) => draft.path || draft.draft_id)"
            />
          </div>
        </section>
      </div>
    </div>

    <BindFolderDialog v-model:open="showBind" @bound="ensureFolders" />
  </div>
</template>
