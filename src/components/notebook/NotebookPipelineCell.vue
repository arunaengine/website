<script setup lang="ts">
// A pipeline cell: an ordinary job, described in a small form and submitted the
// way the run page submits one. Its outputs land in the workspace bucket, and
// the job card follows it once it is on its way.
import { computed, onScopeDispose, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import JobCard from '@/components/assistant/cards/JobCard.vue'
import TesDataRefDialog from '@/components/compute/TesDataRefDialog.vue'
import { injectNotebook } from '@/composables/notebookContext'
import { useAruna } from '@/composables/useAruna'
import { getJob, submitErrorMessage, submitJob } from '@/lib/jobs'
import {
  defaultInputPath,
  defaultOutputKey,
  pipelineDraftFrom,
  pipelineRequest,
  pipelineSource,
} from '@/lib/notebook/pipeline'
import { follow, POLL_ACTIVE_MS } from '@/lib/poll'
import { jobFacts, liveJob, noteJob } from '@/lib/assistant/jobLive'
import { parseS3Url, type TesDataRefEntry } from '@/lib/tes'
import type { NotebookCell } from '@/lib/notebook/nbformat'
import type { JobView } from '@/lib/assistant/types'
import { Plus, Send, X } from '@lucide/vue'

const props = defineProps<{ cell: NotebookCell }>()

const { notebook } = injectNotebook()
const { apiBaseUrl, authToken } = useAruna()

const draft = ref(pipelineDraftFrom(props.cell.source))
const submitting = ref(false)
const error = ref<string | null>(null)
const statusError = ref<string | null>(null)
const jobId = ref(props.cell.metadata.aruna?.job_id ?? '')
const expanded = ref(!jobId.value)
let pendingKey = ''
let disposed = false
onScopeDispose(() => { disposed = true })

const context = computed(() => ({
  groupId: notebook.meta.value?.group_id ?? '',
  workspaceBucket: notebook.meta.value?.workspace_bucket ?? '',
  idempotencyKey: props.cell.id,
}))
const mapping = computed(() => pipelineRequest(draft.value, context.value))
const blocked = computed(() => ('blocked' in mapping.value ? mapping.value.blocked : null))
const ready = computed(() => !blocked.value && draft.value.image.trim() && draft.value.command.trim())

// The cell keeps the request it would send, so a reload shows the same run.
watch(
  mapping,
  (next) => {
    if ('blocked' in next) return
    notebook.setSource(props.cell.id, pipelineSource(next.request))
  },
  { immediate: true, deep: true },
)

const jobView = computed<JobView>(() => ({
  kind: 'job',
  title: draft.value.name || 'Pipeline cell',
  jobId: jobId.value,
  state: 'queued',
  jobKind: 'execution',
  outputs: [],
}))

onScopeDispose(follow(async () => {
  const id = jobId.value
  const request = notebook.generation.value
  const active = () => !disposed && id === jobId.value && request === notebook.generation.value
  try {
    const job = await getJob(id, { baseUrl: apiBaseUrl.value, token: authToken.value })
    if (!active()) return
    statusError.value = null
    noteJob(id, jobFacts(job))
  } catch (cause) {
    if (active()) statusError.value = submitErrorMessage(cause)
  }
}, () => POLL_ACTIVE_MS, () => !jobId.value || ['succeeded', 'failed', 'cancelled'].includes(liveJob(jobId.value)?.state ?? '')))

const inputsOpen = ref(false)

/** A picked object, or every file of a picked folder, becomes an input row. */
function addInput(entry: TesDataRefEntry) {
  if (entry.kind === 'file') {
    const parsed = parseS3Url(entry.url)
    if (!parsed) return
    draft.value.inputs.push({
      bucket: parsed.bucket,
      key: parsed.key,
      path: defaultInputPath(entry.name),
      name: entry.name,
    })
    return
  }
  for (const file of entry.files) {
    draft.value.inputs.push({
      bucket: entry.bucket,
      key: file.key,
      path: defaultInputPath(`${entry.name}/${file.name}`),
      name: file.name,
    })
  }
}

function addOutput() {
  draft.value.outputs.push({ path: '/work/out/result.txt', key: defaultOutputKey('result.txt') })
}

async function submit() {
  const built = mapping.value
  if ('blocked' in built || submitting.value) return
  const request = notebook.generation.value
  const cellId = props.cell.id
  const active = () => !disposed && request === notebook.generation.value && props.cell.id === cellId
  submitting.value = true
  error.value = null
  try {
    pendingKey ||= crypto.randomUUID()
    const created = await submitJob(
      { ...built.request, idempotency_key: pendingKey },
      { baseUrl: apiBaseUrl.value, token: authToken.value },
    )
    if (!active()) return
    pendingKey = ''
    jobId.value = created.job_id
    expanded.value = false
    notebook.noteCellRun(cellId, { job_id: created.job_id })
  } catch (cause) {
    if (!active()) return
    error.value = submitErrorMessage(cause)
  } finally {
    if (active()) submitting.value = false
  }
}
</script>

<template>
  <div class="space-y-3 p-3">
    <div v-if="!expanded" class="flex min-w-0 flex-wrap items-center gap-2">
      <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ draft.name || 'Pipeline step' }}</span>
      <Button variant="outline" size="sm" @click="expanded = true">Edit step</Button>
    </div>
    <template v-if="expanded">
    <div class="grid gap-2 sm:grid-cols-2">
      <label class="space-y-1">
        <span class="text-xs font-medium text-foreground">Name</span>
        <Input v-model="draft.name" placeholder="align reads" />
      </label>
      <label class="space-y-1">
        <span class="text-xs font-medium text-foreground">Image</span>
        <Input v-model="draft.image" class="font-mono text-xs" placeholder="ghcr.io/org/tool:1.2" />
      </label>
    </div>
    <label class="block space-y-1">
      <span class="text-xs font-medium text-foreground">Command</span>
      <Input v-model="draft.command" class="font-mono text-xs" placeholder="tool --in /work/in --out /work/out" />
    </label>
    <div class="grid gap-2 sm:grid-cols-2">
      <label class="space-y-1">
        <span class="text-xs font-medium text-foreground">CPU cores</span>
        <Input v-model="draft.cpuCores" type="number" min="1" step="1" />
      </label>
      <label class="space-y-1">
        <span class="text-xs font-medium text-foreground">RAM in GB</span>
        <Input v-model="draft.ramGb" type="number" min="0" step="any" />
      </label>
    </div>

    <div class="space-y-2">
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-foreground">Files to read</span>
        <Button variant="outline" size="sm" @click="inputsOpen = true"><Plus class="size-3.5" /> Add</Button>
      </div>
      <p v-if="!draft.inputs.length" class="text-[11px] text-muted-foreground">
        No files staged. A picked object is read into the container at the path beside it.
      </p>
      <div v-for="(row, index) in draft.inputs" :key="`${row.bucket}/${row.key}/${index}`" class="flex items-center gap-2">
        <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground" :title="`s3://${row.bucket}/${row.key}`">
          {{ row.key }}
        </span>
        <Input v-model="row.path" class="font-mono text-xs" aria-label="Path in the container" />
        <Button variant="ghost" size="icon-sm" aria-label="Remove this file" @click="draft.inputs.splice(index, 1)">
          <X class="size-3" />
        </Button>
      </div>
    </div>

    <div class="space-y-2">
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-foreground">Files to keep</span>
        <Button variant="outline" size="sm" @click="addOutput"><Plus class="size-3.5" /> Add</Button>
      </div>
      <p v-if="!draft.outputs.length" class="text-[11px] text-muted-foreground">
        Nothing is kept yet. A captured path is stored in {{ context.workspaceBucket || 'the workspace bucket' }}.
      </p>
      <div v-for="(row, index) in draft.outputs" :key="index" class="flex items-center gap-2">
        <Input v-model="row.path" class="font-mono text-xs" aria-label="Path in the container" />
        <Input v-model="row.key" class="font-mono text-xs" aria-label="Key in the workspace bucket" />
        <Button variant="ghost" size="icon-sm" aria-label="Remove this file" @click="draft.outputs.splice(index, 1)">
          <X class="size-3" />
        </Button>
      </div>
    </div>

    </template>

    <Notice v-if="blocked" tone="warning">{{ blocked }}</Notice>
    <Notice v-if="error" tone="error">{{ error }}</Notice>
    <Notice v-if="statusError" tone="warning">Could not refresh this run: {{ statusError }}</Notice>

    <div class="flex flex-wrap items-center gap-2">
      <Button size="sm" :disabled="!ready || submitting" @click="submit">
        <Send class="size-3.5" /> {{ submitting ? 'Sending…' : jobId ? 'Run again' : 'Run this step' }}
      </Button>
      <span class="text-[11px] text-muted-foreground">Runs as an ordinary job, not in the kernel.</span>
    </div>

    <JobCard v-if="jobId" :view="jobView" />

    <TesDataRefDialog v-model:open="inputsOpen" mode="input" @add="addInput" />
  </div>
</template>
