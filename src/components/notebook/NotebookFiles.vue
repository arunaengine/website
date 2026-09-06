<script setup lang="ts">
// The files beside the notebook: the workspace bucket it reads and writes, and
// the scratch folder inside the running container. "Add more" copies stored
// objects into the workspace bucket, so nothing is copied into the container.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import ObjectBrowserPanel from '@/components/data/ObjectBrowserPanel.vue'
import TesDataRefDialog from '@/components/compute/TesDataRefDialog.vue'
import { injectNotebook } from '@/composables/notebookContext'
import { addSessionInputs, listScratch, type ScratchEntry } from '@/lib/notebook/session'
import { NOTEBOOK_DATA_PREFIX } from '@/lib/notebook/document'
import { parseS3Url, type TesDataRefEntry } from '@/lib/tes'
import { errorMessage, formatBytes } from '@/lib/utils'
import { FolderTree, Plus, RefreshCw } from '@lucide/vue'

const { notebook, session } = injectNotebook()

const tab = ref('bucket')
const tabs = [
  { value: 'bucket', label: 'Bucket' },
  { value: 'scratch', label: 'Scratch' },
]
const addOpen = ref(false)
const scratchPath = ref('')
const scratch = ref<ScratchEntry[]>([])
const scratchError = ref<string | null>(null)
const staging = ref(false)
const stageNote = ref<string | null>(null)

const bucket = computed(() => notebook.meta.value?.workspace_bucket ?? '')

async function loadScratch() {
  if (!session.jobId.value || !session.live.value) return
  scratchError.value = null
  try {
    const listing = await listScratch(session.jobId.value, scratchPath.value, session.client.value)
    scratch.value = listing.entries
  } catch (cause) {
    scratchError.value = errorMessage(cause)
  }
}

watch([() => session.live.value, tab, scratchPath], () => {
  if (tab.value === 'scratch') void loadScratch()
})

function openFolder(entry: ScratchEntry) {
  if (entry.kind !== 'dir') return
  scratchPath.value = scratchPath.value ? `${scratchPath.value}/${entry.name}` : entry.name
}

function up() {
  scratchPath.value = scratchPath.value.split('/').slice(0, -1).join('/')
}

/** Stages picked objects into the workspace bucket under data/. */
async function stage(entry: TesDataRefEntry) {
  if (!session.jobId.value) return
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
    const staged = result.staged.length
    stageNote.value = staged
      ? `${staged} of ${items.length} files are now in ${bucket.value}.`
      : 'The copy was started; the files appear in the bucket when they land.'
  } catch (cause) {
    stageNote.value = errorMessage(cause)
  } finally {
    staging.value = false
  }
}
</script>

<template>
  <aside class="flex min-h-0 flex-col gap-2">
    <div class="flex items-center gap-2">
      <OptionToggle v-model="tab" :options="tabs" aria-label="Files" />
      <span class="flex-1" />
      <Button
        v-if="session.live.value"
        variant="outline"
        size="sm"
        :disabled="staging"
        @click="addOpen = true"
      >
        <Plus class="size-3.5" /> Add more
      </Button>
    </div>

    <Notice v-if="stageNote" tone="info">{{ stageNote }}</Notice>

    <div v-if="tab === 'bucket'" class="min-h-0 flex-1 overflow-auto">
      <ObjectBrowserPanel v-if="bucket" :bucket="bucket" />
      <p v-else class="text-xs text-muted-foreground">This notebook has no workspace bucket yet.</p>
    </div>

    <div v-else class="min-h-0 flex-1 space-y-2 overflow-auto">
      <div class="flex items-center gap-2 text-[11px] text-muted-foreground">
        <FolderTree class="size-3.5" />
        <span class="truncate font-mono">{{ scratchPath || 'the working directory' }}</span>
        <span class="flex-1" />
        <Button v-if="scratchPath" variant="ghost" size="sm" @click="up">Up</Button>
        <Button variant="ghost" size="icon-sm" aria-label="Read the folder again" @click="loadScratch">
          <RefreshCw class="size-3.5" />
        </Button>
      </div>
      <Notice v-if="!session.live.value" tone="info">The scratch folder exists while a session runs.</Notice>
      <Notice v-else-if="scratchError" tone="error">{{ scratchError }}</Notice>
      <p v-else-if="!scratch.length" class="text-xs text-muted-foreground">This folder is empty.</p>
      <ul v-else class="space-y-1">
        <li v-for="entry in scratch" :key="entry.name">
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-muted"
            @click="openFolder(entry)"
          >
            <span class="min-w-0 flex-1 truncate font-mono">{{ entry.name }}{{ entry.kind === 'dir' ? '/' : '' }}</span>
            <span v-if="entry.kind === 'file'" class="shrink-0 text-[11px] text-muted-foreground">
              {{ formatBytes(entry.bytes) }}
            </span>
          </button>
        </li>
      </ul>
      <p class="text-[11px] text-muted-foreground">
        Scratch is the working directory of the container. Results belong in the bucket.
      </p>
    </div>

    <TesDataRefDialog v-model:open="addOpen" mode="input" @add="stage" />
  </aside>
</template>
