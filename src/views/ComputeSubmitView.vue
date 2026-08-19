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
import Skeleton from '@/components/ui/Skeleton.vue'
import WizardSteps from '@/components/onboarding/WizardSteps.vue'
import TaskJsonPreview from '@/components/compute/TaskJsonPreview.vue'
import ExecutorStepsEditor from '@/components/compute/ExecutorStepsEditor.vue'
import TesInputsEditor from '@/components/compute/TesInputsEditor.vue'
import TesDataRefDialog from '@/components/compute/TesDataRefDialog.vue'
import ContainerFsTree from '@/components/compute/ContainerFsTree.vue'
import { useTes, isTesUnsupported } from '@/composables/useTes'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useComputeDataView } from '@/composables/useComputeDataView'
import { useS3 } from '@/composables/useS3'
import {
  TES_GROUP_TAG,
  expandDataRefEntry,
  parseS3Url,
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
const { tesEnabled, busy, createTask, getTask } = useTes()
const { currentUser, myGroups } = useAruna()
const { signIn, stage, authPending } = useAuth()

const signingIn = computed(() => stage.value === 'redirecting')
function startSignIn() {
  void signIn({ redirectTo: '/app/compute/new' })
}
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const WIZARD_STEPS = ['Basics', 'Workload', 'Review']
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
const executors = ref<TesExecutor[]>([{ image: '', command: [] }])

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

// type="number" inputs emit numbers; normalize before any string handling.
function text(value: string | number): string {
  return String(value).trim()
}

const cpuCores = ref<string | number>('')
const ramGb = ref<string | number>('')
const diskGb = ref<string | number>('')
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

// ── Re-run prefill (?rerun=<taskId>) ─────────────────────────────────────────
// The task id rides in the query so a page refresh re-applies the prefill.
const rerunSource = ref<{ id: string; name: string } | null>(null)
const rerunNotes = ref<string[]>([])
const rerunError = ref<string | null>(null)
const rerunLoading = ref(false)

async function applyRerun(id: string) {
  rerunLoading.value = true
  rerunError.value = null
  rerunNotes.value = []
  try {
    const source = await getTask(id, 'FULL')
    const notes: string[] = []
    name.value = source.name ?? ''
    description.value = source.description ?? ''
    const group = source.tags?.[TES_GROUP_TAG]
    if (group) groupId.value = group

    inputs.value = (source.inputs ?? []).map((input) => ({
      kind: 'file',
      url: input.url ?? '',
      path: input.path,
      name: input.name || input.path.split('/').filter(Boolean).pop() || 'input',
    }))
    if ((source.inputs ?? []).some((input) => input.name?.includes('/'))) {
      notes.push('Folder selections were restored as individual file inputs.')
    }

    const executor = source.executors?.[0]
    if (executor) {
      executors.value = [
        {
          image: executor.image,
          command: [...executor.command],
          ...(executor.workdir ? { workdir: executor.workdir } : {}),
          ...(executor.env ? { env: { ...executor.env } } : {}),
        },
      ]
      if ((source.executors?.length ?? 0) > 1) {
        notes.push('Only the first executor was restored; the facade accepts one per task.')
      }
    }

    outputRows.value = (source.outputs ?? []).flatMap((output) => {
      const parsed = parseS3Url(output.url)
      if (!parsed) {
        notes.push(`The output destination ${output.url} is not an s3:// URL and was not restored.`)
        return []
      }
      const dir = output.type === 'DIRECTORY' || output.path.endsWith('/')
      return [{ path: dir && !output.path.endsWith('/') ? `${output.path}/` : output.path, bucket: parsed.bucket, key: parsed.key }]
    })

    const r = source.resources
    cpuCores.value = r?.cpu_cores != null ? String(r.cpu_cores) : ''
    ramGb.value = r?.ram_gb != null ? String(r.ram_gb) : ''
    diskGb.value = r?.disk_gb != null ? String(r.disk_gb) : ''
    preemptible.value = !!r?.preemptible

    // The workspace choice is a create-time extension the task record does not
    // echo back, so it always needs a fresh pick.
    if (source.workspace) {
      workspaceMode.value = source.workspace.mode
      workspaceBucket.value = source.workspace.bucket ?? ''
    } else {
      notes.push('The workspace choice is not part of the task record; pick one before submitting.')
    }

    rerunSource.value = { id, name: source.name || id }
    rerunNotes.value = notes
  } catch (err) {
    rerunError.value = errorMessage(err)
  } finally {
    rerunLoading.value = false
  }
}

function dismissRerun() {
  rerunSource.value = null
  rerunNotes.value = []
  rerunError.value = null
  void router.replace({ query: { ...route.query, rerun: undefined } })
}

onMounted(() => {
  const rerun = route.query.rerun
  if (typeof rerun === 'string' && rerun) void applyRerun(rerun)
})

const outputs = computed<TesOutput[]>(() =>
  outputRows.value.map((row) => ({
    url: `s3://${row.bucket.trim()}/${normalizedOutputKey(row.key)}`,
    path: row.path.trim(),
    type: isDirCapture(row.path) ? ('DIRECTORY' as const) : ('FILE' as const),
  })),
)

const resources = computed<TesResources>(() => {
  const r: TesResources = {}
  const cpuRaw = text(cpuCores.value)
  const cpu = Number(cpuRaw)
  if (cpuRaw && !Number.isNaN(cpu)) r.cpu_cores = cpu
  const ramRaw = text(ramGb.value)
  const ram = Number(ramRaw)
  if (ramRaw && !Number.isNaN(ram)) r.ram_gb = ram
  const diskRaw = text(diskGb.value)
  const disk = Number(diskRaw)
  if (diskRaw && !Number.isNaN(disk)) r.disk_gb = disk
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
// The editor emits an empty argv for an empty or unparseable command line, so
// a non-empty command with at least one real argument is the whole check.
const executorsValid = computed(
  () =>
    executors.value.length === 1 &&
    executors.value[0].image.trim().length > 0 &&
    executors.value[0].command.length > 0 &&
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
const U32_MAX = 4_294_967_295
const MIN_RESOURCE_GB = 0.000000001
// TES converts decimal GB to bytes and accepts 1..=i64::MAX; this is the
// largest f64 GB value whose conversion does not round up past that limit.
const MAX_RESOURCE_GB = 9_223_372_036.854_774

const cpuCoresValid = computed(() => {
  const raw = text(cpuCores.value)
  if (!raw) return true
  const cpu = Number(raw)
  return Number.isInteger(cpu) && cpu >= 1 && cpu <= U32_MAX
})
function decimalGbValid(value: string | number): boolean {
  const raw = text(value)
  if (!raw) return true
  const gb = Number(raw)
  return Number.isFinite(gb) && gb >= MIN_RESOURCE_GB && gb <= MAX_RESOURCE_GB
}
const ramGbValid = computed(() => decimalGbValid(ramGb.value))
const diskGbValid = computed(() => decimalGbValid(diskGb.value))
const canContinue = computed(() => {
  switch (step.value) {
    case 0:
      return groupId.value.length > 0
    case 1:
      return (
        groupId.value.length > 0 &&
        executorsValid.value &&
        outputsValid.value &&
        workspaceValid.value &&
        cpuCoresValid.value &&
        ramGbValid.value &&
        diskGbValid.value
      )
    default:
      return groupId.value.length > 0
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

// ── Filesystem-tree wiring (shared component with the quick-run wizard) ──────
// The Tree|Table choice persists per browser (shared with quick run).
const dataView = useComputeDataView()
const inputDialogOpen = ref(false)
const inputMountDefault = ref('/inputs/')
const treeOutputs = computed(() =>
  outputRows.value.map((row) => ({ containerPath: row.path, destination: outputDestination(row) })),
)
function addInputEntry(entry: TesDataRefEntry) {
  inputs.value = [...inputs.value, entry]
}
function removeInputEntry(index: number) {
  inputs.value = inputs.value.filter((_, i) => i !== index)
}
function onTreeInputPath(index: number, path: string) {
  inputs.value = inputs.value.map((entry, i) =>
    i === index ? (entry.kind === 'folder' ? { ...entry, basePath: path } : { ...entry, path }) : entry,
  )
}
function onTreeOutputPath(index: number, path: string) {
  const row = outputRows.value[index]
  if (row) row.path = path
}
function onTreeAddOutput(containerDir: string) {
  outputRows.value.push({ path: containerDir, bucket: outputRows.value.at(-1)?.bucket ?? '', key: '' })
}
function onTreeAddInput(containerDir: string) {
  inputMountDefault.value = containerDir
  inputDialogOpen.value = true
}
function openInputDialog() {
  inputMountDefault.value = '/inputs/'
  inputDialogOpen.value = true
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

    <!-- Session restore in flight: never flash the signed-out gate. -->
    <div v-else-if="authPending" class="container py-8">
      <section class="surface mx-auto max-w-xl space-y-3 p-8">
        <Skeleton class="mx-auto h-8 w-8 rounded-full" />
        <Skeleton class="mx-auto h-4 w-44" />
        <Skeleton class="mx-auto h-3 w-64" />
      </section>
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
      <!-- Re-run prefill status -->
      <div v-if="rerunLoading" class="surface-inline px-4 py-3 text-xs text-muted-foreground">Loading the task to re-run…</div>
      <div v-else-if="rerunError" class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs text-destructive">
        <span>{{ rerunError }}</span>
        <Button variant="ghost" size="sm" @click="dismissRerun">Dismiss</Button>
      </div>
      <div v-else-if="rerunSource" class="space-y-1.5 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-xs">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium text-foreground">Prefilled from task <span class="font-mono">{{ rerunSource.name }}</span>.</span>
          <Button variant="ghost" size="sm" @click="dismissRerun">Dismiss</Button>
        </div>
        <ul v-if="rerunNotes.length" class="list-disc space-y-0.5 pl-4 text-muted-foreground">
          <li v-for="note in rerunNotes" :key="note">{{ note }}</li>
        </ul>
      </div>

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

        <!-- Step 2: Workload, the container filesystem (inputs and captures)
             and the executor that runs against it, one coherent surface. -->
        <div v-else-if="step === 1" class="space-y-6">
          <div class="grid gap-5 xl:grid-cols-2">
            <div class="min-w-0 space-y-3">
              <div class="flex items-center justify-between gap-2">
                <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Container filesystem</div>
                <div class="inline-flex rounded-md border border-border p-0.5">
                  <button
                    type="button"
                    :class="[
                      'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
                      dataView === 'tree' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                    ]"
                    @click="dataView = 'tree'"
                  >
                    Tree
                  </button>
                  <button
                    type="button"
                    :class="[
                      'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
                      dataView === 'table' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                    ]"
                    @click="dataView = 'table'"
                  >
                    Table
                  </button>
                </div>
              </div>

              <section v-if="dataView === 'tree'" class="surface-inline space-y-2.5 p-3.5">
                <p class="text-[11px] text-muted-foreground">
                  What the task sees at run time. Use a folder's + menu to create subfolders, stage inputs, or capture outputs.
                </p>
                <ContainerFsTree
                  :inputs="inputs"
                  :outputs="treeOutputs"
                  :workspace="executors[0]?.workdir || null"
                  @update-input-path="onTreeInputPath"
                  @remove-input="removeInputEntry"
                  @update-output-path="onTreeOutputPath"
                  @remove-output="removeOutputRow"
                  @add-output="onTreeAddOutput"
                  @add-input="onTreeAddInput"
                >
                  <template #output-details="{ index }">
                    <div v-if="outputRows[index]" class="flex items-center gap-1.5">
                      <span class="shrink-0 text-[10px] font-medium text-muted-foreground">into</span>
                      <Select
                        v-if="workspaceBucketOptions.length"
                        v-model="outputRows[index].bucket"
                        :options="workspaceBucketOptions"
                        placeholder="Bucket"
                        class="h-7 w-32 shrink-0 text-xs"
                        aria-label="Destination bucket"
                      />
                      <Input v-else v-model="outputRows[index].bucket" class="h-7 w-32 shrink-0 font-mono text-xs" placeholder="my-results" aria-label="Destination bucket" />
                      <span class="shrink-0 text-muted-foreground">/</span>
                      <Input
                        v-model="outputRows[index].key"
                        class="h-7 min-w-0 flex-1 font-mono text-xs"
                        placeholder="runs/result.txt"
                        aria-label="Destination key"
                        @blur="onOutputKeyBlur(outputRows[index])"
                      />
                    </div>
                  </template>
                </ContainerFsTree>
                <p v-if="outputRows.length && !outputsValid" class="text-[11px] text-destructive">
                  Every capture needs an absolute container path, one bucket and a canonical key; folder captures (path ending in /) need a key ending in /; container paths and destinations must be unique.
                </p>
                <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <Button variant="outline" size="sm" @click="openInputDialog"><ListPlus class="size-3.5" /> Add input</Button>
                  <Button variant="outline" size="sm" @click="addOutputRow"><Plus class="size-3.5" /> Add output</Button>
                </div>
                <p class="text-[11px] text-muted-foreground">A folder capture (path ending in /) uploads everything the task wrote under it after the run.</p>
              </section>

              <template v-else>
                <TesInputsEditor v-model="inputs" />
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
              </template>
            </div>

            <div class="min-w-0">
              <ExecutorStepsEditor v-model="executors" />
            </div>
          </div>

          <div class="grid gap-6 lg:grid-cols-2">
          <div class="space-y-3">
            <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resources</div>
            <div class="grid gap-3 sm:grid-cols-3">
              <div>
                <label class="text-xs font-medium text-foreground">CPU cores</label>
                <Input v-model="cpuCores" type="number" min="1" :max="U32_MAX" step="1" class="mt-1" placeholder="1" title="Allowed range: 1 to 4294967295." />
                <p v-if="!cpuCoresValid" class="mt-1 text-[11px] text-destructive">Enter a whole number of at least 1.</p>
              </div>
              <div>
                <label class="text-xs font-medium text-foreground">RAM (GB)</label>
                <Input v-model="ramGb" type="number" :min="MIN_RESOURCE_GB" :max="MAX_RESOURCE_GB" step="any" class="mt-1" placeholder="2" title="Allowed range: 0.000000001 to 9223372036.854774 GB." />
                <p v-if="!ramGbValid" class="mt-1 text-[11px] text-destructive">Must be greater than zero.</p>
              </div>
              <div>
                <label class="text-xs font-medium text-foreground">Disk (GB)</label>
                <Input v-model="diskGb" type="number" :min="MIN_RESOURCE_GB" :max="MAX_RESOURCE_GB" step="any" class="mt-1" placeholder="10" title="Allowed range: 0.000000001 to 9223372036.854774 GB." />
                <p v-if="!diskGbValid" class="mt-1 text-[11px] text-destructive">Must be greater than zero.</p>
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
        </div>

        <!-- Step 3: Review -->
        <div v-else class="space-y-3">
          <TaskJsonPreview title="TES task request" :task="task" />
          <details class="text-[11px] text-muted-foreground">
            <summary class="cursor-pointer">Technical details</summary>
            <code class="mt-1 block rounded bg-muted px-2 py-1">POST /ga4gh/tes/v1/tasks</code>
          </details>
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
        <Button v-else size="sm" :disabled="busy || !groupId || !executorsValid || !outputsValid || !workspaceValid || !cpuCoresValid || !ramGbValid || !diskGbValid || !!submittedWithoutWorkspace" @click="submit"><ListPlus class="h-4 w-4" /> Submit task</Button>
      </div>
    </div>

    <!-- Input picker for the filesystem tree's per-folder add-input action;
         the Table view's TesInputsEditor keeps its own dialog. -->
    <TesDataRefDialog v-model:open="inputDialogOpen" mode="input" :mount-default="inputMountDefault" @add="addInputEntry" />
  </div>
</template>
