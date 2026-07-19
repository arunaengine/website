<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import WizardSteps from '@/components/onboarding/WizardSteps.vue'
import TaskJsonPreview from '@/components/compute/TaskJsonPreview.vue'
import ExecutorStepsEditor from '@/components/compute/ExecutorStepsEditor.vue'
import TesInputsEditor from '@/components/compute/TesInputsEditor.vue'
import { useTes, isTesUnsupported } from '@/composables/useTes'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useS3 } from '@/composables/useS3'
import {
  TES_GROUP_TAG,
  expandDataRefEntry,
  pruneTesTask,
  validContainerDir,
  validContainerFilePath,
  type TesDataRefEntry,
  type TesExecutor,
  type TesOutput,
  type TesResources,
  type TesTask,
} from '@/lib/tes'
import { isWorkspaceBucket, type WorkspaceMode } from '@/lib/workspaces'
import Badge from '@/components/ui/Badge.vue'
import { ArrowLeft, ArrowRight, Cpu, FileText, Folder, ListPlus, LogIn, Plus, X } from '@lucide/vue'

const router = useRouter()
const route = useRoute()
const { tesEnabled, busy, createTask } = useTes()
const { currentUser, myGroups } = useAruna()
const { signIn, stage } = useAuth()

const signingIn = computed(() => stage.value === 'redirecting')
function startSignIn() {
  void signIn({ redirectTo: '/app/compute/new' })
}
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const WIZARD_STEPS = ['Basics', 'Inputs', 'Executor', 'Outputs & resources', 'Review']
// The step lives in ?step=N so browser back/forward walks the wizard instead
// of leaving it.
const step = computed(() => {
  const raw = Number(route.query.step)
  return Number.isInteger(raw) && raw > 0 && raw < WIZARD_STEPS.length ? raw : 0
})
function goStep(target: number) {
  void router.push({ query: { ...route.query, step: target > 0 ? String(target) : undefined } })
}

// ── Draft ────────────────────────────────────────────────────────────────────
const name = ref('')
const description = ref('')
const groupId = ref('')
// Files and folder summaries from the picker; folders expand to per-file
// FILE inputs at task assembly (the facade accepts FILE inputs only).
const inputs = ref<TesDataRefEntry[]>([])
const executors = ref<TesExecutor[]>([{ image: '', command: [''] }])

// Capture-into outputs: each row captures one container path (a file, or a
// folder when the path ends in '/') into its own bucket + key destination.
const outputRows = ref<{ path: string; bucket: string; key: string }[]>([
  { path: '/outputs/result.txt', bucket: '', key: '' },
])

// A container path ending in '/' is a DIRECTORY output: everything the task
// wrote below it is uploaded under the destination key prefix after the run.
function isDirCapture(path: string): boolean {
  return path.trim().endsWith('/')
}
function normalizedOutputKey(key: string): string {
  return key.trim().replace(/^\/+/, '')
}
// Folder captures write to a key prefix; append the missing trailing slash on
// blur instead of rejecting it.
function onOutputKeyBlur(row: { path: string; key: string }) {
  const key = row.key.trim()
  if (isDirCapture(row.path) && key && !key.endsWith('/')) row.key = `${key}/`
}
function outputDestination(row: { bucket: string; key: string }): string {
  return `s3://${row.bucket.trim() || '<bucket>'}/${normalizedOutputKey(row.key) || '<key>'}`
}

const cpuCores = ref('')
const ramGb = ref('')
const diskGb = ref('')
const preemptible = ref(false)

// Workspace handling for the run's scratch storage — an explicit, required
// choice (agreed contract; a node that predates it ignores the field and the
// submit path reports that).
const WORKSPACE_OPTIONS: { mode: WorkspaceMode; label: string; hint: string }[] = [
  { mode: 'temporary', label: 'Temporary workspace', hint: 'Scratch bucket for this run, deleted after it succeeds.' },
  { mode: 'kept', label: 'Keep workspace', hint: 'The run’s ws-… bucket stays for inspection after completion.' },
  { mode: 'existing', label: 'Use existing bucket…', hint: 'The run works inside a bucket you pick.' },
]
const workspaceMode = ref<WorkspaceMode | ''>('')
const workspaceBucket = ref('')
const workspaceValid = computed(() => {
  if (workspaceMode.value === 'temporary' || workspaceMode.value === 'kept') return true
  return workspaceMode.value === 'existing' && !!workspaceBucket.value.trim()
})

// Bucket options for the workspace "existing" choice and the output
// destinations, best effort via the browser's S3 session; without credentials
// the fields fall back to free text.
const s3 = useS3()
const workspaceBucketOptions = ref<{ value: string; label: string }[]>([])
onMounted(async () => {
  if (!s3.hasActiveKey.value || !s3.endpoint.value) return
  try {
    workspaceBucketOptions.value = (await s3.listBuckets())
      .map((b) => b.name)
      .filter((name) => !isWorkspaceBucket(name))
      .map((name) => ({ value: name, label: name }))
  } catch {
    workspaceBucketOptions.value = []
  }
})

const groupOptions = computed(() => myGroups.value.map((g) => ({ value: g.id, label: g.name })))

const outputs = computed<TesOutput[]>(() =>
  outputRows.value.map((row) => ({
    url: `s3://${row.bucket.trim()}/${normalizedOutputKey(row.key)}`,
    path: row.path.trim(),
    type: isDirCapture(row.path) ? ('DIRECTORY' as const) : ('FILE' as const),
  })),
)

const resources = computed<TesResources>(() => {
  const r: TesResources = {}
  const cpu = Number(cpuCores.value)
  if (cpuCores.value.trim() && !Number.isNaN(cpu)) r.cpu_cores = cpu
  const ram = Number(ramGb.value)
  if (ramGb.value.trim() && !Number.isNaN(ram)) r.ram_gb = ram
  const disk = Number(diskGb.value)
  if (diskGb.value.trim() && !Number.isNaN(disk)) r.disk_gb = disk
  if (preemptible.value) r.preemptible = true
  return r
})

const task = computed<TesTask>(() =>
  pruneTesTask({
    name: name.value,
    description: description.value,
    inputs: inputs.value.flatMap(expandDataRefEntry),
    outputs: outputs.value,
    resources: resources.value,
    executors: executors.value,
    tags: { [TES_GROUP_TAG]: groupId.value },
    workspace: workspaceMode.value
      ? { mode: workspaceMode.value, bucket: workspaceMode.value === 'existing' ? workspaceBucket.value.trim() : undefined }
      : undefined,
  }),
)

// ── Validity ─────────────────────────────────────────────────────────────────
const executorsValid = computed(
  () =>
    executors.value.length === 1 &&
    executors.value[0].image.trim().length > 0 &&
    executors.value[0].command.some((argument) => argument.trim()),
)
const outputsValid = computed(() => {
  const rows = outputRows.value
  const validRow = (row: { path: string; bucket: string; key: string }) => {
    const path = row.path.trim()
    if (isDirCapture(path) ? path === '/' || !validContainerDir(path) : !validContainerFilePath(path)) {
      return false
    }
    const bucket = row.bucket.trim()
    if (!bucket || bucket.includes('/')) return false
    const key = normalizedOutputKey(row.key)
    if (!key) return false
    // Folder captures need a key prefix (trailing slash), files a plain key.
    if (isDirCapture(path) !== key.endsWith('/')) return false
    const segments = (key.endsWith('/') ? key.slice(0, -1) : key).split('/')
    return segments.every((segment) => segment && segment !== '.' && segment !== '..')
  }
  const containerPaths = rows.map((row) => row.path.trim())
  const destinations = rows.map((row) => `${row.bucket.trim()}/${normalizedOutputKey(row.key)}`)
  return (
    rows.every(validRow) &&
    new Set(containerPaths).size === containerPaths.length &&
    new Set(destinations).size === destinations.length
  )
})
const canContinue = computed(() => {
  switch (step.value) {
    case 0:
      return groupId.value.length > 0
    case 2:
      return executorsValid.value
    case 3:
      return outputsValid.value && workspaceValid.value
    default:
      return true
  }
})

function next() {
  if (canContinue.value && step.value < WIZARD_STEPS.length - 1) goStep(step.value + 1)
}
// The first step's Back leaves the wizard, and the button says so.
function back() {
  if (step.value > 0) goStep(step.value - 1)
  else void router.push({ name: 'compute' })
}

function addOutputRow() {
  outputRows.value.push({ path: '/outputs/result.txt', bucket: outputRows.value.at(-1)?.bucket ?? '', key: '' })
}
function removeOutputRow(i: number) {
  outputRows.value.splice(i, 1)
}

// ── Submit ───────────────────────────────────────────────────────────────────
const submitError = ref<string | null>(null)
// Set instead of navigating away when the node dropped the workspace choice,
// so the hint is actually seen; the task itself was submitted fine.
const submittedWithoutWorkspace = ref<string | null>(null)
async function submit() {
  submitError.value = null
  try {
    const created = await createTask(task.value)
    if (created.workspaceIgnored) {
      submittedWithoutWorkspace.value = created.id
      return
    }
    void router.push({ name: 'compute-task', params: { taskId: created.id } })
  } catch (err) {
    submitError.value = isTesUnsupported(err)
      ? `This node does not expose the TES endpoint. ${errorMessage(err)}`
      : errorMessage(err)
  }
}
</script>

<template>
  <div>
    <PageHeader title="New compute task" description="Describe a GA4GH TES task and submit it to this node.">
      <template #actions>
        <RouterLink :to="{ name: 'compute' }">
          <Button variant="outline" size="sm"><ArrowLeft class="h-4 w-4" /> Back to Compute</Button>
        </RouterLink>
      </template>
    </PageHeader>

    <!-- Gate 1: feature disabled -->
    <div v-if="!tesEnabled" class="container py-8">
      <EmptyState
        title="Compute is not enabled"
        description="Set features.tes to true in portal-config.json for this deployment; the Compute surface then targets any node that exposes the GA4GH TES endpoint."
      >
        <template #icon><Cpu class="h-7 w-7" /></template>
      </EmptyState>
    </div>

    <!-- Gate 2: not signed in -->
    <div v-else-if="!currentUser" class="container py-8">
      <section class="surface mx-auto max-w-xl p-8 text-center">
        <Cpu class="mx-auto h-8 w-8 text-muted-foreground/70" />
        <h2 class="mt-3 font-display text-base font-semibold text-aruna-navy">Sign in to submit a task</h2>
        <p class="mt-1.5 text-sm text-muted-foreground">Submitting GA4GH TES tasks is an authenticated operation.</p>
        <Button class="mt-4" size="sm" :disabled="signingIn" @click="startSignIn"><LogIn class="h-3.5 w-3.5" /> Sign in</Button>
      </section>
    </div>

    <!-- Wizard -->
    <div v-else class="container space-y-6 py-8">
      <WizardSteps :steps="WIZARD_STEPS" :current="step" />

      <section class="surface space-y-5 p-6">
        <!-- Step 1: Basics -->
        <div v-if="step === 0" class="max-w-xl space-y-4">
          <div>
            <label class="text-xs font-medium text-foreground">Name <span class="text-muted-foreground">(optional)</span></label>
            <Input v-model="name" class="mt-1" placeholder="align-and-count" />
          </div>
          <div>
            <label class="text-xs font-medium text-foreground">Description <span class="text-muted-foreground">(optional)</span></label>
            <Textarea v-model="description" class="mt-1" rows="3" />
          </div>
          <div>
            <label class="text-xs font-medium text-foreground">Group</label>
            <Select v-model="groupId" :options="groupOptions" placeholder="Select a group" class="mt-1" />
            <p class="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Sets the required <code class="rounded bg-muted px-1">aruna-engine.org/group</code> tag; the node accounts the run and writes its Process Run crate under this group.
            </p>
          </div>
        </div>

        <!-- Step 2: Inputs -->
        <div v-else-if="step === 1">
          <TesInputsEditor v-model="inputs" />
        </div>

        <!-- Step 3: Executors -->
        <div v-else-if="step === 2">
          <ExecutorStepsEditor v-model="executors" />
        </div>

        <!-- Step 4: Outputs & resources -->
        <div v-else-if="step === 3" class="space-y-6">
          <div class="space-y-3">
            <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Outputs</div>
            <!-- Same row grid as TesInputsEditor: flexible content column plus
                 a fixed 1.75rem action column so both editors share one right
                 edge for controls and remove buttons. -->
            <div v-for="(row, i) in outputRows" :key="i" class="surface-inline grid grid-cols-[minmax(0,1fr)_1.75rem] gap-x-2 p-3">
              <div class="min-w-0 space-y-2">
                <div class="flex flex-wrap items-end gap-3">
                  <div class="min-w-0 flex-1">
                    <label class="text-xs font-medium text-foreground">Capture <span class="text-muted-foreground">(container path)</span></label>
                    <Input v-model="row.path" class="mt-1 font-mono" placeholder="/outputs/result.txt" aria-label="Container path to capture" />
                  </div>
                  <span class="pb-2.5 text-xs text-muted-foreground">into</span>
                  <div class="w-44">
                    <label class="text-xs font-medium text-foreground">Bucket</label>
                    <Select v-if="workspaceBucketOptions.length" v-model="row.bucket" :options="workspaceBucketOptions" placeholder="Bucket" class="mt-1" aria-label="Destination bucket" />
                    <Input v-else v-model="row.bucket" class="mt-1 font-mono" placeholder="my-results" aria-label="Destination bucket" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <label class="text-xs font-medium text-foreground">Key</label>
                    <Input v-model="row.key" class="mt-1 font-mono" placeholder="runs/result.txt" aria-label="Destination key" @blur="onOutputKeyBlur(row)" />
                  </div>
                </div>
                <div class="flex min-w-0 items-center gap-2 font-mono text-[11px] text-muted-foreground">
                  <Badge variant="outline" class="shrink-0 gap-1 font-sans text-[10px]">
                    <component :is="isDirCapture(row.path) ? Folder : FileText" class="h-3 w-3" />
                    {{ isDirCapture(row.path) ? 'Folder' : 'File' }}
                  </Badge>
                  <span class="truncate" :title="outputDestination(row)">{{ outputDestination(row) }}</span>
                </div>
              </div>
              <Button variant="ghost" size="icon-sm" class="self-center text-destructive hover:text-destructive" aria-label="Remove output" @click="removeOutputRow(i)"><X class="h-4 w-4" /></Button>
            </div>
            <Button variant="outline" size="sm" @click="addOutputRow"><Plus class="size-3.5" /> Add output</Button>
            <p class="text-[11px] text-muted-foreground">A folder capture (container path ending in /) uploads everything the task wrote under that path after the run.</p>
            <p v-if="outputRows.length && !outputsValid" class="text-[11px] text-destructive">
              Every capture needs an absolute container path, one bucket and a canonical key; folder captures (path ending in /) need a key ending in /; container paths and destinations must be unique.
            </p>
          </div>

          <div class="space-y-3">
            <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resources</div>
            <div class="grid gap-3 sm:grid-cols-3">
              <div>
                <label class="text-xs font-medium text-foreground">CPU cores</label>
                <Input v-model="cpuCores" type="number" min="1" step="1" class="mt-1" placeholder="1" />
              </div>
              <div>
                <label class="text-xs font-medium text-foreground">RAM (GB)</label>
                <Input v-model="ramGb" type="number" min="0.5" step="0.5" class="mt-1" placeholder="2" />
              </div>
              <div>
                <label class="text-xs font-medium text-foreground">Disk (GB)</label>
                <Input v-model="diskGb" type="number" min="1" step="1" class="mt-1" placeholder="10" />
              </div>
            </div>
            <label class="flex items-center gap-2 text-xs font-medium text-foreground">
              <Switch v-model:checked="preemptible" /> Preemptible
            </label>
            <p class="text-[11px] text-muted-foreground">Allows the backend to run this on capacity that may be reclaimed (state <code class="rounded bg-muted px-1">PREEMPTED</code>).</p>
          </div>

          <div class="space-y-3">
            <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Workspace</div>
            <p class="text-[11px] text-muted-foreground">Choose how the run's scratch storage is handled.</p>
            <div class="grid gap-2 sm:grid-cols-3">
              <button
                v-for="option in WORKSPACE_OPTIONS"
                :key="option.mode"
                type="button"
                class="rounded-lg border p-3 text-left transition-colors"
                :class="workspaceMode === option.mode ? 'border-primary bg-primary/5 ring-1 ring-primary/40' : 'border-border hover:bg-muted/40'"
                @click="workspaceMode = option.mode"
              >
                <div class="text-xs font-semibold text-foreground">{{ option.label }}</div>
                <div class="mt-0.5 text-[11px] text-muted-foreground">{{ option.hint }}</div>
              </button>
            </div>
            <div v-if="workspaceMode === 'existing'" class="max-w-xs">
              <label class="text-xs font-medium text-foreground">Workspace bucket</label>
              <Select v-if="workspaceBucketOptions.length" v-model="workspaceBucket" :options="workspaceBucketOptions" placeholder="Select a bucket" class="mt-1" />
              <Input v-else v-model="workspaceBucket" class="mt-1 font-mono" placeholder="my-workspace" />
            </div>
            <p v-if="!workspaceValid" class="text-[11px] text-destructive">
              {{ workspaceMode === 'existing' ? 'Pick the bucket the run should work in.' : 'A workspace choice is required before submitting.' }}
            </p>
          </div>
        </div>

        <!-- Step 5: Review -->
        <div v-else class="space-y-3">
          <TaskJsonPreview title="TES task (POST /ga4gh/tes/v1/tasks)" :task="task" />
          <p v-if="submitError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ submitError }}</p>
          <div
            v-if="submittedWithoutWorkspace"
            class="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
          >
            <span>The task was submitted, but workspace choices are not supported by this node yet, it runs without one.</span>
            <Button
              variant="outline"
              size="sm"
              class="shrink-0"
              @click="router.push({ name: 'compute-task', params: { taskId: submittedWithoutWorkspace } })"
            >
              View task <ArrowRight class="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </section>

      <div class="flex items-center justify-between">
        <Button variant="outline" size="sm" @click="back">
          <ArrowLeft v-if="step === 0" class="h-3.5 w-3.5" /> {{ step === 0 ? 'Back to Compute' : 'Back' }}
        </Button>
        <Button v-if="step < WIZARD_STEPS.length - 1" size="sm" :disabled="!canContinue" @click="next">Continue</Button>
        <Button v-else size="sm" :disabled="busy || !workspaceValid || !!submittedWithoutWorkspace" @click="submit"><ListPlus class="h-4 w-4" /> Submit task</Button>
      </div>
    </div>
  </div>
</template>
