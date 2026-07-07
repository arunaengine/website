<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import WizardSteps from '@/components/onboarding/WizardSteps.vue'
import CodeSnippet from '@/components/onboarding/CodeSnippet.vue'
import ExecutorStepsEditor from '@/components/compute/ExecutorStepsEditor.vue'
import TesInputsEditor from '@/components/compute/TesInputsEditor.vue'
import { useTes, isTesUnsupported } from '@/composables/useTes'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import {
  TES_GROUP_TAG,
  pruneTesTask,
  type TesExecutor,
  type TesFileType,
  type TesInput,
  type TesOutput,
  type TesResources,
  type TesTask,
} from '@/lib/tes'
import { ArrowLeft, Cpu, ListPlus, LogIn, Plus, X } from '@lucide/vue'

const router = useRouter()
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

const WIZARD_STEPS = ['Basics', 'Inputs', 'Executors', 'Outputs & resources', 'Review']
const step = ref(0)

// ── Draft ────────────────────────────────────────────────────────────────────
const name = ref('')
const description = ref('')
const groupId = ref('')
const inputs = ref<TesInput[]>([])
const executors = ref<TesExecutor[]>([{ image: '', command: [''] }])

const outputBucket = ref('')
const outputPrefix = ref('runs/')
const outputRows = ref<{ path: string; type: string }[]>([{ path: '/outputs', type: 'DIRECTORY' }])

const cpuCores = ref('')
const ramGb = ref('')
const diskGb = ref('')
const preemptible = ref(false)

const groupOptions = computed(() => myGroups.value.map((g) => ({ value: g.id, label: g.name })))
const typeOptions = [
  { value: 'FILE', label: 'File' },
  { value: 'DIRECTORY', label: 'Directory' },
]

function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() || ''
}
function outputUrl(path: string): string {
  return `s3://${outputBucket.value.trim()}/${outputPrefix.value.trim()}${basename(path)}`
}

const outputs = computed<TesOutput[]>(() =>
  outputRows.value.map((row) => ({ url: outputUrl(row.path), path: row.path, type: row.type as TesFileType })),
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
    inputs: inputs.value,
    outputs: outputs.value,
    resources: resources.value,
    executors: executors.value,
    tags: { [TES_GROUP_TAG]: groupId.value },
  }),
)

// ── Validity ─────────────────────────────────────────────────────────────────
const executorsValid = computed(
  () =>
    executors.value.length > 0 &&
    executors.value.every((e) => e.image.trim() && e.command.some((a) => a.trim())),
)
const outputsValid = computed(() => {
  if (!outputRows.value.length) return true
  return outputBucket.value.trim().length > 0 && outputRows.value.every((r) => r.path.trim().startsWith('/'))
})
const canContinue = computed(() => {
  switch (step.value) {
    case 0:
      return groupId.value.length > 0
    case 2:
      return executorsValid.value
    case 3:
      return outputsValid.value
    default:
      return true
  }
})

function next() {
  if (canContinue.value && step.value < WIZARD_STEPS.length - 1) step.value++
}
function back() {
  if (step.value > 0) step.value--
}

function addOutputRow() {
  outputRows.value.push({ path: '/outputs', type: 'DIRECTORY' })
}
function removeOutputRow(i: number) {
  outputRows.value.splice(i, 1)
}

// ── Submit ───────────────────────────────────────────────────────────────────
const submitError = ref<string | null>(null)
async function submit() {
  submitError.value = null
  try {
    const { id } = await createTask(task.value)
    void router.push({ name: 'compute-task', params: { taskId: id } })
  } catch (err) {
    submitError.value = isTesUnsupported(err)
      ? `This backend does not serve a TES endpoint yet (aruna#290). ${errorMessage(err)}`
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
    <div v-if="!tesEnabled" class="container max-w-[900px] py-8">
      <EmptyState
        title="Compute is not enabled"
        description="Enable the tes feature flag in portal-config.json once this realm's nodes serve the GA4GH TES endpoint (aruna#290)."
      >
        <template #icon><Cpu class="h-7 w-7" /></template>
      </EmptyState>
    </div>

    <!-- Gate 2: not signed in -->
    <div v-else-if="!currentUser" class="container max-w-[900px] py-8">
      <section class="surface mx-auto max-w-xl p-8 text-center">
        <Cpu class="mx-auto h-8 w-8 text-muted-foreground/70" />
        <h2 class="mt-3 font-display text-base font-semibold text-aruna-navy">Sign in to submit a task</h2>
        <p class="mt-1.5 text-sm text-muted-foreground">Submitting GA4GH TES tasks is an authenticated operation.</p>
        <Button class="mt-4" size="sm" :disabled="signingIn" @click="startSignIn"><LogIn class="h-3.5 w-3.5" /> Sign in</Button>
      </section>
    </div>

    <!-- Wizard -->
    <div v-else class="container max-w-[900px] space-y-6 py-8">
      <WizardSteps :steps="WIZARD_STEPS" :current="step" />

      <section class="surface space-y-5 p-6">
        <!-- Step 1: Basics -->
        <div v-if="step === 0" class="space-y-4">
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
              Sets the required <code class="rounded bg-muted px-1">aruna.io/group</code> tag; the node accounts the run and writes the Process Run crate under this group (assumed convention, aruna#290).
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
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="text-xs font-medium text-foreground">Target bucket</label>
                <Input v-model="outputBucket" class="mt-1 font-mono" placeholder="my-results" />
              </div>
              <div>
                <label class="text-xs font-medium text-foreground">Prefix</label>
                <Input v-model="outputPrefix" class="mt-1 font-mono" placeholder="runs/" />
              </div>
            </div>
            <div v-for="(row, i) in outputRows" :key="i" class="surface space-y-2 p-3">
              <div class="flex flex-wrap items-end gap-3">
                <div class="min-w-0 flex-1">
                  <label class="text-xs font-medium text-foreground">Container path</label>
                  <Input v-model="row.path" class="mt-1 font-mono" placeholder="/outputs" />
                </div>
                <div class="w-40">
                  <label class="text-xs font-medium text-foreground">Type</label>
                  <Select v-model="row.type" :options="typeOptions" class="mt-1" />
                </div>
                <Button variant="ghost" size="icon-sm" class="text-destructive hover:text-destructive" aria-label="Remove output" @click="removeOutputRow(i)"><X class="h-4 w-4" /></Button>
              </div>
              <p class="truncate font-mono text-[11px] text-muted-foreground" :title="outputUrl(row.path)">→ {{ outputUrl(row.path) }}</p>
            </div>
            <Button variant="outline" size="sm" @click="addOutputRow"><Plus class="size-3.5" /> Add output</Button>
            <p v-if="outputRows.length && !outputsValid" class="text-[11px] text-destructive">Set a target bucket and give every output an absolute container path (starts with /).</p>
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
        </div>

        <!-- Step 5: Review -->
        <div v-else class="space-y-3">
          <CodeSnippet title="TES task (POST /ga4gh/tes/v1/tasks)" :code="JSON.stringify(task, null, 2)" />
          <p v-if="submitError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ submitError }}</p>
        </div>
      </section>

      <div class="flex items-center justify-between">
        <Button variant="outline" size="sm" :disabled="step === 0" @click="back">Back</Button>
        <Button v-if="step < WIZARD_STEPS.length - 1" size="sm" :disabled="!canContinue" @click="next">Continue</Button>
        <Button v-else size="sm" :disabled="busy" @click="submit"><ListPlus class="h-4 w-4" /> Submit task</Button>
      </div>
    </div>
  </div>
</template>
