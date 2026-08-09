<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Dialog from '@/components/ui/Dialog.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import ObjectBrowserPanel from '@/components/data/ObjectBrowserPanel.vue'
import CreateCredentialDialog from '@/components/data/CreateCredentialDialog.vue'
import { useS3, type FolderEntry, type ObjectEntry } from '@/composables/useS3'
import { useAruna } from '@/composables/useAruna'
import {
  normalizeContainerDir,
  validContainerDir,
  type TesDataRefEntry,
} from '@/lib/tes'
import { Database, KeyRound, LogIn, Plus, ShieldAlert } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    mode: 'input'
    /** Default container directory the picks mount under. */
    mountDefault?: string
  }>(),
  { mountDefault: '/inputs/' },
)
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'add', entry: TesDataRefEntry): void
}>()

const s3 = useS3()
const { currentUser } = useAruna()
const credentialDialogOpen = ref(false)

// Folder handling: the TES facade stages FILE inputs only, so a folder pick is
// expanded here (for validation and the file cap) but emitted as ONE folder
// entry carrying its file list; consumers expand it again at task assembly.
const MAX_FOLDER_FILES = 200
const folderBusy = ref(false)
const folderError = ref<string | null>(null)

// "Mount under": the container directory every pick is staged below. Folders
// keep their name as a subdirectory of it.
const mountDir = ref(props.mountDefault)
const mountDirValid = computed(() => validContainerDir(mountDir.value))
const mountDirNormalized = computed(() => normalizeContainerDir(mountDir.value))

type Selection = { bucket: string; objects: ObjectEntry[]; folders: FolderEntry[] }
const pendingSelection = ref<Selection | null>(null)

// Directly selected objects that also sit under a selected folder ride along
// with the folder entry instead of doubling up.
function coveredByFolder(key: string, folders: FolderEntry[]): boolean {
  return folders.some((folder) => key.startsWith(folder.prefix))
}

const PREVIEW_LIMIT = 6
// Live preview of the container paths the current selection resolves to.
const previewPaths = computed<string[]>(() => {
  const selection = pendingSelection.value
  if (!selection || !mountDirValid.value) return []
  const mount = mountDirNormalized.value
  const lines: string[] = []
  for (const folder of selection.folders) lines.push(`${mount}${folder.name}/ (all files below)`)
  for (const object of selection.objects) {
    if (!coveredByFolder(object.key, selection.folders)) lines.push(`${mount}${object.name}`)
  }
  return lines
})

async function addSelection(selection: Selection) {
  if (!selection.bucket || folderBusy.value) return
  if (!mountDirValid.value) {
    folderError.value = 'Enter a valid absolute mount directory first, for example /work/in/.'
    return
  }
  folderBusy.value = true
  folderError.value = null
  try {
    const mount = mountDirNormalized.value
    const entries: TesDataRefEntry[] = []
    let total = 0
    for (const object of selection.objects) {
      if (coveredByFolder(object.key, selection.folders)) continue
      entries.push({
        kind: 'file',
        url: `s3://${selection.bucket}/${object.key}`,
        path: `${mount}${object.name}`,
        name: object.name,
      })
      total++
    }
    for (const folder of selection.folders) {
      const result = await s3.listObjectsRecursive(selection.bucket, folder.prefix, MAX_FOLDER_FILES)
      if (result.truncated) {
        folderError.value = `A selected folder holds more than ${MAX_FOLDER_FILES} files. Select a smaller folder.`
        return
      }
      if (!result.objects.length) {
        folderError.value = `The folder ${folder.name}/ contains no files.`
        return
      }
      total += result.objects.length
      entries.push({
        kind: 'folder',
        bucket: selection.bucket,
        prefix: folder.prefix,
        name: folder.name,
        basePath: `${mount}${folder.name}/`,
        files: result.objects.map((object) => ({ key: object.key, name: object.name })),
      })
    }
    if (total > MAX_FOLDER_FILES) {
      folderError.value = `Select at most ${MAX_FOLDER_FILES} files in one batch.`
      return
    }
    if (!entries.length) {
      folderError.value = 'The selection contains no files.'
      return
    }
    for (const entry of entries) emit('add', entry)
    emit('update:open', false)
  } catch (err) {
    folderError.value = err instanceof Error ? err.message : String(err)
  } finally {
    folderBusy.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    folderBusy.value = false
    folderError.value = null
    mountDir.value = props.mountDefault
    pendingSelection.value = null
  },
  { immediate: true },
)
</script>

<template>
  <Dialog :open="props.open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-w-3xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Database class="h-4 w-4 text-primary" /> Add input reference
        </DialogTitle>
        <DialogDescription>
          Select files and folders from this node's data. Selected folders include all files below them.
        </DialogDescription>
      </DialogHeader>

      <div v-if="!s3.endpoint.value" class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
        <ShieldAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>This node does not advertise an S3 endpoint, so its data cannot be browsed or referenced here.</span>
      </div>
      <div v-else-if="!s3.hasActiveKey.value" class="space-y-2 rounded-md border border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
        <p class="flex items-center gap-2 font-medium text-foreground"><KeyRound class="h-3.5 w-3.5" /> S3 credentials are required to browse node data.</p>
        <Button v-if="currentUser" variant="outline" size="sm" @click="credentialDialogOpen = true">
          <Plus class="size-3.5" /> Create credentials
        </Button>
        <p v-else class="flex items-center gap-2"><LogIn class="h-3.5 w-3.5" /> Sign in first to create credentials.</p>
      </div>
      <template v-else>
        <div class="max-w-sm">
          <label class="text-xs font-medium text-foreground">Mount under</label>
          <Input
            v-model="mountDir"
            class="mt-1 h-8 font-mono text-xs"
            placeholder="/work/in/"
            aria-label="Container mount directory"
            :invalid="!mountDirValid ? 'error' : undefined"
          />
          <p v-if="!mountDirValid" class="mt-1 text-[11px] text-destructive">
            Use an absolute directory path such as /work/in/.
          </p>
          <p v-else class="mt-1 text-[11px] text-muted-foreground">
            Selected files are staged below this container directory; folders keep their name as a subdirectory.
          </p>
        </div>
        <ObjectBrowserPanel selectable @add="addSelection" @selection-change="pendingSelection = $event" />
        <div v-if="previewPaths.length" class="rounded-md border border-border bg-muted/20 px-3 py-2">
          <p class="text-[11px] font-medium text-foreground">Will be staged as</p>
          <ul class="mt-1 space-y-0.5 font-mono text-[11px] text-muted-foreground">
            <li v-for="line in previewPaths.slice(0, PREVIEW_LIMIT)" :key="line" class="truncate" :title="line">{{ line }}</li>
            <li v-if="previewPaths.length > PREVIEW_LIMIT" class="font-sans">and {{ previewPaths.length - PREVIEW_LIMIT }} more</li>
          </ul>
        </div>
        <p v-if="folderBusy" class="mt-2 text-[11px] text-muted-foreground">Expanding selected folders…</p>
        <p v-if="folderError" class="mt-2 text-[11px] text-destructive">{{ folderError }}</p>
      </template>

      <p class="text-[11px] text-muted-foreground">
        External sources (S3, HTTP, WebDAV, FTP) are referenced into a bucket first: in the
        <RouterLink :to="{ name: 'buckets' }" class="font-medium text-primary hover:underline">Data section</RouterLink>,
        use Add data &gt; From connector with the Reference strategy, then pick the referenced objects here.
      </p>

      <DialogFooter>
        <DialogClose as-child><Button variant="outline">Close</Button></DialogClose>
      </DialogFooter>

      <CreateCredentialDialog v-model:open="credentialDialogOpen" />
    </DialogContent>
  </Dialog>
</template>
