<script setup lang="ts">
// One notebook: files on the left, cells in the middle, the session on top.
// The document lives in the workspace bucket; the cells run in the session job
// on the node that holds it.
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Select from '@/components/ui/Select.vue'
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
import { activeGroupId } from '@/composables/useGroupSelection'
import { useNotebookLocation } from '@/composables/useNotebookLocation'
import { SESSION_RUNTIMES, sessionRuntimeById } from '@/lib/notebook/runtimes'
import { relativeTime } from '@/lib/utils'
import { ArrowLeft, FolderClosed, Plus, Save } from '@lucide/vue'

const route = useRoute()
const router = useRouter()
const savedLocation = useNotebookLocation()
const { myGroups } = useAruna()
const { tesEnabled } = useTes()

const bucket = computed(() => String(route.params.bucketId ?? ''))
const key = computed(() => String(route.params.key ?? ''))

const notebook = createNotebook(bucket, key, () => ({
  runtime: typeof route.query.runtime === 'string' ? route.query.runtime : SESSION_RUNTIMES[0].id,
  group_id: typeof route.query.group === 'string' ? route.query.group : activeGroupId.value,
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
  const locationScope = savedLocation.scope.value
  const loading = notebook.load()
  const request = notebook.generation.value
  await loading
  if (request !== notebook.generation.value || notebook.loadError.value || locationScope !== savedLocation.scope.value) return
  savedLocation.remember({ bucket: bucket.value, key: key.value, prefix: key.value.split('/').slice(0, -1).join('/') })
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
watch(activeGroupId, (group, previous) => {
  if (previous && group !== previous) void router.push({ name: 'notebooks', query: { browse: '1' } })
})
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
  notebook.selectCell('')
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

const filesOpen = ref(true)
const cellType = ref('code')
const cellTypes = computed(() => [
  { value: 'code', label: sessionRuntimeById(notebook.meta.value?.runtime ?? '')?.label || 'Code' },
  ...(sessionRuntimeById(notebook.meta.value?.runtime ?? '')?.lang === 'python' ? [{ value: 'bash', label: 'Bash' }] : []),
  { value: 'markdown', label: 'Markdown' },
  { value: 'pipeline', label: 'Pipeline' },
])

async function addCell() {
  const kind = cellType.value
  const cell = notebook.addCell(kind === 'pipeline' ? 'raw' : kind === 'markdown' ? 'markdown' : 'code',
    undefined, kind === 'bash' ? '%%bash\n' : '', kind === 'pipeline' ? { kind: 'pipeline' } : undefined)
  notebook.selectCell(cell.id)
  await nextTick()
  document.getElementById(`notebook-cell-${cell.id}`)?.scrollIntoView({ block: 'nearest' })
}

const draggedCell = ref('')
const dropIndex = ref<number | null>(null)
function startDrag(event: DragEvent, id: string) {
  draggedCell.value = id
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }
}
function dragOver(event: DragEvent, index: number) {
  if (!draggedCell.value) return
  event.preventDefault()
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  dropIndex.value = index + (event.clientY > box.top + box.height / 2 ? 1 : 0)
}
function dropCell() {
  const from = notebook.cells.value.findIndex((cell) => cell.id === draggedCell.value)
  if (from >= 0 && dropIndex.value !== null) {
    const target = dropIndex.value - (from < dropIndex.value ? 1 : 0)
    notebook.moveCell(draggedCell.value, target - from)
  }
  draggedCell.value = ''
  dropIndex.value = null
}

const savedLabel = computed(() => {
  if (notebook.saving.value) return 'Saving…'
  if (notebook.dirty.value) return 'Not saved yet'
  return notebook.lastSavedMs.value ? `Saved ${relativeTime(new Date(notebook.lastSavedMs.value).toISOString())}` : ''
})
</script>

<template>
  <div>
    <PageHeader eyebrow="Notebooks" :title="notebook.name.value || 'Notebook'">
      <template #actions>
        <AskAiButton size="default" prompt="Help me with this notebook." subject="the notebook" />
        <Button variant="outline" size="default" as-child>
          <RouterLink :to="{ name: 'notebooks', query: { browse: '1' } }">
            <ArrowLeft class="h-4 w-4" /> Browse notebooks
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
      <div class="mx-auto w-full max-w-[110rem] space-y-4 px-4 py-4 sm:px-6">
        <NotebookSessionBar />

        <Notice v-if="notebook.loadError.value" tone="error">{{ notebook.loadError.value }}</Notice>
        <Notice v-if="notebook.saveError.value" tone="error">{{ notebook.saveError.value }}</Notice>
        <Notice v-if="notebook.restoredCopy.value" tone="warning">
          Unsaved changes from this browser were restored.
          <Button variant="link" size="sm" class="h-auto p-0" @click="notebook.discardCopy()">
            Use the stored notebook instead
          </Button>
        </Notice>

        <div class="grid items-start gap-5" :class="filesOpen ? 'xl:grid-cols-[18rem_minmax(0,1fr)]' : ''">
          <NotebookFiles v-if="filesOpen" class="max-h-[70vh] overflow-auto" />

          <div class="min-w-0 space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" :disabled="!session.live.value" @click="runAll">Run all</Button>
              <Button size="sm" variant="outline" :aria-expanded="filesOpen" @click="filesOpen = !filesOpen">
                <FolderClosed class="size-3.5" /> Files
              </Button>
              <Select v-model="cellType" :options="cellTypes" aria-label="New cell type" class="w-36" />
              <Button size="sm" variant="outline" @click="addCell"><Plus class="size-3.5" /> Add cell</Button>
              <span class="flex-1" />
              <span class="text-[11px] text-muted-foreground">{{ savedLabel }}</span>
              <Button size="sm" :disabled="notebook.saving.value" @click="notebook.save()">
                <Save class="size-3.5" /> Save
              </Button>
            </div>

            <div v-if="notebook.loading.value" class="grid place-items-center py-16">
              <Spinner />
            </div>
            <div v-else class="space-y-3" @dragend="draggedCell = ''; dropIndex = null">
              <div
                v-for="(cell, index) in notebook.cells.value"
                :id="`notebook-cell-${cell.id}`"
                :key="cell.id"
                :class="dropIndex === index ? 'border-t-4 border-primary pt-2' : ''"
                @dragover="dragOver($event, index)"
                @drop.prevent="dropCell"
              >
                <NotebookCellView :cell="cell" :index="index" @run-to-here="runToHere(cell.id)" @drag-cell="startDrag($event, cell.id)" />
              </div>
              <div :class="dropIndex === notebook.cells.value.length ? 'border-t-4 border-primary' : ''" @dragover.prevent="draggedCell && (dropIndex = notebook.cells.value.length)" @drop.prevent="dropCell">
                <Button variant="ghost" size="sm" @click="addCell"><Plus class="size-3.5" /> Add {{ cellTypes.find((type) => type.value === cellType)?.label }} cell</Button>
              </div>
            </div>
          </div>
        </div>
        <JobReportPanel v-if="session.ended.value && session.jobId.value" :job-id="session.jobId.value" />
      </div>
    </ComputeGates>
  </div>
</template>
