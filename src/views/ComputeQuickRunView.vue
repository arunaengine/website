<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
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

// ── Runtimes (pinned slim images) ────────────────────────────────────────────
interface Runtime {
  id: 'python' | 'node' | 'bash'
  label: string
  image: string
  interpreter: string
  file: string
  lang: 'python' | 'javascript' | 'text'
  contentType: string
  template: string
}
const RUNTIMES: Runtime[] = [
  {
    id: 'python',
    label: 'Python',
    image: 'python:3.12-slim',
    interpreter: 'python',
    file: 'script.py',
    lang: 'python',
    contentType: 'text/x-python',
    template: 'print("hello from aruna")\n',
  },
  {
    id: 'node',
    label: 'Node.js',
    image: 'node:22-slim',
    interpreter: 'node',
    file: 'script.js',
    lang: 'javascript',
    contentType: 'text/javascript',
    template: 'console.log("hello from aruna")\n',
  },
  {
    id: 'bash',
    label: 'Bash',
    image: 'bash:5.2',
    interpreter: 'bash',
    file: 'script.sh',
    lang: 'text',
    contentType: 'text/x-shellscript',
    template: 'echo "hello from aruna"\n',
  },
]

const WIZARD_STEPS = ['Runtime', 'Script', 'Data', 'Review']
const REVIEW_STEP = 3
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
const runtimeId = ref<Runtime['id']>('python')
const runtime = computed(() => RUNTIMES.find((r) => r.id === runtimeId.value) as Runtime)
const script = ref(RUNTIMES[0].template)
const taskName = ref('quick-run')
const groupId = ref('')
const inputs = ref<{ url: string; name: string }[]>([])
const outputBucket = ref('')
const outputPrefix = ref('quickruns/')
const outputFiles = ref<{ name: string }[]>([])
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
})
watch(step, (s) => {
  if (s === REVIEW_STEP) runId.value = crypto.randomUUID()
})

// ── Derived task ─────────────────────────────────────────────────────────────
const groupOptions = computed(() => myGroups.value.map((g) => ({ value: g.id, label: g.name })))
const bucketOptions = computed(() => buckets.value.map((b) => ({ value: b, label: b })))

const normalizedPrefix = computed(() => {
  const p = outputPrefix.value.trim().replace(/^\/+/, '')
  return p && !p.endsWith('/') ? `${p}/` : p
})
const scriptContainerPath = computed(() => `/work/${runtime.value.file}`)
const scriptKey = computed(() => `${normalizedPrefix.value}.aruna/scripts/${runId.value}/${runtime.value.file}`)
const scriptUrl = computed(() => `s3://${outputBucket.value.trim()}/${scriptKey.value}`)

const scriptInput = computed<TesInput>(() => ({
  name: runtime.value.file,
  description: 'Quick-run script uploaded by the portal',
  url: scriptUrl.value,
  path: scriptContainerPath.value,
  type: 'FILE',
}))
const dataInputs = computed<TesInput[]>(() =>
  inputs.value.map((i) => ({ name: i.name, url: i.url, path: `/work/in/${i.name}`, type: 'FILE' })),
)
const declaredOutputs = computed<TesOutput[]>(() =>
  outputFiles.value
    .map((f) => f.name.trim())
    .filter(Boolean)
    .map((name) => ({
      url: `s3://${outputBucket.value.trim()}/${normalizedPrefix.value}${name}`,
      path: `/work/out/${name}`,
      type: 'FILE',
    })),
)

const task = computed<TesTask>(() =>
  pruneTesTask({
    name: taskName.value,
    inputs: [scriptInput.value, ...dataInputs.value],
    outputs: declaredOutputs.value,
    executors: [
      { image: runtime.value.image, command: [runtime.value.interpreter, scriptContainerPath.value], workdir: '/work' },
    ],
    tags: { [TES_GROUP_TAG]: groupId.value, [TES_IDEMPOTENCY_TAG]: runId.value },
  }),
)

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
  outputFiles.value.push({ name: 'result.txt' })
}
function outputDestination(name: string): string {
  return `s3://${outputBucket.value.trim() || '<bucket>'}/${normalizedPrefix.value}${name.trim() || '<name>'}`
}
function removeOutput(i: number) {
  outputFiles.value.splice(i, 1)
}

// ── Buckets ──────────────────────────────────────────────────────────────────
const buckets = ref<string[]>([])
const bucketsLoading = ref(false)
const bucketsLoaded = ref(false)
async function loadBuckets() {
  if (!s3.hasActiveKey.value || !s3.endpoint.value) return
  bucketsLoading.value = true
  try {
    buckets.value = (await s3.listBuckets()).map((b) => b.name)
    bucketsLoaded.value = true
    if (!outputBucket.value && buckets.value.length) outputBucket.value = buckets.value[0]
  } catch {
    buckets.value = []
    bucketsLoaded.value = false
  } finally {
    bucketsLoading.value = false
  }
}

// Runs only write into existing buckets; once the listing is known, a typed
// name must match it (with a failed listing only non-empty is enforceable).
const bucketValid = computed(() => {
  const name = outputBucket.value.trim()
  if (!name) return false
  return !bucketsLoaded.value || buckets.value.includes(name)
})

function initDefaults() {
  if (!groupId.value && myGroups.value.length) groupId.value = myGroups.value[0].id
  void loadBuckets()
}
onMounted(initDefaults)
watch([currentUser, () => s3.hasActiveKey.value, myGroups], initDefaults)

// ── Validity ─────────────────────────────────────────────────────────────────
const outputsValid = computed(() => {
  // The backend rejects duplicate output destinations, so block them here.
  const names = outputFiles.value.map((f) => f.name.trim())
  return names.every((name) => name.length > 0 && !name.includes('/')) && new Set(names).size === names.length
})
const dataReady = computed(
  () => !!s3.endpoint.value && s3.hasActiveKey.value && groupId.value.length > 0 && bucketValid.value,
)
const canContinue = computed(() => {
  switch (step.value) {
    case 1:
      return script.value.trim().length > 0
    case 2:
      return dataReady.value && outputsValid.value
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

async function submit() {
  submitError.value = null
  submitting.value = true
  try {
    await s3.putTextObject(outputBucket.value.trim(), scriptKey.value, script.value, runtime.value.contentType)
    const { id } = await createTask(task.value)
    submittedTaskId.value = id
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
  goStep(0)
  runId.value = crypto.randomUUID()
}
</script>

<template>
  <div>
    <PageHeader title="Quick run" description="Run a short python, node or bash script on this node without writing a TES task by hand.">
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
      <div class="flex items-center justify-between gap-2">
        <h2 class="font-display text-base font-semibold text-aruna-navy">Run submitted</h2>
        <Button variant="outline" size="sm" @click="runAnother"><ListPlus class="h-4 w-4" /> Run another</Button>
      </div>
      <QuickRunResult :task-id="submittedTaskId" :output-bucket="outputBucket.trim()" :output-prefix="normalizedPrefix" />
    </div>

    <!-- Wizard -->
    <div v-else class="container space-y-6 py-8">
      <WizardSteps :steps="WIZARD_STEPS" :current="step" />

      <section class="surface space-y-5 p-6">
        <!-- Step 1: Runtime -->
        <div v-if="step === 0" class="space-y-3">
          <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Runtime</div>
          <div class="grid gap-3 sm:grid-cols-3">
            <button
              v-for="rt in RUNTIMES"
              :key="rt.id"
              type="button"
              class="rounded-lg border p-4 text-left transition-colors"
              :class="runtimeId === rt.id ? 'border-primary bg-primary/5 ring-1 ring-primary/40' : 'border-border hover:bg-muted/40'"
              @click="runtimeId = rt.id"
            >
              <div class="text-sm font-semibold text-foreground">{{ rt.label }}</div>
              <div class="mt-1 font-mono text-[11px] text-muted-foreground">{{ rt.image }}</div>
            </button>
          </div>
          <p class="text-[11px] text-muted-foreground">
            The script runs as <code class="rounded bg-muted px-1 font-mono">{{ runtime.interpreter }} {{ scriptContainerPath }}</code> in a fresh container.
          </p>
        </div>

        <!-- Step 2: Script -->
        <div v-else-if="step === 1" class="space-y-3">
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
        </div>

        <!-- Step 3: Data -->
        <div v-else-if="step === 2" class="space-y-6">
          <!-- Credentials gate -->
          <div v-if="!s3.endpoint.value" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            This node does not advertise an S3 endpoint, so the portal cannot stage the script. Use the full task form to reference an existing script.
          </div>
          <div v-else-if="!s3.hasActiveKey.value" class="space-y-2 rounded-md border border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
            <p class="flex items-center gap-2 font-medium text-foreground"><KeyRound class="h-3.5 w-3.5" /> S3 credentials are required to stage the script and browse data.</p>
            <Button variant="outline" size="sm" @click="credentialDialogOpen = true"><Plus class="size-3.5" /> Create credentials</Button>
          </div>

          <template v-else>
            <div class="grid gap-3 sm:grid-cols-3">
              <div>
                <label class="text-xs font-medium text-foreground">Group</label>
                <Select v-model="groupId" :options="groupOptions" placeholder="Select a group" class="mt-1" />
                <p class="mt-1 text-[11px] text-muted-foreground">Owns the run and receives its Process Run crate.</p>
              </div>
              <div>
                <label class="text-xs font-medium text-foreground">Output bucket <span class="text-destructive">*</span></label>
                <Select v-if="bucketOptions.length" v-model="outputBucket" :options="bucketOptions" placeholder="Select a bucket" class="mt-1" />
                <Input
                  v-else
                  v-model="outputBucket"
                  class="mt-1 font-mono"
                  :placeholder="bucketsLoading ? 'Loading buckets…' : 'my-results'"
                  :invalid="outputBucket.trim() && !bucketValid ? 'error' : undefined"
                />
                <p v-if="outputBucket.trim() && !bucketValid" class="mt-1 text-[11px] text-destructive">
                  This bucket does not exist — results can only be written to one of your buckets.
                </p>
                <p v-else-if="bucketsLoaded && !buckets.length" class="mt-1 text-[11px] text-destructive">
                  You have no buckets yet — create one in Data first.
                </p>
                <p v-else class="mt-1 text-[11px] text-muted-foreground">Required — receives output files and the staged script.</p>
              </div>
              <div>
                <label class="text-xs font-medium text-foreground">Output prefix</label>
                <Input v-model="outputPrefix" class="mt-1 font-mono" placeholder="quickruns/" />
                <p class="mt-1 text-[11px] text-muted-foreground">Everything this run writes lands under this prefix.</p>
              </div>
            </div>

            <div class="grid gap-4 lg:grid-cols-2">
              <!-- Input data -->
              <section class="surface-muted space-y-3 p-4">
                <div>
                  <div class="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <ArrowDownToLine class="h-3.5 w-3.5 text-primary" /> Input data
                  </div>
                  <p class="mt-1 text-[11px] text-muted-foreground">
                    Staged read-only into the container under <code class="rounded bg-muted px-1 font-mono">/work/in/</code> before the script starts.
                  </p>
                </div>
                <div v-if="inputs.length" class="space-y-2">
                  <div v-for="(input, i) in inputs" :key="i" class="surface-inline flex items-center gap-3 p-2.5 text-xs">
                    <div class="min-w-0 flex-1 font-mono">
                      <div class="truncate text-foreground" :title="input.url">{{ input.url }}</div>
                      <div class="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <CornerDownRight class="h-3 w-3 shrink-0" /> /work/in/{{ input.name }}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon-sm" aria-label="Remove input" @click="removeInput(i)"><X class="h-4 w-4" /></Button>
                  </div>
                </div>
                <p v-else class="text-[11px] text-muted-foreground">No input data — the script starts with an empty <code class="rounded bg-muted px-1 font-mono">/work/in/</code>.</p>
                <Button variant="outline" size="sm" @click="inputDialogOpen = true"><ListPlus class="size-3.5" /> Add input</Button>
              </section>

              <!-- Output data -->
              <section class="surface-muted space-y-3 p-4">
                <div>
                  <div class="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <ArrowUpFromLine class="h-3.5 w-3.5 text-primary" /> Output data
                  </div>
                  <p class="mt-1 text-[11px] text-muted-foreground">
                    Files the script writes to <code class="rounded bg-muted px-1 font-mono">/work/out/</code> are uploaded to the output bucket after the run. stdout and stderr are always captured.
                  </p>
                </div>
                <div v-if="outputFiles.length" class="space-y-2">
                  <div v-for="(row, i) in outputFiles" :key="i" class="surface-inline space-y-1 p-2.5 text-xs">
                    <div class="flex items-center gap-2">
                      <span class="shrink-0 font-mono text-[11px] text-muted-foreground">/work/out/</span>
                      <Input v-model="row.name" class="h-8 font-mono text-xs" placeholder="result.txt" />
                      <Button variant="ghost" size="icon-sm" aria-label="Remove output" @click="removeOutput(i)"><X class="h-4 w-4" /></Button>
                    </div>
                    <div class="flex min-w-0 items-center gap-1 font-mono text-[11px] text-muted-foreground">
                      <CornerDownRight class="h-3 w-3 shrink-0" />
                      <span class="truncate" :title="outputDestination(row.name)">{{ outputDestination(row.name) }}</span>
                    </div>
                  </div>
                </div>
                <p v-else class="text-[11px] text-muted-foreground">No output files declared — only stdout and stderr are captured.</p>
                <p v-if="!outputsValid" class="text-[11px] text-destructive">Output names must be unique, non-empty single filenames (no slashes).</p>
                <Button variant="outline" size="sm" @click="addOutput"><Plus class="size-3.5" /> Add output file</Button>
              </section>
            </div>
          </template>
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
            Runs as <code class="rounded bg-muted px-1 font-mono">{{ runtime.interpreter }} {{ scriptContainerPath }}</code> in
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
        <Button v-else size="sm" :disabled="busy || submitting || !dataReady" @click="submit">
          <ListPlus class="h-4 w-4" /> {{ submitting ? 'Submitting…' : 'Submit run' }}
        </Button>
      </div>
    </div>

    <TesDataRefDialog v-model:open="inputDialogOpen" mode="input" @add="addInput" />
    <CreateCredentialDialog v-model:open="credentialDialogOpen" />
  </div>
</template>
