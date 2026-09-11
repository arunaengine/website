<script setup lang="ts">
// Files stored beside the notebook; imports and picked objects go into data/.
import { computed, onScopeDispose, ref, watch } from 'vue'
import IconButton from '@/components/ui/IconButton.vue'
import Notice from '@/components/ui/Notice.vue'
import ObjectBrowserPanel from '@/components/data/ObjectBrowserPanel.vue'
import TesDataRefDialog from '@/components/compute/TesDataRefDialog.vue'
import AddDataDialog from '@/components/data/AddDataDialog.vue'
import { injectNotebook } from '@/composables/notebookContext'
import { useS3 } from '@/composables/useS3'
import { addSessionInputs } from '@/lib/notebook/session'
import { NOTEBOOK_DATA_PREFIX } from '@/lib/notebook/document'
import { parseS3Url, type TesDataRefEntry } from '@/lib/tes'
import { errorMessage } from '@/lib/utils'
import { CloudDownload, PanelLeft, Plus } from '@lucide/vue'

defineProps<{ collapsed?: boolean }>()
const emit = defineEmits<{ (event: 'toggle'): void }>()

const { notebook, session } = injectNotebook()
const s3 = useS3()

const importOpen = ref(false)
// Remounts the browser after an import, which has no reload of its own.
const panelRevision = ref(0)
const dataKeys = ref<ReadonlySet<string>>(new Set())
const addOpen = ref(false)
const staging = ref(false)
const stageNote = ref<string | null>(null)

const bucket = computed(() => notebook.meta.value?.workspace_bucket ?? '')
let disposed = false
onScopeDispose(() => { disposed = true })

function current() {
  const generation = notebook.generation.value
  const jobId = session.jobId.value
  return () => !disposed && generation === notebook.generation.value && jobId === session.jobId.value
}

watch([notebook.generation, session.jobId], () => {
  staging.value = false
  stageNote.value = null
  dataKeys.value = new Set()
  importOpen.value = false
  addOpen.value = false
}, { flush: 'sync' })

/** Keys under data/, so the import warns before it overwrites one. */
async function loadDataKeys() {
  if (!bucket.value) return
  const active = current()
  try {
    const page = await s3.listObjects(bucket.value, NOTEBOOK_DATA_PREFIX)
    if (!active()) return
    dataKeys.value = new Set(page.objects.map((object) => object.key))
  } catch {
    if (!active()) return
    dataKeys.value = new Set()
  }
}

function onImported() {
  panelRevision.value += 1
  void loadDataKeys()
}

/** Stages picked objects into the workspace bucket under data/. */
async function stage(entry: TesDataRefEntry) {
  if (!session.jobId.value) return
  const active = current()
  const cellId = notebook.activeCellId.value
  const items =
    entry.kind === 'file'
      ? (() => {
          const parsed = parseS3Url(entry.url)
          return parsed
            ? [{ bucket: parsed.bucket, key: parsed.key, dest_key: `${NOTEBOOK_DATA_PREFIX}${entry.name}` }]
            : []
        })()
      : entry.files.map((file) => ({
          bucket: entry.bucket,
          key: file.key,
          dest_key: `${NOTEBOOK_DATA_PREFIX}${entry.name}/${file.name}`,
        }))
  if (!items.length) return
  staging.value = true
  stageNote.value = null
  try {
    const result = await addSessionInputs(session.jobId.value, items, session.client.value)
    if (!active()) return
    const staged = result.staged.length
    if (staged) panelRevision.value += 1
    if (cellId && staged) {
      notebook.noteCellInputs(
        cellId,
        result.staged.map((file) => ({
          dest_key: file.dest_key,
          source_node_id: file.source_node_id,
          version_id: file.version_id,
          blake3: file.blake3,
        })),
      )
    }
    stageNote.value = staged
      ? `${staged} of ${items.length} files are now in ${bucket.value}.${cellId ? '' : ' Select a cell first to record them on it.'}`
      : 'The copy was started; the files appear in the bucket when they land.'
  } catch (cause) {
    if (!active()) return
    stageNote.value = errorMessage(cause)
  } finally {
    if (active()) staging.value = false
  }
}
</script>

<template>
  <aside class="surface min-w-0 overflow-hidden">
    <header class="flex h-12 items-center gap-1 border-b border-border" :class="collapsed ? 'px-2' : 'px-4'">
      <h2 v-if="!collapsed" class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">Files</h2>
      <IconButton v-if="!collapsed && session.live.value" label="Add files" :disabled="staging" @click="addOpen = true">
        <Plus class="size-4" />
      </IconButton>
      <IconButton v-if="!collapsed && bucket" label="Import into data/" @click="importOpen = true; loadDataKeys()">
        <CloudDownload class="size-4" />
      </IconButton>
      <IconButton :label="collapsed ? 'Expand files' : 'Collapse files'" :aria-expanded="!collapsed" @click="emit('toggle')"><PanelLeft class="size-4" /></IconButton>
    </header>

    <div v-if="!collapsed" class="space-y-3 px-4 pb-4 pt-3">
      <Notice v-if="stageNote" tone="info">{{ stageNote }}</Notice>

      <div class="min-w-0 overflow-auto">
        <ObjectBrowserPanel v-if="bucket" :key="panelRevision" flush :bucket="bucket" :group-id="notebook.meta.value?.group_id" />
        <p v-else class="text-xs text-muted-foreground">This notebook has no workspace bucket yet.</p>
      </div>
    </div>

    <TesDataRefDialog v-model:open="addOpen" mode="input" :destination="`${bucket}/${NOTEBOOK_DATA_PREFIX}`" @add="stage" />

    <!-- The data manager's own import, pointed at the notebook's data folder. -->
    <AddDataDialog
      v-model:open="importOpen"
      :bucket="bucket"
      :prefix="NOTEBOOK_DATA_PREFIX"
      :group-id="notebook.meta.value?.group_id ?? null"
      :existing-keys="dataKeys"
      @staged="onImported"
    />

  </aside>
</template>
