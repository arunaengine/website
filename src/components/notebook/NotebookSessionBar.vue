<script setup lang="ts">
// What the session runs on, and its state: runtime, dependencies, the bucket
// the notebook works in, where it may run, what it needs, and Start or End.
import { computed, onMounted, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import NotebookDependencies from '@/components/notebook/NotebookDependencies.vue'
import { injectNotebook } from '@/composables/notebookContext'
import { useAruna } from '@/composables/useAruna'
import { useNow } from '@/composables/useNow'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { SESSION_RUNTIMES, dependencyKind } from '@/lib/notebook/runtimes'
import { dependencyKey } from '@/lib/notebook/document'
import { sessionProblems } from '@/lib/notebook/submit'
import { DEFAULT_SESSION_IDLE_AFTER_MS } from '@/lib/computeAdmin'
import { useComputeAdmin } from '@/composables/useComputeAdmin'
import { CircleStop, Play, Settings2 } from '@lucide/vue'

const { notebook, session } = injectNotebook()
const { myGroups } = useAruna()
const { getComputeConfig } = useComputeAdmin()
const { nodes, displayName } = useRealmNodes()
const now = useNow(1_000)

const settingsOpen = ref(false)
const dependenciesOpen = ref(false)

const meta = computed(() => notebook.meta.value)
const runtimeOptions = SESSION_RUNTIMES.map((runtime) => ({ value: runtime.id, label: runtime.label }))
const groupOptions = computed(() => myGroups.value.map((group) => ({ value: group.id, label: group.name })))
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
  if (session.starting.value) return 'Starting'
  const state = session.state.value?.state
  if (!state) return session.jobId.value ? 'Not attached' : 'No session'
  return state.charAt(0).toUpperCase() + state.slice(1)
})
const stateVariant = computed(() => {
  if (session.ended.value) return 'outline' as const
  if (session.live.value) return 'success' as const
  return 'warn' as const
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
  sessionProblems({
    groupId: meta.value?.group_id ?? '',
    runtime: meta.value?.runtime ?? '',
    workspaceBucket: meta.value?.workspace_bucket ?? '',
  }),
)

// Null while the runtime is one this portal does not know.
const dependencies = computed(() => dependencyKind(meta.value?.runtime ?? ''))

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

function start() {
  const current = meta.value
  if (!current) return
  const declared = current.dependencies?.text.trim() ? current.dependencies : undefined
  void session.start({
    groupId: current.group_id,
    name: notebook.name.value,
    runtime: current.runtime,
    workspaceBucket: current.workspace_bucket,
    ...(declared
      ? {
          dependencyKey: dependencyKey(notebook.name.value, declared.kind),
          dependencyKind: declared.kind,
          dependencyText: declared.text,
        }
      : {}),
    resources: current.resources,
    placement: current.placement,
  })
}
</script>

<template>
  <div class="surface space-y-3 p-3">
    <div class="flex flex-wrap items-center gap-2">
      <Badge :variant="stateVariant">{{ stateLabel }}</Badge>
      <Badge v-if="session.live.value" variant="outline" size="sm">Kernel {{ session.kernel.value }}</Badge>
      <span v-if="idleLeft" class="text-[11px] text-muted-foreground">Idle timeout: {{ idleLeft }}</span>
      <span v-if="session.nodeId.value" class="text-[11px] text-muted-foreground">
        on {{ displayName(session.nodeId.value) }}
      </span>
      <span class="flex-1" />

      <Select
        :model-value="meta?.runtime ?? ''"
        :options="runtimeOptions"
        aria-label="Runtime"
        class="w-48"
        :disabled="session.running.value"
        @update:model-value="notebook.patchMeta({ runtime: $event })"
      />
      <Button variant="outline" size="sm" :disabled="!dependencies" @click="dependenciesOpen = true">
        Dependencies
      </Button>
      <Button variant="outline" size="sm" :aria-expanded="settingsOpen" @click="settingsOpen = !settingsOpen">
        <Settings2 class="size-3.5" /> Session
      </Button>
      <Button v-if="session.running.value" variant="outline" size="sm" :disabled="session.ending.value" @click="session.end()">
        <CircleStop class="size-3.5" /> End
      </Button>
      <Button v-else size="sm" :disabled="Boolean(problems.length) || session.starting.value" @click="start">
        <Play class="size-3.5" /> {{ session.starting.value ? 'Starting…' : 'Start' }}
      </Button>
    </div>

    <div v-if="settingsOpen" class="grid gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-3">
      <label class="space-y-1">
        <span class="text-xs font-medium text-foreground">Group</span>
        <Select
          :model-value="meta?.group_id ?? ''"
          :options="groupOptions"
          aria-label="Owning group"
          :disabled="session.running.value"
          @update:model-value="notebook.patchMeta({ group_id: $event })"
        />
      </label>
      <label class="space-y-1">
        <span class="text-xs font-medium text-foreground">Workspace bucket</span>
        <Input :model-value="meta?.workspace_bucket ?? ''" disabled aria-label="Workspace bucket" />
        <span class="text-[11px] text-muted-foreground">The notebook and its files live here.</span>
      </label>
      <label class="space-y-1">
        <span class="text-xs font-medium text-foreground">Idle timeout</span>
        <Select
          :model-value="session.idlePickMs.value ? String(session.idlePickMs.value) : ''"
          :options="idleOptions"
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
          aria-label="Executor kind"
          :disabled="session.running.value"
          @update:model-value="setPlacement({ executor_kind: $event })"
        />
      </label>
      <div class="grid grid-cols-2 gap-2">
        <label class="space-y-1">
          <span class="text-xs font-medium text-foreground">CPU cores</span>
          <Input v-model="cpuCores" type="number" min="1" step="1" :disabled="session.running.value" />
        </label>
        <label class="space-y-1">
          <span class="text-xs font-medium text-foreground">RAM in GB</span>
          <Input v-model="ramGb" type="number" min="0" step="any" :disabled="session.running.value" />
        </label>
      </div>
    </div>

    <Notice v-if="problems.length" tone="warning" :lines="problems">This session cannot start yet.</Notice>
    <Notice v-if="session.error.value" tone="error">{{ session.error.value }}</Notice>
    <Notice v-if="session.notice.value" tone="warning">{{ session.notice.value }}</Notice>

    <NotebookDependencies
      v-if="dependencies"
      v-model:open="dependenciesOpen"
      :kind="dependencies"
      :text="meta?.dependencies?.text ?? ''"
      @save="notebook.patchMeta({ dependencies: { kind: dependencies, text: $event } })"
    />
  </div>
</template>
