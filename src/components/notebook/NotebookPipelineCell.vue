<script setup lang="ts">
// A pipeline cell: an ordinary job, described in a small form and submitted the
// way the run page submits one. Its outputs land in the workspace bucket, and
// the job card follows it once it is on its way.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import JobCard from '@/components/assistant/cards/JobCard.vue'
import { injectNotebook } from '@/composables/notebookContext'
import { useAruna } from '@/composables/useAruna'
import { submitErrorMessage, submitJob } from '@/lib/jobs'
import {
  defaultOutputKey,
  pipelineDraftFrom,
  pipelineRequest,
  pipelineSource,
} from '@/lib/notebook/pipeline'
import type { NotebookCell } from '@/lib/notebook/nbformat'
import type { JobView } from '@/lib/assistant/types'
import { Plus, Send, X } from '@lucide/vue'

const props = defineProps<{ cell: NotebookCell }>()

const { notebook } = injectNotebook()
const { apiBaseUrl, authToken } = useAruna()

const draft = ref(pipelineDraftFrom(props.cell.source))
const submitting = ref(false)
const error = ref<string | null>(null)
const jobId = ref(props.cell.metadata.aruna?.job_id ?? '')

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

function addOutput() {
  draft.value.outputs.push({ path: '/work/out/result.txt', key: defaultOutputKey('result.txt') })
}

async function submit() {
  const built = mapping.value
  if ('blocked' in built || submitting.value) return
  submitting.value = true
  error.value = null
  try {
    const created = await submitJob(built.request, { baseUrl: apiBaseUrl.value, token: authToken.value })
    jobId.value = created.job_id
    notebook.noteCellRun(props.cell.id, { job_id: created.job_id })
  } catch (cause) {
    error.value = submitErrorMessage(cause)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="space-y-3 p-3">
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

    <Notice v-if="blocked" tone="warning">{{ blocked }}</Notice>
    <Notice v-if="error" tone="error">{{ error }}</Notice>

    <div class="flex items-center gap-2">
      <Button size="sm" :disabled="!ready || submitting" @click="submit">
        <Send class="size-3.5" /> {{ submitting ? 'Sending…' : 'Run this step' }}
      </Button>
      <span class="text-[11px] text-muted-foreground">Runs as an ordinary job, not in the kernel.</span>
    </div>

    <JobCard v-if="jobId" :view="jobView" />
  </div>
</template>
