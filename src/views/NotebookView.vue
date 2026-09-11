<script setup lang="ts">
// One notebook: files on the left, cells in the middle, the session on top.
// The document lives in the workspace bucket; the cells run in the session job
// on the node that holds it.
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import AskAiButton from '@/components/assistant/AskAiButton.vue'
import ComputeGates from '@/components/compute/ComputeGates.vue'
import NotebookCellView from '@/components/notebook/NotebookCell.vue'
import NotebookCapture from '@/components/notebook/NotebookCapture.vue'
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
import { SESSION_RUNTIMES } from '@/lib/notebook/runtimes'
import { errorMessage, relativeTime } from '@/lib/utils'
import { ArrowLeft, FileText, Lock, Unlock, Plus, Save } from '@lucide/vue'

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

// The chat belongs to this notebook alone, so reopening it never resumes the
// conversation about another one.
const assistantSubject = computed(() => `the notebook ${bucket.value}/${key.value}`)

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

function deselectCell(event: MouseEvent) {
  if (!(event.target as Element | null)?.closest?.('.notebook-cell')) notebook.selectCell('')
}

onMounted(() => {
  document.addEventListener('click', deselectCell, true)
  void open()
  autosaveTimer.value = setInterval(() => void notebook.autosave(), 30_000)
})
onUnmounted(() => {
  document.removeEventListener('click', deselectCell, true)
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
const reportOpen = ref(false)
watch([notebook.generation, session.jobId], () => { reportOpen.value = false })
const markdownLocked = ref(false)
const imageError = ref('')
watch(notebook.generation, () => { imageError.value = '' })
async function addCell(index?: number) {
  const cell = notebook.addCell('code', index)
  notebook.selectCell(cell.id)
  await nextTick()
  const element = document.getElementById(`notebook-cell-${cell.id}`)
  element?.scrollIntoView({ block: 'nearest' })
  element?.querySelector<HTMLElement>('[data-markdown-preview]')?.focus()
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
function fileOver(event: DragEvent) {
  if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
}
async function dropImages(event: DragEvent, index?: number, cellId?: string) {
  const files = Array.from(event.dataTransfer?.files ?? [])
  if (!files.length) return
  imageError.value = ''
  if (markdownLocked.value) { imageError.value = 'Unlock Markdown to add PNG images.'; return }
  const generation = notebook.generation.value
  let target = notebook.cells.value.find((cell) => cell.id === cellId && cell.cell_type === 'markdown')
  for (const file of files) {
    if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) { imageError.value = 'Drop a PNG image into the notebook.'; continue }
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
        reader.onerror = () => reject(reader.error ?? new Error('The PNG could not be read.'))
        reader.readAsDataURL(file)
      })
      if (generation !== notebook.generation.value || markdownLocked.value) return
      if (target && !notebook.cells.value.some((cell) => cell.id === target!.id)) return
      if (!target) target = notebook.addCell('markdown', index)
      notebook.addAttachment(target.id, file.name, data)
      notebook.selectCell(target.id)
    } catch (cause) {
      if (generation === notebook.generation.value) imageError.value = errorMessage(cause)
    }
  }
}
function dropCell(event: DragEvent, index?: number, cellId?: string) {
  if (event.dataTransfer?.files.length) { void dropImages(event, index, cellId); return }
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
    <PageHeader eyebrow="Notebooks" :title="notebook.name.value || 'Notebook'" :docs="{ topic: 'notebooks', section: 'The session bar' }">
      <template #actions>
        <AskAiButton size="default" prompt="Help me with this notebook." :subject="assistantSubject" />
        <Button variant="outline" size="default" as-child>
          <RouterLink :to="{ name: 'notebooks', query: { browse: '1' } }">
            <ArrowLeft class="h-4 w-4" /> Change notebook
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
      <div class="container space-y-6 py-6">
        <Notice v-if="notebook.loadError.value" tone="error">{{ notebook.loadError.value }}</Notice>
        <Notice v-if="notebook.saveError.value" tone="error">{{ notebook.saveError.value }}</Notice>
        <Notice v-if="notebook.restoredCopy.value" tone="warning">
          Unsaved changes from this browser were restored.
          <Button variant="link" size="sm" class="h-auto p-0" @click="notebook.discardCopy()">
            Use the stored notebook instead
          </Button>
        </Notice>

        <div class="grid items-start gap-6" :class="filesOpen ? 'xl:grid-cols-[18rem_minmax(0,1fr)]' : 'xl:grid-cols-[3rem_minmax(0,1fr)]'">
          <NotebookFiles :collapsed="!filesOpen" class="max-h-[70vh] overflow-auto" @toggle="filesOpen = !filesOpen" />

          <div class="min-w-0 space-y-3">
            <div class="sticky top-14 z-10 flex flex-wrap items-center gap-2 bg-background/95 py-2 backdrop-blur">
              <NotebookSessionBar />
              <Button size="sm" variant="outline" @click="addCell()"><Plus class="size-3.5" /> Add cell</Button>
              <span class="flex-1" />
              <span class="text-[11px] text-muted-foreground">{{ savedLabel }}</span>
              <NotebookCapture />
              <IconButton v-if="session.ended.value && session.jobId.value" label="Session report" @click="reportOpen = true"><FileText class="size-3.5" /></IconButton>
              <IconButton :label="markdownLocked ? 'Unlock Markdown' : 'Lock Markdown'" :aria-pressed="markdownLocked" @click="markdownLocked = !markdownLocked"><component :is="markdownLocked ? Lock : Unlock" class="size-3.5" /></IconButton>
              <Button size="sm" :disabled="notebook.saving.value" @click="notebook.save()">
                <Spinner v-if="notebook.saving.value" class="text-current" aria-hidden="true" /><Save v-else class="size-3.5" /> Save
              </Button>
            </div>

            <Notice v-if="imageError" tone="error">{{ imageError }}</Notice>
            <div v-if="notebook.loading.value" class="grid place-items-center py-16">
              <Spinner />
            </div>
            <div v-else class="space-y-3" @dragover="fileOver" @drop.prevent="dropImages($event)" @dragend="draggedCell = ''; dropIndex = null">
              <div
                v-for="(cell, index) in notebook.cells.value"
                :id="`notebook-cell-${cell.id}`"
                :key="cell.id"
                :class="dropIndex === index ? 'border-t-4 border-primary pt-2' : ''"
                @dragover="dragOver($event, index)"
                @drop.stop.prevent="dropCell($event, index + 1, cell.id)"
              >
                <NotebookCellView :cell="cell" :index="index" :markdown-locked="markdownLocked" @run-to-here="runToHere(cell.id)" @drag-cell="startDrag($event, cell.id)" @add-below="addCell(index + 1)" />
              </div>
              <div v-if="draggedCell" class="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground" :class="dropIndex === notebook.cells.value.length ? 'border-primary bg-primary/5' : ''" @dragover.prevent="dropIndex = notebook.cells.value.length" @drop.stop.prevent="dropCell($event)">Drop cell here</div>
            </div>
          </div>
        </div>
        <Dialog v-model:open="reportOpen">
          <DialogContent class="max-h-[85vh] max-w-4xl overflow-y-auto">
            <DialogHeader><DialogTitle>Session report</DialogTitle><DialogDescription>The completed session's recorded inputs, writes, and end reason.</DialogDescription></DialogHeader>
            <JobReportPanel v-if="reportOpen && session.jobId.value" :job-id="session.jobId.value" />
          </DialogContent>
        </Dialog>
      </div>
    </ComputeGates>
  </div>
</template>
