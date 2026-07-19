<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import WizardSteps from '@/components/onboarding/WizardSteps.vue'
import CodeSnippet from '@/components/onboarding/CodeSnippet.vue'
import TesDataRefDialog from '@/components/compute/TesDataRefDialog.vue'
import CreateCredentialDialog from '@/components/data/CreateCredentialDialog.vue'
import QuickRunResult from '@/components/compute/QuickRunResult.vue'
import { asyncChunkError } from '@/lib/chunk-recovery'
import { useTes, isTesUnsupported } from '@/composables/useTes'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useS3 } from '@/composables/useS3'
import {
  TES_GROUP_TAG,
  TES_IDEMPOTENCY_TAG,
  pruneTesTask,
  type TesInput,
  type TesOutput,
  type TesTask,
} from '@/lib/tes'
import { isWorkspaceBucket } from '@/lib/workspaces'
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  CornerDownRight,
  Cpu,
  KeyRound,
  ListPlus,
  LogIn,
  Plus,
  X,
} from '@lucide/vue'

// CodeMirror lands on its own async chunk, mounted only at the script step.
const ScriptEditor = defineAsyncComponent({
  loader: () => import('@/components/compute/ScriptEditor.vue'),
  onError: asyncChunkError,
})

const router = useRouter()
const route = useRoute()
const { tesEnabled, busy, createTask } = useTes()
const { currentUser, myGroups } = useAruna()
const { signIn, stage } = useAuth()
const s3 = useS3()

const signingIn = computed(() => stage.value === 'redirecting')
function startSignIn() {
  void signIn({ redirectTo: '/app/compute/quick' })
}
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// ── Runtimes (tagged upstream images) ────────────────────────────────────────
interface Runtime {
  id: 'python-uv' | 'deno'
  label: string
  hint: string
  image: string
  /** Argv prefix; the staged script path is appended as the last argument. */
  command: string[]
  /** Extra executor environment (e.g. cache dirs inside the writable /work). */
  env?: Record<string, string>
  file: string
  lang: 'python' | 'javascript' | 'text'
  contentType: string
  template: string
}
const RUNTIMES: Runtime[] = [
  {
    id: 'python-uv',
    label: 'Python',
    hint: 'PyPI dependencies managed by uv.',
    image: 'ghcr.io/astral-sh/uv:python3.13-bookworm-slim',
    command: ['uv', 'run', '--no-project'],
    env: { UV_CACHE_DIR: '/work/.uv-cache' },
    file: 'script.py',
    lang: 'python',
    contentType: 'text/x-python',
    template: 'print("hello from aruna")\n',
  },
  {
    id: 'deno',
    label: 'JavaScript / TypeScript',
    hint: 'npm dependencies resolved by Deno.',
    image: 'denoland/deno:alpine-2.9.3',
    command: ['deno', 'run', '-A'],
    env: { DENO_DIR: '/work/.deno-cache' },
    file: 'script.ts',
    lang: 'javascript',
    contentType: 'text/typescript',
    template: 'console.log("hello from aruna");\n',
  },
]
const TES_NETWORK_TAG = 'aruna-engine.org/network'

// One combined "Script & data" step: the selected data references are listed
// with their resolved /work/in|out mount paths right next to the editor, so
// container paths are visible while the script is written.
const WIZARD_STEPS = ['Runtime', 'Script & data', 'Review']
const REVIEW_STEP = 2
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
const runtimeId = ref<Runtime['id']>('python-uv')
const runtime = computed(() => RUNTIMES.find((r) => r.id === runtimeId.value) as Runtime)
const script = ref(RUNTIMES[0].template)
const editorTab = ref('work')
const dependencies = ref<string[]>([])
const dependencyDraft = ref('')
const taskName = ref('quick-run')
const groupId = ref('')
const inputs = ref<{ url: string; name: string }[]>([])
// The script needs an S3 home before the run starts; outputs pick their own
// bucket and key per row.
const stagingBucket = ref('')
const outputRows = ref<{ bucket: string; path: string }[]>([])
const inputDialogOpen = ref(false)
const credentialDialogOpen = ref(false)

// A fresh id per submit attempt keys the uploaded script and the idempotency tag.
const runId = ref(crypto.randomUUID())

// Swap the template only while the script is still the previous runtime default.
watch(runtimeId, (next, prev) => {
  const prevRt = RUNTIMES.find((r) => r.id === prev)
  if (prevRt && script.value === prevRt.template) {
    script.value = (RUNTIMES.find((r) => r.id === next) as Runtime).template
  }
  dependencies.value = []
  dependencyDraft.value = ''
})
watch(step, (s) => {
  if (s === REVIEW_STEP) runId.value = crypto.randomUUID()
})

// ── Derived task ─────────────────────────────────────────────────────────────
const groupOptions = computed(() => myGroups.value.map((g) => ({ value: g.id, label: g.name })))
const bucketOptions = computed(() => buckets.value.map((b) => ({ value: b, label: b })))

const scriptContainerPath = computed(() => `/work/${runtime.value.file}`)
const scriptKey = computed(() => `.aruna/scripts/${runId.value}/${runtime.value.file}`)
const scriptUrl = computed(() => `s3://${stagingBucket.value.trim()}/${scriptKey.value}`)
const dependencyConfigPath = '/work/deno.json'
const dependencyConfigKey = computed(() => `.aruna/scripts/${runId.value}/deno.json`)
const dependencyConfigUrl = computed(
  () => `s3://${stagingBucket.value.trim()}/${dependencyConfigKey.value}`,
)

function npmPackageName(spec: string): string {
  if (!spec.startsWith('@')) return spec.split('@')[0]
  const slash = spec.indexOf('/')
  const version = spec.indexOf('@', slash + 1)
  return version === -1 ? spec : spec.slice(0, version)
}

const dependencyConfig = computed(() => {
  if (runtimeId.value !== 'deno' || !dependencies.value.length) return null
  return JSON.stringify(
    {
      imports: Object.fromEntries(
        dependencies.value.map((dependency) => [npmPackageName(dependency), `npm:${dependency}`]),
      ),
    },
    null,
    2,
  )
})
const executorCommand = computed(() => {
  if (runtimeId.value === 'python-uv') {
    return [
      ...runtime.value.command,
      ...dependencies.value.flatMap((dependency) => ['--with', dependency]),
    ]
  }
  return dependencyConfig.value
    ? [...runtime.value.command, `--config=${dependencyConfigPath}`]
    : runtime.value.command
})
const commandPreview = computed(() => `${executorCommand.value.join(' ')} ${scriptContainerPath.value}`)

const scriptInput = computed<TesInput>(() => ({
  name: runtime.value.file,
  description: 'Quick-run script uploaded by the portal',
  url: scriptUrl.value,
  path: scriptContainerPath.value,
  type: 'FILE',
}))
const dependencyInput = computed<TesInput | null>(() =>
  dependencyConfig.value
    ? {
        name: 'deno.json',
        description: 'Quick-run dependency map generated by the portal',
        url: dependencyConfigUrl.value,
        path: dependencyConfigPath,
        type: 'FILE',
      }
    : null,
)
const dataInputs = computed<TesInput[]>(() =>
  inputs.value.map((i) => ({ name: i.name, url: i.url, path: `/work/in/${i.name}`, type: 'FILE' })),
)

function normalizedOutputKey(path: string): string {
  return path.trim().replace(/^\/+/, '')
}
function outputBasename(path: string): string {
  return normalizedOutputKey(path).split('/').filter(Boolean).pop() ?? ''
}
const declaredOutputs = computed<TesOutput[]>(() =>
  outputRows.value
    .filter((row) => row.bucket.trim() && outputBasename(row.path))
    .map((row) => ({
      url: `s3://${row.bucket.trim()}/${normalizedOutputKey(row.path)}`,
      path: `/work/out/${outputBasename(row.path)}`,
      type: 'FILE',
    })),
)

const task = computed<TesTask>(() =>
  pruneTesTask({
    name: taskName.value,
    inputs: [scriptInput.value, ...(dependencyInput.value ? [dependencyInput.value] : []), ...dataInputs.value],
    outputs: declaredOutputs.value,
    executors: [
      {
        image: runtime.value.image,
        command: [...executorCommand.value, scriptContainerPath.value],
        workdir: '/work',
        env: runtime.value.env,
      },
    ],
    tags: {
      [TES_GROUP_TAG]: groupId.value,
      [TES_IDEMPOTENCY_TAG]: runId.value,
      ...(dependencies.value.length ? { [TES_NETWORK_TAG]: 'open' } : {}),
    },
  }),
)

// ── Dependencies ─────────────────────────────────────────────────────────────
const dependencyError = computed(() => {
  const dependency = dependencyDraft.value.trim()
  if (!dependency) return null
  if (dependencies.value.some((entry) => entry.toLowerCase() === dependency.toLowerCase())) {
    return 'This dependency is already in the list.'
  }
  if (runtimeId.value === 'python-uv' && dependency.startsWith('-')) {
    return 'Use a PyPI requirement such as requests>=2.'
  }
  if (
    runtimeId.value === 'deno' &&
    !/^(?:@[a-z0-9._-]+\/[a-z0-9._-]+|[a-z0-9._-]+)(?:@[^\s]+)?$/i.test(dependency)
  ) {
    return 'Use an npm package such as chalk or @scope/package@1.'
  }
  if (
    runtimeId.value === 'deno' &&
    dependencies.value.some(
      (entry) => npmPackageName(entry).toLowerCase() === npmPackageName(dependency).toLowerCase(),
    )
  ) {
    return 'This npm package already has a selected version.'
  }
  return null
})

function addDependency() {
  const dependency = dependencyDraft.value.trim()
  if (!dependency || dependencyError.value) return
  dependencies.value.push(dependency)
  dependencyDraft.value = ''
}

function removeDependency(index: number) {
  dependencies.value.splice(index, 1)
}

// ── Inputs / outputs editing ─────────────────────────────────────────────────
function uniqueInputName(base: string): string {
  const taken = new Set(inputs.value.map((i) => i.name))
  if (!taken.has(base)) return base
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  const ext = dot > 0 ? base.slice(dot) : ''
  let n = 2
  while (taken.has(`${stem}-${n}${ext}`)) n++
  return `${stem}-${n}${ext}`
}
function addInput(entry: { url: string; path: string; name?: string }) {
  const base = (entry.name || entry.url.split('/').filter(Boolean).pop() || 'input').trim()
  inputs.value.push({ url: entry.url, name: uniqueInputName(base) })
}
function removeInput(i: number) {
  inputs.value.splice(i, 1)
}
function addOutput() {
  outputRows.value.push({
    bucket: outputRows.value.at(-1)?.bucket || stagingBucket.value.trim() || buckets.value[0] || '',
    path: 'quickruns/result.txt',
  })
}
function outputDestination(row: { bucket: string; path: string }): string {
  return `s3://${row.bucket.trim() || '<bucket>'}/${normalizedOutputKey(row.path) || '<path>'}`
}
function removeOutput(i: number) {
  outputRows.value.splice(i, 1)
}

// ── Buckets ──────────────────────────────────────────────────────────────────
const buckets = ref<string[]>([])
const bucketsLoading = ref(false)
const bucketsLoaded = ref(false)
async function loadBuckets() {
  if (!s3.hasActiveKey.value || !s3.endpoint.value) return
  bucketsLoading.value = true
  try {
    // Per-run ws-… scratch buckets are system-managed and never run targets.
    buckets.value = (await s3.listBuckets()).map((b) => b.name).filter((name) => !isWorkspaceBucket(name))
    bucketsLoaded.value = true
    if (!stagingBucket.value && buckets.value.length) stagingBucket.value = buckets.value[0]
  } catch {
    buckets.value = []
    bucketsLoaded.value = false
  } finally {
    bucketsLoading.value = false
  }
}

// Runs only write into existing buckets; once the listing is known, a typed
// name must match it (with a failed listing only non-empty is enforceable).
function knownBucket(name: string): boolean {
  if (!name) return false
  return !bucketsLoaded.value || buckets.value.includes(name)
}
const stagingBucketValid = computed(() => knownBucket(stagingBucket.value.trim()))

function initDefaults() {
  if (!groupId.value && myGroups.value.length) groupId.value = myGroups.value[0].id
  void loadBuckets()
}
onMounted(initDefaults)
watch([currentUser, () => s3.hasActiveKey.value, myGroups], initDefaults)

// ── Validity ─────────────────────────────────────────────────────────────────
const outputsValid = computed(() => {
  const rows = outputRows.value
  const validRow = (row: { bucket: string; path: string }) => {
    if (!knownBucket(row.bucket.trim())) return false
    const key = normalizedOutputKey(row.path)
    if (!key || key.endsWith('/')) return false
    return key.split('/').every((segment) => segment && segment !== '.' && segment !== '..')
  }
  // The container writes flat files into /work/out/, and the backend rejects
  // duplicate paths and destinations; block collisions on both sides here.
  const basenames = rows.map((row) => outputBasename(row.path))
  const destinations = rows.map((row) => `${row.bucket.trim()}/${normalizedOutputKey(row.path)}`)
  return (
    rows.every(validRow) &&
    new Set(basenames).size === basenames.length &&
    new Set(destinations).size === destinations.length
  )
})
const dataReady = computed(
  () => !!s3.endpoint.value && s3.hasActiveKey.value && groupId.value.length > 0 && stagingBucketValid.value,
)
const canContinue = computed(() => {
  switch (step.value) {
    case 1:
      return script.value.trim().length > 0 && dataReady.value && outputsValid.value
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

// ── Submit ───────────────────────────────────────────────────────────────────
const submitting = ref(false)
const submitError = ref<string | null>(null)
const submittedTaskId = ref<string | null>(null)
// Snapshot of the declared destinations for the result view.
const submittedOutputs = ref<{ bucket: string; key: string; path: string }[]>([])

async function submit() {
  submitError.value = null
  submitting.value = true
  try {
    const uploads = [
      s3.putTextObject(stagingBucket.value.trim(), scriptKey.value, script.value, runtime.value.contentType),
    ]
    if (dependencyConfig.value) {
      uploads.push(
        s3.putTextObject(
          stagingBucket.value.trim(),
          dependencyConfigKey.value,
          dependencyConfig.value,
          'application/json',
        ),
      )
    }
    await Promise.all(uploads)
    const created = await createTask(task.value)
    submittedOutputs.value = outputRows.value.map((row) => ({
      bucket: row.bucket.trim(),
      key: normalizedOutputKey(row.path),
      path: `/work/out/${outputBasename(row.path)}`,
    }))
    submittedTaskId.value = created.id
  } catch (err) {
    submitError.value = isTesUnsupported(err)
      ? `This node does not expose the TES endpoint. ${errorMessage(err)}`
      : errorMessage(err)
  } finally {
    submitting.value = false
  }
}
function runAnother() {
  submittedTaskId.value = null
  submitError.value = null
  submittedOutputs.value = []
  goStep(0)
  runId.value = crypto.randomUUID()
}
</script>

<template>
  <div>
    <PageHeader title="Quick run" description="Run a Python or JavaScript script with optional package dependencies without writing a TES task by hand.">
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
        <h2 class="mt-3 font-display text-base font-semibold text-aruna-navy">Sign in to run a script</h2>
        <p class="mt-1.5 text-sm text-muted-foreground">Submitting GA4GH TES tasks is an authenticated operation.</p>
        <Button class="mt-4" size="sm" :disabled="signingIn" @click="startSignIn"><LogIn class="h-3.5 w-3.5" /> Sign in</Button>
      </section>
    </div>

    <!-- Result -->
    <div v-else-if="submittedTaskId" class="container space-y-6 py-8">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-display text-base font-semibold text-aruna-navy">Run submitted</h2>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" @click="router.push({ name: 'compute' })">
            <ArrowLeft class="h-3.5 w-3.5" /> Back to Compute
          </Button>
          <Button size="sm" title="Starts the wizard again with this run's script and data settings" @click="runAnother">
            <ListPlus class="h-4 w-4" /> Run again
          </Button>
        </div>
      </div>
      <QuickRunResult :task-id="submittedTaskId" :outputs="submittedOutputs" />
    </div>

    <!-- Wizard -->
    <div v-else class="container space-y-6 py-8">
      <WizardSteps :steps="WIZARD_STEPS" :current="step" />

      <section class="surface space-y-5 p-6">
        <!-- Step 1: Runtime -->
        <div v-if="step === 0" class="space-y-3">
          <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Runtime</div>
          <div class="grid gap-3 sm:grid-cols-2">
            <button
              v-for="rt in RUNTIMES"
              :key="rt.id"
              type="button"
              class="rounded-lg border p-4 text-left transition-colors"
              :class="runtimeId === rt.id ? 'border-primary bg-primary/5 ring-1 ring-primary/40' : 'border-border hover:bg-muted/40'"
              @click="runtimeId = rt.id"
            >
              <div class="text-sm font-semibold text-foreground">{{ rt.label }}</div>
              <div class="mt-0.5 text-[11px] text-muted-foreground">{{ rt.hint }}</div>
              <div class="mt-1 truncate font-mono text-[11px] text-muted-foreground" :title="rt.image">{{ rt.image }}</div>
            </button>
          </div>
          <p class="text-[11px] text-muted-foreground">
            The script runs as <code class="rounded bg-muted px-1 font-mono">{{ commandPreview }}</code> in a fresh container.
          </p>
        </div>

        <!-- Step 2: Script & data — mounts sit next to the editor so container
             paths are visible while the script is written. -->
        <div v-else-if="step === 1" class="space-y-5">
          <!-- Credentials gate -->
          <div v-if="!s3.endpoint.value" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            This node does not advertise an S3 endpoint, so the portal cannot stage the script. Use the full task form to reference an existing script.
          </div>
          <div v-else-if="!s3.hasActiveKey.value" class="space-y-2 rounded-md border border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
            <p class="flex items-center gap-2 font-medium text-foreground"><KeyRound class="h-3.5 w-3.5" /> S3 credentials are required to stage the script and browse data.</p>
            <Button variant="outline" size="sm" @click="credentialDialogOpen = true"><Plus class="size-3.5" /> Create credentials</Button>
          </div>

          <div v-if="s3.endpoint.value && s3.hasActiveKey.value" class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="text-xs font-medium text-foreground">Group</label>
              <Select v-model="groupId" :options="groupOptions" placeholder="Select a group" class="mt-1" />
              <p class="mt-1 text-[11px] text-muted-foreground">Owns the run and receives its Process Run crate.</p>
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Script bucket <span class="text-destructive">*</span></label>
              <Select v-if="bucketOptions.length" v-model="stagingBucket" :options="bucketOptions" placeholder="Select a bucket" class="mt-1" />
              <Input
                v-else
                v-model="stagingBucket"
                class="mt-1 font-mono"
                :placeholder="bucketsLoading ? 'Loading buckets…' : 'my-results'"
                :invalid="stagingBucket.trim() && !stagingBucketValid ? 'error' : undefined"
              />
              <p v-if="stagingBucket.trim() && !stagingBucketValid" class="mt-1 text-[11px] text-destructive">
                This bucket does not exist. The script can only be staged into one of your buckets.
              </p>
              <p v-else-if="bucketsLoaded && !buckets.length" class="mt-1 text-[11px] text-destructive">
                You have no buckets yet. Create one in Data first.
              </p>
              <p v-else class="mt-1 text-[11px] text-muted-foreground">
                The script is uploaded under <code class="rounded bg-muted px-1 font-mono">.aruna/scripts/</code> here before the run.
              </p>
            </div>
          </div>

          <Tabs v-model="editorTab">
            <TabsList>
              <TabsTrigger value="work">Script &amp; data</TabsTrigger>
              <TabsTrigger value="dependencies">Dependencies ({{ dependencies.length }})</TabsTrigger>
            </TabsList>

            <TabsContent value="work" class="mt-4">
              <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
            <!-- Script editor -->
            <div class="min-w-0 space-y-2">
              <div class="flex items-center justify-between">
                <label class="text-xs font-medium text-foreground">Script <span class="font-mono text-muted-foreground">({{ runtime.file }})</span></label>
                <Button variant="ghost" size="sm" @click="script = runtime.template">Reset to template</Button>
              </div>
              <Suspense>
                <ScriptEditor v-model="script" :language="runtime.lang" />
                <template #fallback>
                  <div class="grid h-40 place-items-center rounded-md border border-input bg-field text-xs text-muted-foreground">Loading editor…</div>
                </template>
              </Suspense>
              <p v-if="!script.trim()" class="text-[11px] text-destructive">The script cannot be empty.</p>
              <p class="text-[11px] text-muted-foreground">
                Runs as <code class="rounded bg-muted px-1 font-mono">{{ commandPreview }}</code> in a fresh container.
              </p>
            </div>

            <!-- Data references with their resolved container mount paths -->
            <div class="min-w-0 space-y-4">
              <section class="surface-muted space-y-2.5 p-3.5">
                <div>
                  <div class="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <ArrowDownToLine class="h-3.5 w-3.5 text-primary" /> Input data
                  </div>
                  <p class="mt-1 text-[11px] text-muted-foreground">
                    Staged read-only under <code class="rounded bg-muted px-1 font-mono">/work/in/</code> before the script starts.
                  </p>
                </div>
                <div v-if="inputs.length" class="space-y-1.5">
                  <div v-for="(input, i) in inputs" :key="i" class="surface-inline flex items-start gap-2 p-2 text-xs">
                    <div class="min-w-0 flex-1 font-mono">
                      <div class="truncate text-foreground" :title="`/work/in/${input.name}`">/work/in/{{ input.name }}</div>
                      <div class="mt-0.5 truncate text-[10px] text-muted-foreground" :title="input.url">{{ input.url }}</div>
                    </div>
                    <Button variant="ghost" size="icon-sm" class="h-5 w-5 shrink-0" aria-label="Remove input" @click="removeInput(i)"><X class="size-3" /></Button>
                  </div>
                </div>
                <p v-else class="text-[11px] text-muted-foreground">No input data. The script starts with an empty <code class="rounded bg-muted px-1 font-mono">/work/in/</code>.</p>
                <Button variant="outline" size="sm" @click="inputDialogOpen = true"><ListPlus class="size-3.5" /> Add input</Button>
              </section>

              <section class="surface-muted space-y-2.5 p-3.5">
                <div>
                  <div class="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <ArrowUpFromLine class="h-3.5 w-3.5 text-primary" /> Output data
                  </div>
                  <p class="mt-1 text-[11px] text-muted-foreground">
                    Files the script writes to <code class="rounded bg-muted px-1 font-mono">/work/out/</code> are uploaded after the run. stdout and stderr are always captured.
                  </p>
                </div>
                <div v-if="outputRows.length" class="space-y-1.5">
                  <div v-for="(row, i) in outputRows" :key="i" class="surface-inline space-y-1 p-2 text-xs">
                    <div class="flex items-center gap-1.5">
                      <Select
                        v-if="bucketOptions.length"
                        v-model="row.bucket"
                        :options="bucketOptions"
                        placeholder="Bucket"
                        class="h-7 w-32 shrink-0 text-xs"
                      />
                      <Input v-else v-model="row.bucket" class="h-7 w-32 shrink-0 font-mono text-xs" placeholder="bucket" />
                      <Input v-model="row.path" class="h-7 font-mono text-xs" placeholder="results/output.txt" />
                      <Button variant="ghost" size="icon-sm" class="h-5 w-5 shrink-0" aria-label="Remove output" @click="removeOutput(i)"><X class="size-3" /></Button>
                    </div>
                    <div class="flex min-w-0 items-center gap-1 font-mono text-[10px] text-muted-foreground">
                      <CornerDownRight class="h-3 w-3 shrink-0" />
                      <span class="truncate" :title="`/work/out/${outputBasename(row.path) || '<file>'} uploads to ${outputDestination(row)}`">
                        /work/out/{{ outputBasename(row.path) || '&lt;file&gt;' }} → {{ outputDestination(row) }}
                      </span>
                    </div>
                  </div>
                </div>
                <p v-else class="text-[11px] text-muted-foreground">No output files declared. Only stdout and stderr are captured.</p>
                <p v-if="!outputsValid" class="text-[11px] text-destructive">
                  Each output needs one of your buckets and a canonical key; container file names and destinations must be unique.
                </p>
                <Button variant="outline" size="sm" @click="addOutput"><Plus class="size-3.5" /> Add output file</Button>
              </section>
            </div>
              </div>
            </TabsContent>

            <TabsContent value="dependencies" class="mt-4 space-y-4">
              <div class="max-w-2xl space-y-2">
                <label class="text-xs font-medium text-foreground">
                  {{ runtimeId === 'python-uv' ? 'PyPI requirement' : 'npm package' }}
                </label>
                <div class="flex items-center gap-2">
                  <Input
                    v-model="dependencyDraft"
                    class="font-mono text-xs"
                    :placeholder="runtimeId === 'python-uv' ? 'requests>=2' : 'chalk@5'"
                    :invalid="dependencyError ? 'error' : undefined"
                    @keyup.enter.prevent="addDependency"
                  />
                  <Button size="sm" :disabled="!dependencyDraft.trim() || !!dependencyError" @click="addDependency">
                    <Plus class="size-3.5" /> Add
                  </Button>
                </div>
                <p v-if="dependencyError" class="text-[11px] text-destructive">{{ dependencyError }}</p>
                <p v-else class="text-[11px] text-muted-foreground">
                  <template v-if="runtimeId === 'python-uv'">
                    Each requirement is passed directly to <code class="rounded bg-muted px-1 font-mono">uv run --with</code>.
                  </template>
                  <template v-else>
                    Packages are mapped to bare imports, for example <code class="rounded bg-muted px-1 font-mono">import chalk from "chalk"</code>.
                  </template>
                </p>
              </div>

              <ul v-if="dependencies.length" class="max-w-2xl space-y-2">
                <li
                  v-for="(dependency, index) in dependencies"
                  :key="dependency"
                  class="surface-inline flex items-center gap-2 px-3 py-2 text-xs"
                >
                  <code class="min-w-0 flex-1 truncate font-mono text-foreground">{{ dependency }}</code>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    :aria-label="`Remove ${dependency}`"
                    @click="removeDependency(index)"
                  >
                    <X class="size-3" />
                  </Button>
                </li>
              </ul>
              <p v-else class="text-xs text-muted-foreground">No extra dependencies. Standard library modules remain available.</p>
            </TabsContent>
          </Tabs>

        </div>

        <!-- Step 4: Review — mirrors the data step's in/out structure. -->
        <div v-else class="space-y-4">
          <div class="grid gap-4 text-xs lg:grid-cols-2">
            <section class="surface-muted space-y-2 p-4">
              <div class="flex items-center gap-1.5 font-semibold text-foreground">
                <ArrowDownToLine class="h-3.5 w-3.5 text-primary" /> Into the container
              </div>
              <ul class="space-y-1.5 font-mono text-[11px]">
                <li>
                  <div class="truncate text-foreground" :title="scriptUrl">{{ runtime.file }} <span class="font-sans text-muted-foreground">(uploaded on submit)</span></div>
                  <div class="flex items-center gap-1 text-muted-foreground"><CornerDownRight class="h-3 w-3 shrink-0" /> {{ scriptContainerPath }}</div>
                </li>
                <li v-if="dependencyInput">
                  <div class="truncate text-foreground" :title="dependencyConfigUrl">deno.json <span class="font-sans text-muted-foreground">(generated from dependencies)</span></div>
                  <div class="flex items-center gap-1 text-muted-foreground"><CornerDownRight class="h-3 w-3 shrink-0" /> {{ dependencyConfigPath }}</div>
                </li>
                <li v-for="(input, i) in inputs" :key="i">
                  <div class="truncate text-foreground" :title="input.url">{{ input.url }}</div>
                  <div class="flex items-center gap-1 text-muted-foreground"><CornerDownRight class="h-3 w-3 shrink-0" /> /work/in/{{ input.name }}</div>
                </li>
              </ul>
            </section>
            <section class="surface-muted space-y-2 p-4">
              <div class="flex items-center gap-1.5 font-semibold text-foreground">
                <ArrowUpFromLine class="h-3.5 w-3.5 text-primary" /> Out of the container
              </div>
              <ul v-if="declaredOutputs.length" class="space-y-1.5 font-mono text-[11px]">
                <li v-for="output in declaredOutputs" :key="output.path">
                  <div class="text-foreground">{{ output.path }}</div>
                  <div class="flex min-w-0 items-center gap-1 text-muted-foreground">
                    <CornerDownRight class="h-3 w-3 shrink-0" /> <span class="truncate" :title="output.url">{{ output.url }}</span>
                  </div>
                </li>
              </ul>
              <p v-else class="text-[11px] text-muted-foreground">No declared output files.</p>
              <p class="text-[11px] text-muted-foreground">stdout and stderr are always captured.</p>
            </section>
          </div>
          <p class="text-xs text-muted-foreground">
            Runs as <code class="rounded bg-muted px-1 font-mono">{{ commandPreview }}</code> in
            <code class="rounded bg-muted px-1 font-mono">{{ runtime.image }}</code>; the script is uploaded on submit (the backend does not accept inline script content).
          </p>
          <CodeSnippet title="TES task (POST /ga4gh/tes/v1/tasks)" :code="JSON.stringify(task, null, 2)" />
          <p v-if="submitError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ submitError }}</p>
        </div>
      </section>

      <div class="flex items-center justify-between">
        <Button variant="outline" size="sm" @click="back">
          <ArrowLeft v-if="step === 0" class="h-3.5 w-3.5" /> {{ step === 0 ? 'Back to Compute' : 'Back' }}
        </Button>
        <Button v-if="step < WIZARD_STEPS.length - 1" size="sm" :disabled="!canContinue" @click="next">Continue</Button>
        <Button v-else size="sm" :disabled="busy || submitting || !dataReady || !outputsValid" @click="submit">
          <ListPlus class="h-4 w-4" /> {{ submitting ? 'Submitting…' : 'Submit run' }}
        </Button>
      </div>
    </div>

    <TesDataRefDialog v-model:open="inputDialogOpen" mode="input" @add="addInput" />
    <CreateCredentialDialog v-model:open="credentialDialogOpen" />
  </div>
</template>
