<script setup lang="ts">
// One notebook: files on the left, cells in the middle, the session on top.
// The document lives in the workspace bucket; the cells run in the session job
// on the node that holds it.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import AskAiButton from '@/components/assistant/AskAiButton.vue'
import ComputeGates from '@/components/compute/ComputeGates.vue'
import NotebookCellView from '@/components/notebook/NotebookCell.vue'
import NotebookFiles from '@/components/notebook/NotebookFiles.vue'
import NotebookSessionBar from '@/components/notebook/NotebookSessionBar.vue'
import JobReportPanel from '@/components/jobs/JobReportPanel.vue'
import { provideNotebook } from '@/composables/notebookContext'
import { createNotebook } from '@/composables/useNotebook'
import { createNotebookSession } from '@/composables/useNotebookSession'
import { provideNotebookBridge } from '@/composables/useAssistantNotebook'
import { createNotebookBridge } from '@/lib/notebook/bridge'
import { useAruna } from '@/composables/useAruna'
import { useTes } from '@/composables/useTes'
import { SESSION_RUNTIMES } from '@/lib/notebook/runtimes'
import { relativeTime } from '@/lib/utils'
import { ArrowLeft, Code2, FileText, Plus, Save, Workflow } from '@lucide/vue'

const route = useRoute()
const { myGroups } = useAruna()
const { tesEnabled } = useTes()

const bucket = computed(() => String(route.params.bucketId ?? ''))
const key = computed(() => String(route.params.key ?? ''))

const notebook = createNotebook(bucket, key, () => ({
  runtime: typeof route.query.runtime === 'string' ? route.query.runtime : SESSION_RUNTIMES[0].id,
  group_id: typeof route.query.group === 'string' ? route.query.group : (myGroups.value[0]?.id ?? ''),
}))
const session = createNotebookSession(notebook)
provideNotebook({ notebook, session })
// The assistant may read and change this notebook while the page is open.
provideNotebookBridge(createNotebookBridge(notebook, session))

const autosaveTimer = ref<ReturnType<typeof setInterval> | null>(null)

async function open() {
  if (!bucket.value || !key.value) return
  // A different notebook must never keep the stream of the one before it.
  session.detach()
  const loading = notebook.load()
  const request = notebook.generation.value
  await loading
  if (request !== notebook.generation.value || notebook.loadError.value) return
  await session.attachSaved()
}

onMounted(() => {
  void open()
  autosaveTimer.value = setInterval(() => void notebook.autosave(), 30_000)
})
onUnmounted(() => {
  if (autosaveTimer.value) clearInterval(autosaveTimer.value)
})
watch([bucket, key, notebook.scope], () => void open())
// Groups can load after the page did; without one the first read is refused.
watch(myGroups, () => {
  if (notebook.loadDenied.value && !notebook.loading.value) void open()
})

// The key holds slashes, so every segment is encoded on its own.
const redirectTo = computed(
  () => `/app/notebooks/${encodeURIComponent(bucket.value)}/${key.value.split('/').map(encodeURIComponent).join('/')}`,
)

const codeCells = computed(() => notebook.cells.value.filter((cell) => cell.cell_type === 'code'))

function runAll() {
  void session.runCells(codeCells.value.map((cell) => ({ id: cell.id, source: cell.source })))
}

function runToHere(cellId: string) {
  const cells = notebook.cells.value
  const index = cells.findIndex((cell) => cell.id === cellId)
  if (index < 0) return
  void session.runCells(
    cells
      .slice(0, index + 1)
      .filter((cell) => cell.cell_type === 'code')
      .map((cell) => ({ id: cell.id, source: cell.source })),
  )
}

function addPipelineCell() {
  notebook.addCell('raw', undefined, '', { kind: 'pipeline' })
}

const savedLabel = computed(() => {
  if (notebook.saving.value) return 'Saving…'
  if (notebook.dirty.value) return 'Not saved yet'
  return notebook.lastSavedMs.value ? `Saved ${relativeTime(new Date(notebook.lastSavedMs.value).toISOString())}` : ''
})
</script>

<template>
  <div>
    <PageHeader eyebrow="Compute" :title="notebook.name.value || 'Notebook'">
      <template #actions>
        <AskAiButton size="default" prompt="Help me with this notebook." subject="the notebook" />
        <Button variant="outline" size="default" as-child>
          <RouterLink :to="{ name: 'bucket', params: { bucketId: bucket } }">
            <ArrowLeft class="h-4 w-4" /> Back to the bucket
          </RouterLink>
        </Button>
      </template>
    </PageHeader>

    <ComputeGates
      :enabled="tesEnabled"
      disabled-description="Set features.tes to true in portal-config.json for this deployment; notebooks run on the same compute as every other run."
      sign-in-title="Sign in to open a notebook"
      sign-in-description="A notebook reads and writes stored data."
      :redirect-to="redirectTo"
    >
      <div class="container max-w-[110rem] space-y-3 py-6">
        <NotebookSessionBar />

        <Notice v-if="notebook.loadError.value" tone="error">{{ notebook.loadError.value }}</Notice>
        <Notice v-if="notebook.saveError.value" tone="error">{{ notebook.saveError.value }}</Notice>
        <Notice v-if="notebook.restoredCopy.value" tone="warning">
          Unsaved changes from this browser were restored.
          <Button variant="link" size="sm" class="h-auto p-0" @click="notebook.discardCopy()">
            Use the stored notebook instead
          </Button>
        </Notice>

        <div class="grid gap-3 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <NotebookFiles class="max-h-[70vh]" />

          <div class="min-w-0 space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" :disabled="!session.live.value" @click="runAll">Run all</Button>
              <Button size="sm" variant="outline" @click="notebook.addCell('code')">
                <Code2 class="size-3.5" /> Code
              </Button>
              <Button size="sm" variant="outline" @click="notebook.addCell('markdown')">
                <FileText class="size-3.5" /> Text
              </Button>
              <Button size="sm" variant="outline" @click="addPipelineCell">
                <Workflow class="size-3.5" /> Pipeline
              </Button>
              <span class="flex-1" />
              <span class="text-[11px] text-muted-foreground">{{ savedLabel }}</span>
              <Button size="sm" :disabled="notebook.saving.value" @click="notebook.save()">
                <Save class="size-3.5" /> Save
              </Button>
            </div>

            <div v-if="notebook.loading.value" class="grid place-items-center py-16">
              <Spinner />
            </div>
            <div v-else class="space-y-3">
              <NotebookCellView
                v-for="(cell, index) in notebook.cells.value"
                :key="cell.id"
                :cell="cell"
                :index="index"
                @run-to-here="runToHere(cell.id)"
              />
              <Button variant="ghost" size="sm" @click="notebook.addCell('code')">
                <Plus class="size-3.5" /> Add a cell
              </Button>
            </div>
          </div>
        </div>
        <JobReportPanel v-if="session.ended.value && session.jobId.value" :job-id="session.jobId.value" />
      </div>
    </ComputeGates>
  </div>
</template>
