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
import RunTargetPicker from '@/components/compute/RunTargetPicker.vue'
import GroupSelect from '@/components/groups/GroupSelect.vue'
import { useTes, isTesUnsupported } from '@/composables/useTes'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useComputeDataView } from '@/composables/useComputeDataView'
import { useRealm } from '@/composables/useRealm'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useRunTarget } from '@/composables/useRunTarget'
import { useS3 } from '@/composables/useS3'
import {
  TES_EXECUTOR_TAG,
  TES_GROUP_TAG,
  captureContainerPath,
  captureOutput,
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
import {
  droppedNativeFields,
  isNativeBlocked,
  nativeSubmitRequired,
  tesFormToExecutionRequest,
  type InputPlacement,
  type NativePlacementOptions,
} from '@/lib/nativeSubmit'
import {
  isNativeSubmitUnsupported,
  isSubmitRetryable,
  submitErrorMessage,
  submitJob,
  type CollisionPolicyRequest,
  type InputModeRequest,
} from '@/lib/jobs'
import { createOperationId } from '@/lib/placementPolicies'
import Badge from '@/components/ui/Badge.vue'
import { ArrowLeft, ArrowRight, Cpu, FileText, Folder, ListPlus, LogIn, Plus, X } from '@lucide/vue'

const router = useRouter()
const route = useRoute()
const { tesEnabled, busy, createTask, getTask } = useTes()
const { apiBaseUrl, authToken, currentUser, myGroups } = useAruna()
const { realm } = useRealm()
// Desktop only: this machine can run the task itself.
const runTarget = useRunTarget()
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

// A container path ending in '/' is a folder capture, mapped to a wildcard
// output: only the files written directly in that folder are uploaded.
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

// Executor kind pin, carried as the aruna-engine.org/executor tag; it becomes
// the request's executor_constraint. Options come from what the realm's nodes
// advertise, with free text on a realm that has advertised nothing yet.
const executorConstraint = ref('')
const { executorKinds } = useRealmNodes()
const executorKindOptions = computed(() =>
  executorKinds.value.map((kind) => ({ value: kind, label: kind })),
)

const cpuCores = ref<string | number>('')
const ramGb = ref<string | number>('')
const diskGb = ref<string | number>('')
const preemptible = ref(false)

// Workspace handling for the run's scratch storage: an explicit, required
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
    executorConstraint.value = source.tags?.[TES_EXECUTOR_TAG] ?? ''

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
      const path = captureContainerPath(output)
      const key = isDirCapture(path) && !parsed.key.endsWith('/') ? `${parsed.key}/` : parsed.key
      return [{ path, bucket: parsed.bucket, key }]
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
  outputRows.value.map((row) => captureOutput(row.path, row.bucket, normalizedOutputKey(row.key))),
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
    tags: {
      [TES_GROUP_TAG]: groupId.value,
      ...(executorConstraint.value.trim() ? { [TES_EXECUTOR_TAG]: executorConstraint.value.trim() } : {}),
    },
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

// ── Advanced placement ───────────────────────────────────────────────────────
// Options the GA4GH task interface cannot carry. Setting any of them switches
// the submission to the native jobs API rather than silently dropping them.
const INPUT_MODE_OPTIONS = [
  { value: 'snapshot', label: 'Snapshot (default)' },
  { value: 'floating_reference', label: 'Follow current version' },
  { value: 'exact_reference', label: 'Pin an exact version' },
]
const COLLISION_OPTIONS = [
  { value: 'reject', label: 'Reject (default)' },
  { value: 'replace', label: 'Replace' },
  { value: 'keep_existing', label: 'Keep existing' },
]

const inputPlacements = ref<Record<string, InputPlacement>>({})
const collisionPolicy = ref<CollisionPolicyRequest>('reject')
const outputPrefixes = ref<string[]>([])

function placementFor(containerPath: string): InputPlacement {
  return inputPlacements.value[containerPath] ?? { mode: 'snapshot' }
}
function setInputMode(containerPath: string, mode: InputModeRequest) {
  const current = placementFor(containerPath)
  const next = { ...current, mode }
  // A version id only belongs to an exact pin; clearing it here keeps the
  // form from carrying a value the backend would refuse.
  if (mode !== 'exact_reference') delete next.versionId
  inputPlacements.value = { ...inputPlacements.value, [containerPath]: next }
}
function setInputVersion(containerPath: string, versionId: string) {
  inputPlacements.value = {
    ...inputPlacements.value,
    [containerPath]: { ...placementFor(containerPath), versionId },
  }
}
function addOutputPrefix() {
  outputPrefixes.value = [...outputPrefixes.value, '']
}
function removeOutputPrefix(index: number) {
  outputPrefixes.value = outputPrefixes.value.filter((_, position) => position !== index)
}

// The expanded TES inputs, which is what the native request is built from: a
// folder pick contributes one row per file, so each gets its own mode.
const advancedInputs = computed(() => task.value.inputs ?? [])
const hasFolderCapture = computed(() => outputRows.value.some((row) => isDirCapture(row.path)))

const placement = computed<NativePlacementOptions>(() => ({
  inputs: inputPlacements.value,
  collisionPolicy: collisionPolicy.value,
  outputPrefixes: outputPrefixes.value,
  workspace: workspaceMode.value
    ? {
        mode: workspaceMode.value,
        bucket: workspaceMode.value === 'existing' ? workspaceBucket.value.trim() : undefined,
      }
    : null,
}))

const nativeMapping = computed(() =>
  tesFormToExecutionRequest({
    groupId: groupId.value,
    task: task.value,
    executorConstraint: executorConstraint.value,
    placement: placement.value,
  }),
)
// Only a draft that cannot be expressed natively switches the section off; a
// half-filled native field is a fixable error, not a capability limit.
const nativeUnsupported = computed(() =>
  isNativeBlocked(nativeMapping.value) && nativeMapping.value.kind === 'unsupported'
    ? nativeMapping.value.blocked
    : null,
)
const nativeInvalid = computed(() =>
  isNativeBlocked(nativeMapping.value) && nativeMapping.value.kind === 'invalid'
    ? nativeMapping.value.blocked
    : null,
)
// A run on this computer is always the native request: the device accepts the
// target there, and the TES facade is the realm's surface.
const useNative = computed(
  () => runTarget.local.value || (!nativeUnsupported.value && nativeSubmitRequired(placement.value)),
)
const nativeDropped = computed(() => (useNative.value ? droppedNativeFields(task.value) : []))

// ── Submit ───────────────────────────────────────────────────────────────────
const submitError = ref<string | null>(null)
// Set instead of navigating away when the node dropped the workspace choice,
// so the hint is actually seen; the task itself was submitted fine.
const submittedWithoutWorkspace = ref<string | null>(null)
// Held across retries: a 503 may already have committed the submission, so the
// same key is what makes the retry a replay instead of a duplicate.
const idempotencyKey = ref('')
const submitRetryable = ref(false)

async function submitNative() {
  const mapping = tesFormToExecutionRequest({
    groupId: groupId.value,
    task: task.value,
    executorConstraint: executorConstraint.value,
    placement: placement.value,
    idempotencyKey: idempotencyKey.value,
  })
  if (isNativeBlocked(mapping)) {
    submitError.value = mapping.blocked
    return
  }
  const local = runTarget.localClient.value
  const created = await submitJob(
    local ? { ...mapping.request, target: 'local' } : mapping.request,
    local ?? { baseUrl: apiBaseUrl.value, token: authToken.value },
  )
  void router.push(
    local
      ? { name: 'run-detail', params: { jobId: created.job_id } }
      : { name: 'job-detail', params: { jobId: created.job_id } },
  )
}

async function submit() {
  submitError.value = null
  submitRetryable.value = false
  if (!idempotencyKey.value) idempotencyKey.value = createOperationId()
  try {
    if (useNative.value) {
      await submitNative()
      return
    }
    const created = await createTask(task.value)
    if (created.workspaceIgnored) {
      submittedWithoutWorkspace.value = created.id
      return
    }
    void router.push({ name: 'compute-task', params: { taskId: created.id } })
  } catch (err) {
    if (useNative.value) {
      submitRetryable.value = isSubmitRetryable(err)
      submitError.value = isNativeSubmitUnsupported(err)
        ? 'This node does not serve the native jobs API, so these advanced options cannot be submitted here.'
        : submitErrorMessage(err)
      return
    }
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
          <RunTargetPicker
            v-if="runTarget.available.value"
            v-model="runTarget.target.value"
            :compute="runTarget.compute.value"
            :realm-name="realm.shortName"
          />
          <div>
            <label class="text-xs font-medium text-foreground">Group</label>
            <GroupSelect v-model="groupId" :options="groupOptions" placeholder="Select a group" class="mt-1" />
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
                <p class="text-[11px] text-muted-foreground">A folder capture (path ending in /) uploads the files the task wrote directly in that folder. Nested subfolders are not captured.</p>
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
                  <p class="text-[11px] text-muted-foreground">A folder capture (container path ending in /) uploads the files the task wrote directly in that folder. Nested subfolders are not captured.</p>
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

            <div class="max-w-xs">
              <label class="text-xs font-medium text-foreground">Executor kind</label>
              <Select
                v-if="executorKindOptions.length"
                v-model="executorConstraint"
                :options="executorKindOptions"
                placeholder="Any kind the realm offers"
                class="mt-1"
              />
              <Input v-else v-model="executorConstraint" class="mt-1 font-mono" placeholder="docker" />
              <p class="mt-1 text-[11px] text-muted-foreground">
                {{
                  executorKindOptions.length
                    ? 'Restricts placement to one backend kind. Leave unset to let the planner choose.'
                    : 'No node has advertised an executor here yet, so this is free text. Leave it empty to let the planner choose.'
                }}
              </p>
            </div>
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
            <p class="text-[11px] text-muted-foreground">
              The GA4GH task interface carries no workspace field of its own, so a node may derive
              the workspace from its own deployment instead. The run detail reports the mode that
              was actually used.
            </p>
          </div>
          </div>

          <div class="space-y-3 border-t border-border pt-6">
            <div>
              <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Advanced placement</div>
              <p class="mt-1 text-[11px] text-muted-foreground">
                The GA4GH task interface cannot carry these. Setting any of them submits the run
                through Aruna's own jobs API instead, which is what makes them take effect.
              </p>
            </div>

            <p
              v-if="nativeUnsupported"
              class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300"
            >
              These options are unavailable for this draft: {{ nativeUnsupported }}
            </p>

            <fieldset v-else class="space-y-4" :disabled="!!nativeUnsupported">
              <div v-if="advancedInputs.length" class="space-y-2">
                <div class="text-xs font-medium text-foreground">Input versions</div>
                <div
                  v-for="input in advancedInputs"
                  :key="input.path"
                  class="surface-inline grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_12rem_minmax(0,1fr)]"
                >
                  <div class="min-w-0 truncate font-mono text-[11px] text-foreground" :title="input.path">
                    {{ input.path }}
                  </div>
                  <Select
                    :model-value="placementFor(input.path).mode"
                    :options="INPUT_MODE_OPTIONS"
                    aria-label="Input composition mode"
                    @update:model-value="setInputMode(input.path, String($event) as InputModeRequest)"
                  />
                  <Input
                    v-if="placementFor(input.path).mode === 'exact_reference'"
                    :model-value="placementFor(input.path).versionId ?? ''"
                    class="font-mono"
                    placeholder="Version id"
                    aria-label="Input version id"
                    @update:model-value="setInputVersion(input.path, String($event))"
                  />
                  <p v-else class="self-center text-[11px] text-muted-foreground">
                    {{
                      placementFor(input.path).mode === 'floating_reference'
                        ? 'Resolved when the run starts.'
                        : 'Copied as it is at submission.'
                    }}
                  </p>
                </div>
              </div>
              <p v-else class="text-[11px] text-muted-foreground">Add an input to choose how it is composed.</p>

              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label class="text-xs font-medium text-foreground">Collision policy</label>
                  <Select v-model="collisionPolicy" :options="COLLISION_OPTIONS" class="mt-1" />
                  <p class="mt-1 text-[11px] text-muted-foreground">
                    What happens when two inputs stage onto the same key. Only Reject refuses them.
                  </p>
                </div>
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-foreground">Output prefixes</label>
                  <p class="text-[11px] text-muted-foreground">
                    Workspace prefixes inventoried when the run finishes. Only objects this run
                    wrote are attributed to it.
                  </p>
                  <div
                    v-for="(prefix, index) in outputPrefixes"
                    :key="index"
                    class="grid grid-cols-[minmax(0,1fr)_1.75rem] gap-x-2"
                  >
                    <Input
                      :model-value="prefix"
                      class="font-mono"
                      placeholder="reports/"
                      aria-label="Output prefix"
                      @update:model-value="outputPrefixes[index] = String($event)"
                    />
                    <Button variant="ghost" size="icon-sm" class="self-center" aria-label="Remove output prefix" @click="removeOutputPrefix(index)">
                      <X class="h-4 w-4" />
                    </Button>
                  </div>
                  <Button variant="outline" size="sm" @click="addOutputPrefix">
                    <Plus class="h-3.5 w-3.5" /> Add prefix
                  </Button>
                </div>
              </div>

              <p v-if="nativeInvalid" class="text-[11px] text-destructive">{{ nativeInvalid }}</p>
            </fieldset>
          </div>
        </div>

        <!-- Step 3: Review -->
        <div v-else class="space-y-3">
          <div
            v-if="useNative"
            class="space-y-1 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground"
          >
            <p>
              This run is submitted through Aruna's native jobs API, because the GA4GH task
              interface cannot express the advanced placement options you set.
            </p>
            <p v-if="nativeDropped.length" class="text-[11px] text-muted-foreground">
              The native surface carries no {{ nativeDropped.join(', no ') }}, so that is not sent.
            </p>
          </div>
          <p
            v-if="hasFolderCapture"
            class="rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground"
          >
            Folder captures are submitted as a wildcard pattern. Only the files written directly in
            the captured folder are uploaded; nested subfolders are not.
          </p>
          <TaskJsonPreview title="TES task request" :task="task" />
          <details class="text-[11px] text-muted-foreground">
            <summary class="cursor-pointer">Technical details</summary>
            <code class="mt-1 block rounded bg-muted px-2 py-1">{{ useNative ? 'POST /jobs/' : 'POST /ga4gh/tes/v1/tasks' }}</code>
          </details>
          <p v-if="submitError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {{ submitError }}
            <span v-if="submitRetryable" class="mt-1 block text-[11px]">
              Submitting again reuses the same idempotency key, so a request that already committed
              is replayed rather than duplicated.
            </span>
          </p>
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
        <Button v-else size="sm" :disabled="busy || !groupId || !executorsValid || !outputsValid || !workspaceValid || !cpuCoresValid || !ramGbValid || !diskGbValid || !!nativeInvalid || !!submittedWithoutWorkspace" @click="submit"><ListPlus class="h-4 w-4" /> {{ useNative ? 'Submit job' : 'Submit task' }}</Button>
      </div>
    </div>

    <!-- Input picker for the filesystem tree's per-folder add-input action;
         the Table view's TesInputsEditor keeps its own dialog. -->
    <TesDataRefDialog v-model:open="inputDialogOpen" mode="input" :mount-default="inputMountDefault" @add="addInputEntry" />
  </div>
</template>
