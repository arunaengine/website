<script setup lang="ts">
// The desktop's own part of Home: first steps, each with its button, and one
// card for this computer. Every number is what the node reported; a read that
// is not ready shows nothing rather than a zero.
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useLocalStorage } from '@vueuse/core'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import Progress from '@/components/ui/Progress.vue'
import BindFolderDialog from '@/components/desktop/BindFolderDialog.vue'
import { usePortalFeatures } from '@/composables/usePortalFeatures'
import { useDeviceCompute } from '@/composables/useDeviceCompute'
import { useDeviceKeys } from '@/composables/useDeviceKeys'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { useDeviceTransfers } from '@/composables/useDeviceTransfers'
import { useNodeControl } from '@/composables/useNodeControl'
import { useSyncedFolders } from '@/composables/useSyncedFolders'
import { totalProgress } from '@/lib/activityGroups'
import { folderName, isMoving } from '@/lib/deviceApi'
import { keyNames } from '@/lib/keyNames'
import { nodePill } from '@/lib/nodePill'
import { needsYouCount } from '@/lib/syncStates'
import { formatBytes } from '@/lib/utils'
import { ArrowRight, Check, FolderPlus, Laptop, ListChecks, Play } from '@lucide/vue'

const deviceKeys = useDeviceKeys()
const { shown } = usePortalFeatures()
const { status, state: nodeState, refresh } = useDeviceStatus()
const { folders, listState: foldersState, ensureLoaded: ensureFolders, load: loadFolders } = useSyncedFolders()
const { all: transfers, load: loadTransfers, state: transfersState } = useDeviceTransfers()
const { compute, state: computeState, ensureLoaded: ensureCompute } = useDeviceCompute()
const control = useNodeControl()

const showBind = ref(false)
const startHidden = useLocalStorage('aruna:desktop:get-started-hidden', false)

const pill = computed(() => nodePill(status.value))
const notRunning = computed(() => nodeState.value === 'stopped' || nodeState.value === 'error')
const runsShown = computed(() => shown('compute'))

const firstKeyName = computed(() => {
  const key = deviceKeys.active.value[0]
  return key ? keyNames()[key.access_key_id] : undefined
})

// Each step is done only when the node said so.
const steps = computed(() => {
  const first = folders.value[0]
  return [
    {
      key: 'folder',
      title: 'Link a local folder',
      done: folders.value.length > 0,
      text: first ? `${folderName(first.root)} is linked.` : 'Keep a folder on this computer in step with a bucket.',
    },
    {
      key: 'tools',
      title: 'Connect your tools',
      done: deviceKeys.active.value.length > 0,
      text: firstKeyName.value ? `Key "${firstKeyName.value}" is ready.` : 'Use aws, rclone, Python or Nextflow with your data.',
    },
    ...(runsShown.value
      ? [
          {
            key: 'runs',
            title: 'Run jobs on this computer',
            done: compute.value?.enabled === true,
            text: 'Analysis runs next to your data.',
          },
        ]
      : []),
  ]
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

// A read on its way is not the same as one that failed.
const waiting = (state: string) => (state === 'idle' || state === 'loading' ? 'Reading…' : 'Not available right now')

const needsYou = computed(() => folders.value.reduce((sum, folder) => sum + needsYouCount(folder.counters), 0))
const moving = computed(() => transfers.value.filter(isMoving).length)
const progress = computed(() => totalProgress(transfers.value))

const runsTitle = computed(() => {
  if (computeState.value !== 'ready' || !compute.value) return null
  return compute.value.enabled ? `${compute.value.running} running` : 'Off'
})
const runsText = computed(() => {
  const current = compute.value
  if (!current?.enabled) return 'Turn on under This computer.'
  const limit = current.limits.max_concurrent
  return [current.backend, limit ? `${limit} ${limit === 1 ? 'job' : 'jobs'} at a time` : null].filter(Boolean).join(', ')
})

onMounted(async () => {
  await refresh()
  await Promise.all([ensureFolders(), loadTransfers(), ensureCompute()])
})
</script>

<template>
  <div class="space-y-5">
    <Notice v-if="notRunning" tone="warning">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="font-medium">This computer is not running.</p>
          <p class="mt-0.5">{{ status?.message || 'Your folders, tools and local runs wait until it runs again.' }}</p>
          <p v-if="control.error.value" class="mt-1 text-destructive">{{ control.error.value }}</p>
        </div>
        <Button variant="outline" size="sm" :disabled="control.busy.value" @click="control.start">
          <Play class="h-3.5 w-3.5" /> Start
        </Button>
      </div>
    </Notice>

    <!-- First steps: leave once every one is done. -->
    <section v-if="showSteps" class="surface overflow-hidden">
      <header class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <div class="flex items-center gap-2">
          <ListChecks class="h-4 w-4 text-primary" />
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
        <li v-for="step in steps" :key="step.key" class="flex flex-wrap items-center gap-3 px-5 py-3">
          <span
            v-if="step.done"
            class="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"
          >
            <Check class="h-3 w-3" />
          </span>
          <span v-else class="inline-block size-5 shrink-0 rounded-full border-2 border-border" />
          <div class="min-w-0 flex-1">
            <span class="text-sm font-medium" :class="step.done ? 'text-muted-foreground line-through' : 'text-foreground'">
              {{ step.title }}
            </span>
            <p class="mt-0.5 text-[11px] text-muted-foreground">{{ step.text }}</p>
          </div>
          <template v-if="!step.done">
            <Button v-if="step.key === 'folder'" size="sm" @click="showBind = true">
              <FolderPlus class="h-3.5 w-3.5" /> Link a local folder
            </Button>
            <Button v-else-if="step.key === 'tools'" variant="outline" size="sm" as-child>
              <RouterLink :to="{ name: 'settings', query: { tab: 'access', create: 'key' } }">Create a key</RouterLink>
            </Button>
            <Button v-else variant="outline" size="sm" as-child>
              <RouterLink :to="{ name: 'device', query: { section: 'local-runs' } }">Turn on</RouterLink>
            </Button>
          </template>
        </li>
      </ul>
    </section>

    <!-- This computer: what it does right now, each tile opens its place. -->
    <section class="surface overflow-hidden" aria-label="This computer">
      <header class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <div class="flex items-center gap-2">
          <Laptop class="h-4 w-4 text-primary" />
          <h2 class="font-display text-sm font-semibold text-aruna-navy">This computer</h2>
          <Badge :variant="pill.variant" size="sm">{{ pill.label }}</Badge>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" @click="showBind = true">
            <FolderPlus class="h-3.5 w-3.5" /> Link a local folder
          </Button>
          <Button variant="ghost" size="sm" as-child>
            <RouterLink :to="{ name: 'device' }">Open <ArrowRight class="h-3.5 w-3.5" /></RouterLink>
          </Button>
        </div>
      </header>
      <div class="grid divide-y divide-border/70 sm:auto-cols-fr sm:grid-flow-col sm:divide-x sm:divide-y-0">
        <RouterLink :to="{ name: 'device' }" class="block px-5 py-4 hover:bg-muted/40">
          <div class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Linked folders</div>
          <template v-if="foldersState === 'ready'">
            <div class="mt-1 font-display text-2xl font-semibold text-aruna-navy">{{ folders.length }}</div>
            <div v-if="needsYou" class="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
              {{ needsYou }} {{ needsYou === 1 ? 'file needs' : 'files need' }} you
            </div>
          </template>
          <div v-else class="mt-1 text-xs text-muted-foreground">{{ waiting(foldersState) }}</div>
        </RouterLink>
        <RouterLink :to="{ name: 'device' }" class="block px-5 py-4 hover:bg-muted/40">
          <div class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Moving now</div>
          <template v-if="transfersState === 'ready'">
            <div class="mt-1 font-display text-2xl font-semibold text-aruna-navy">
              {{ moving }} {{ moving === 1 ? 'file' : 'files' }}
            </div>
            <template v-if="progress">
              <Progress
                :value="progress.total ? (progress.done / progress.total) * 100 : 0"
                label="Total progress"
                class="mt-1.5 h-1.5"
              />
              <div class="mt-1 text-xs text-muted-foreground">
                {{ formatBytes(progress.done) }} of {{ formatBytes(progress.total) }}
              </div>
            </template>
          </template>
          <div v-else class="mt-1 text-xs text-muted-foreground">{{ waiting(transfersState) }}</div>
        </RouterLink>
        <RouterLink v-if="runsShown" :to="{ name: 'compute' }" class="block px-5 py-4 hover:bg-muted/40">
          <div class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Local runs</div>
          <template v-if="runsTitle">
            <div class="mt-1 font-display text-2xl font-semibold text-aruna-navy">{{ runsTitle }}</div>
            <div class="mt-0.5 text-xs text-muted-foreground">{{ runsText }}</div>
          </template>
          <div v-else class="mt-1 text-xs text-muted-foreground">{{ waiting(computeState) }}</div>
        </RouterLink>
      </div>
    </section>

    <BindFolderDialog v-model:open="showBind" @bound="loadFolders" />
  </div>
</template>
