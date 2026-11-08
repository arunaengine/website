<script setup lang="ts">
// Confirms a ZIP download of the ticked files and folders, then opens the single-use link of the
// bucket's node in the browser. Folder sizes stay unknown: the node lists folders while it sends.
import Button from '@/components/ui/Button.vue'
import DetailList from '@/components/ui/DetailList.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import ListPager from '@/components/ui/ListPager.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import ObjectIcon from '@/components/data/ObjectIcon.vue'
import { archiveLink } from '@/composables/aruna/storage'
import type { FolderEntry, ObjectEntry } from '@/composables/useS3'
import { ApiError, apiErrorMessage } from '@/lib/api'
import { archiveEntries, selectedText } from '@/lib/objectListing'
import { formatBytes } from '@/lib/utils'
import { Download } from '@lucide/vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  bucket: string
  prefix: string
  nodeId: string | null
  nodeName: string
  files: ObjectEntry[]
  folders: FolderEntry[]
  distributed: boolean
}>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void; (e: 'started'): void }>()

const busy = ref(false)
const error = ref<string | null>(null)
const page = ref(1)
const pageSize = ref(10)
// Grows on every open, close and unmount, so a link that answers after the dialog closed or the
// page left it is never opened; the tab opened for it closes at once.
let round = 0
let pendingTab: Window | null = null
function endRound() {
  round++
  pendingTab?.close()
  pendingTab = null
}
onBeforeUnmount(endRound)

watch(
  () => props.open,
  () => {
    endRound()
    busy.value = false
    error.value = null
    page.value = 1
  },
)

const details = computed(() => [
  { label: 'Selected', value: selectedText(props.files.length, props.folders.length) },
  { label: 'File name', value: 'selection.zip', mono: true },
  { label: 'Versions', value: 'The current version of each file' },
  { label: 'Format', value: 'ZIP, files not compressed' },
])
const rows = computed(() => [
  ...props.folders.map((folder) => ({ id: folder.prefix, name: `${folder.name}/`, folder: true, size: 'Whole folder' })),
  ...props.files.map((file) => ({
    id: file.key,
    name: file.name,
    folder: false,
    size: file.size !== undefined ? formatBytes(file.size) : '',
  })),
])
const shownRows = computed(() => rows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))

function failure(cause: unknown): string {
  if (cause instanceof ApiError && cause.status === 503 && cause.message === 'download_capacity') {
    return 'The node is busy with other downloads. Try again in a moment.'
  }
  return apiErrorMessage(cause)
}

async function confirm() {
  if (busy.value) return
  error.value = null
  // Its own tab, so a refused GET shows there and never replaces the portal; the node's
  // `frame-src blob:` rules out a hidden frame. It opens during the click, before the request,
  // so a slow request cannot lose the click to the popup blocker.
  const tab = window.open('about:blank', '_blank')
  if (!tab) {
    error.value = 'Your browser blocked the download window. Allow pop-ups for this site, then try again.'
    return
  }
  tab.opener = null
  const mine = ++round
  pendingTab = tab
  busy.value = true
  try {
    const entries = archiveEntries(props.bucket, props.files.map((file) => file.key), props.folders.map((folder) => folder.prefix))
    const url = await archiveLink(entries, props.nodeId)
    if (mine !== round) return void tab.close()
    tab.location.href = url
    pendingTab = null
    busy.value = false
    emit('update:open', false)
    emit('started')
  } catch (cause) {
    tab.close()
    if (mine !== round) return
    pendingTab = null
    busy.value = false
    error.value = failure(cause)
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Download as ZIP</DialogTitle>
        <DialogDescription><span class="break-all font-mono text-xs">{{ bucket }}/{{ prefix }}</span> on {{ nodeName }}.</DialogDescription>
      </DialogHeader>
      <DetailList :items="details" />
      <div class="overflow-hidden rounded-md border border-border">
        <table class="w-full text-xs">
          <thead class="text-muted-foreground">
            <tr class="border-b border-border">
              <th class="px-3 py-2 text-left font-medium">Selected</th>
              <th class="px-3 py-2 text-right font-medium">Size</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in shownRows" :key="row.id" class="border-b border-border last:border-b-0">
              <td class="px-3 py-2">
                <span class="flex min-w-0 items-center gap-2">
                  <ObjectIcon :name="row.name" :folder="row.folder" class="h-4 w-4 shrink-0" />
                  <span class="min-w-0 truncate text-foreground">{{ row.name }}</span>
                </span>
              </td>
              <td class="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">{{ row.size }}</td>
            </tr>
          </tbody>
        </table>
        <ListPager v-if="rows.length > 10" v-model:page="page" v-model:page-size="pageSize" :total="rows.length" class="border-t border-border" />
      </div>
      <Notice>
        <ul class="list-disc space-y-0.5 pl-4">
          <li>Each file keeps its path, starting with the bucket name.</li>
          <li>The last file, <span class="font-mono">_report.json</span>, lists what was left out or renamed, and why.</li>
          <li v-if="distributed">Files read from an older copy are listed there too.</li>
        </ul>
      </Notice>
      <Notice v-if="error" tone="error">{{ error }}</Notice>
      <DialogFooter>
        <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
        <Button :disabled="busy" @click="confirm">
          <Spinner v-if="busy" label="Asking the node for a link…" />
          <Download v-else class="size-4" />
          Download
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
