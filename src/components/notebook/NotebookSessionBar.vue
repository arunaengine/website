<script setup lang="ts">
// What the session runs on, and its state: runtime, dependencies, the bucket
// the notebook works in, where it may run, what it needs, and Start or End.
import { computed, onMounted, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import NotebookDependencies from '@/components/notebook/NotebookDependencies.vue'
import { injectNotebook } from '@/composables/notebookContext'
import { useNow } from '@/composables/useNow'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { SESSION_RUNTIMES, dependencyFileName, dependencyKind } from '@/lib/notebook/runtimes'
import type { NotebookDependencies as DependencySpec } from '@/lib/notebook/nbformat'
import { sessionProblems, sessionStartDraft } from '@/lib/notebook/submit'
import { toneVariant, type StateTone } from '@/lib/stateBadge'
import { DEFAULT_SESSION_IDLE_AFTER_MS } from '@/lib/computeAdmin'
import { useComputeAdmin } from '@/composables/useComputeAdmin'
import { ChevronDown, CircleStop, Play, RotateCcw } from '@lucide/vue'

const { notebook, session } = injectNotebook()
const { getComputeConfig } = useComputeAdmin()
const { nodes, displayName } = useRealmNodes()
const now = useNow(1_000)

const kernelOpen = ref(false)
const dependenciesOpen = ref(false)

const meta = computed(() => notebook.meta.value)
const runtimeOptions = SESSION_RUNTIMES.map((runtime) => ({ value: runtime.id, label: runtime.label }))
const nodeOptions = computed(() => [
  { value: '', label: 'Any node' },
  ...nodes.value
    .filter((node) => node.executorKinds.length)
    .map((node) => ({ value: node.nodeId, label: node.label })),
])
const kindOptions = computed(() => [
  { value: '', label: 'Any executor' },
  ...[...new Set(nodes.value.flatMap((node) => node.executorKinds))]
    .sort((a, b) => a.localeCompare(b))
    .map((kind) => ({ value: kind, label: kind })),
])
// The realm sets the idle timeout; a session may pick a shorter one, so the
// realm's own value is not offered twice.
const IDLE_PICKS = [
  { value: '300000', label: '5 minutes' },
  { value: '900000', label: '15 minutes' },
  { value: '1800000', label: '30 minutes' },
]
// The realm's own value, not this session's: a session that picked five
// minutes must not hide the five minute option afterwards.
const realmIdleMs = ref(DEFAULT_SESSION_IDLE_AFTER_MS)
onMounted(async () => {
  try {
    const config = await getComputeConfig()
    realmIdleMs.value = config.session_idle_after_ms ?? DEFAULT_SESSION_IDLE_AFTER_MS
  } catch {
    // Reading the realm config is an admin call; the constant stands otherwise.
  }
})
const idleOptions = computed(() => [
  { value: '', label: 'Realm default' },
  ...IDLE_PICKS.filter((option) => Number(option.value) !== realmIdleMs.value),
])

const stateLabel = computed(() => {
  if (session.restarting.value) return 'Restarting'
  if (session.starting.value) return 'Starting'
  const state = session.state.value?.state
  if (!state) return session.jobId.value ? 'Not attached' : 'No session'
  return state.charAt(0).toUpperCase() + state.slice(1)
})
const stateVariant = computed(() =>
  toneVariant(session.ended.value ? 'count' : session.live.value ? 'done' : 'attention'),
)

// The kernel light and its word, in the portal's shared state tones.
const kernelLabel = computed(() => {
  if (notebook.loading.value) return 'Loading'
  if (session.live.value) return session.kernel.value === 'busy' ? 'Busy' : 'Idle'
  return session.running.value || session.starting.value ? stateLabel.value : 'Stopped'
})
const kernelTone = computed<StateTone>(() => {
  if (session.live.value) return session.kernel.value === 'busy' ? 'progress' : 'done'
  return session.running.value || session.starting.value ? 'progress' : 'idle'
})

const idleLeft = computed(() => {
  const deadline = session.state.value?.idle_deadline_ms ?? 0
  if (!deadline || !session.live.value) return ''
  const left = deadline - now.value
  if (left <= 0) return 'ending now'
  const minutes = Math.floor(left / 60_000)
  const seconds = Math.floor((left % 60_000) / 1_000)
  return minutes ? `${minutes} min left` : `${seconds} s left`
})

const problems = computed(() =>
  notebook.loading.value || !meta.value ? [] : sessionProblems({
    groupId: meta.value?.group_id ?? '',
    runtime: meta.value?.runtime ?? '',
    workspaceBucket: meta.value?.workspace_bucket ?? '',
  }),
)

// Null while the runtime is one this portal does not know.
const dependencies = computed(() => {
  const kind = dependencyKind(meta.value?.runtime ?? '')
  return kind === 'requirements' && meta.value?.dependencies?.kind === 'conda' ? 'conda' : kind
})

const resources = computed(() => meta.value?.resources ?? {})
const ramGb = computed({
  get: () => (resources.value.ram_bytes ? String(resources.value.ram_bytes / 1_000_000_000) : ''),
  set: (value: string) => {
    const gb = Number(value)
    setResources({ ram_bytes: value && Number.isFinite(gb) ? Math.floor(gb * 1_000_000_000) : undefined })
  },
})
const cpuCores = computed({
  get: () => (resources.value.cpu_cores ? String(resources.value.cpu_cores) : ''),
  set: (value: string) => {
    const cores = Number(value)
    setResources({ cpu_cores: value && Number.isInteger(cores) && cores > 0 ? cores : undefined })
  },
})

function setResources(patch: Record<string, number | undefined>) {
  notebook.patchMeta({ resources: { ...resources.value, ...patch } })
}

function setPlacement(patch: { node?: string; executor_kind?: string }) {
  notebook.patchMeta({ placement: { ...(meta.value?.placement ?? {}), ...patch } })
}

async function start(restart = false) {
  const current = meta.value
  if (!current) return
  await (restart ? session.restart : session.start)(
    sessionStartDraft(current, notebook.key.value, notebook.name.value),
  )
}
const pendingRun = ref(false)
const runBusy = computed(() => pendingRun.value || session.starting.value || session.restarting.value || session.ending.value || session.kernel.value === 'busy' || Object.values(session.cellStates.value).some((cell) => cell.state === 'queued' || cell.state === 'running'))

async function runNotebook() {
  if (runBusy.value || problems.value.length || notebook.loading.value || !meta.value) return
  if (!session.live.value) {
    pendingRun.value = true
    await start()
    if (!session.running.value) pendingRun.value = false
    return
  }
  notebook.selectCell('')
  await session.runCells(notebook.cells.value.filter((cell) => cell.cell_type === 'code').map((cell) => ({ id: cell.id, source: cell.source })))
}

watch([session.live, session.starting], ([live, starting]) => {
  if (live && !starting && pendingRun.value) {
    pendingRun.value = false
    void runNotebook()
  }
})
watch(notebook.generation, () => { pendingRun.value = false })
watch([session.ended, session.error], ([ended, error]) => {
  if (ended || error) pendingRun.value = false
})

async function saveDependencies(value: DependencySpec, restart: boolean) {
  notebook.patchMeta({ dependencies: value })
  if (!await notebook.save()) return
  if (restart) start(true)
}
</script>

<template>
  <div class="min-w-0 space-y-2">
    <div class="flex flex-wrap items-center gap-2">
      <Button size="sm" :disabled="runBusy || Boolean(problems.length) || notebook.loading.value || !meta" @click="runNotebook">
        <Play class="size-3.5" /> {{ pendingRun || session.starting.value ? 'Starting…' : session.kernel.value === 'busy' ? 'Running…' : 'Run notebook' }}
      </Button>
      <Button size="sm" variant="outline" aria-label="Kernel" @click="kernelOpen = true">
        Kernel
        <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <StatusDot :tone="kernelTone" :label="`Kernel ${kernelLabel}`" />
          {{ kernelLabel }}
        </span>
        <ChevronDown class="size-3.5" />
      </Button>
    </div>

    <Dialog v-model:open="kernelOpen">
      <DialogContent class="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kernel</DialogTitle>
          <DialogDescription>What this notebook runs on and where it may run. Changes apply the next time the kernel starts.</DialogDescription>
        </DialogHeader>

        <Notice v-if="problems.length" tone="warning" :lines="problems">This session cannot start yet.</Notice>
        <Notice v-if="session.error.value" tone="error">{{ session.error.value }}</Notice>
        <Notice v-if="session.notice.value" :tone="session.ended.value ? 'info' : 'warning'">{{ session.notice.value }}</Notice>

        <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <Badge :variant="stateVariant">{{ stateLabel }}</Badge>
          <Badge v-if="session.live.value" variant="outline" size="sm">Kernel {{ session.kernel.value }}</Badge>
          <span v-if="idleLeft" class="text-[11px] text-muted-foreground">Idle timeout: {{ idleLeft }}</span>
          <span v-if="session.nodeId.value" class="text-[11px] text-muted-foreground">
            on {{ displayName(session.nodeId.value) }}
          </span>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <label class="space-y-1">
            <span class="text-xs font-medium text-foreground">Runtime</span>
            <Select
              :model-value="meta?.runtime ?? ''"
              :options="runtimeOptions"
              aria-label="Runtime"
              :disabled="session.running.value"
              @update:model-value="notebook.patchMeta({ runtime: $event })"
            />
          </label>
          <label class="space-y-1">
            <span class="text-xs font-medium text-foreground">Idle timeout</span>
            <Select
              :model-value="session.idlePickMs.value ? String(session.idlePickMs.value) : ''"
              :options="idleOptions"
              placeholder="Realm default"
              aria-label="Idle timeout"
              :disabled="session.running.value"
              @update:model-value="session.idlePickMs.value = $event ? Number($event) : null"
            />
          </label>
          <label class="space-y-1">
            <span class="text-xs font-medium text-foreground">Node</span>
            <Select
              :model-value="meta?.placement?.node ?? ''"
              :options="nodeOptions"
              placeholder="Any node"
              aria-label="Node"
              :disabled="session.running.value"
              @update:model-value="setPlacement({ node: $event })"
            />
          </label>
          <label class="space-y-1">
            <span class="text-xs font-medium text-foreground">Executor</span>
            <Select
              :model-value="meta?.placement?.executor_kind ?? ''"
              :options="kindOptions"
              placeholder="Any executor"
              aria-label="Executor kind"
              :disabled="session.running.value"
              @update:model-value="setPlacement({ executor_kind: $event })"
            />
          </label>
          <label class="space-y-1">
            <span class="text-xs font-medium text-foreground">CPU cores</span>
            <Input v-model="cpuCores" type="number" min="1" step="1" :disabled="session.running.value" />
          </label>
          <label class="space-y-1">
            <span class="text-xs font-medium text-foreground">RAM in GB</span>
            <Input v-model="ramGb" type="number" min="0" step="any" :disabled="session.running.value" />
          </label>
          <label class="space-y-1 sm:col-span-2">
            <span class="text-xs font-medium text-foreground">Workspace bucket</span>
            <Input :model-value="meta?.workspace_bucket ?? ''" disabled aria-label="Workspace bucket" />
            <span class="text-[11px] text-muted-foreground">The notebook and its files live here.</span>
          </label>
        </div>

        <div v-if="dependencies" class="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/30 px-3 py-2">
          <div class="min-w-0">
            <p class="text-xs font-medium text-foreground">Dependencies</p>
            <p class="text-[11px] text-muted-foreground">{{ dependencyFileName(dependencies) }} installs when the kernel starts.</p>
          </div>
          <Button variant="outline" size="sm" @click="kernelOpen = false; dependenciesOpen = true">Edit</Button>
        </div>

        <DialogFooter>
          <Button
            v-if="session.running.value"
            variant="outline"
            :disabled="session.ending.value || session.restarting.value"
            @click="session.end()"
          >
            <CircleStop class="size-3.5" /> Stop kernel
          </Button>
          <Button
            v-if="session.running.value"
            :disabled="!session.live.value || session.ending.value || session.restarting.value"
            title="Start a fresh kernel with the saved dependencies; variables are cleared."
            @click="start(true)"
          >
            <RotateCcw class="size-3.5" /> Restart kernel
          </Button>
          <Button
            v-else
            :disabled="runBusy || Boolean(problems.length) || notebook.loading.value || !meta"
            @click="start()"
          >
            <Play class="size-3.5" /> Start kernel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <NotebookDependencies
      v-if="dependencies"
      v-model:open="dependenciesOpen"
      :kind="dependencies"
      :text="meta?.dependencies?.kind === dependencies ? meta.dependencies.text : ''"
      :running="session.running.value"
      @save="saveDependencies"
    />
  </div>
</template>
