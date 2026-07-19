<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Dialog from '@/components/ui/Dialog.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Button from '@/components/ui/Button.vue'
import ObjectBrowserPanel from '@/components/data/ObjectBrowserPanel.vue'
import CreateCredentialDialog from '@/components/data/CreateCredentialDialog.vue'
import { useS3, type FolderEntry, type ObjectEntry } from '@/composables/useS3'
import { useAruna } from '@/composables/useAruna'
import { Database, KeyRound, LogIn, Plus, ShieldAlert } from '@lucide/vue'

const props = defineProps<{ open: boolean; mode: 'input' }>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'add', entry: { url: string; path: string; name?: string }): void
}>()

const s3 = useS3()
const { currentUser } = useAruna()
const credentialDialogOpen = ref(false)

// Folder staging: the TES facade stages FILE inputs only, so a folder pick is
// expanded client-side into one input per object under the browsed prefix.
const MAX_FOLDER_FILES = 200
const folderBusy = ref(false)
const folderError = ref<string | null>(null)

async function addSelection(selection: {
  bucket: string
  objects: ObjectEntry[]
  folders: FolderEntry[]
}) {
  if (!selection.bucket || folderBusy.value) return
  folderBusy.value = true
  folderError.value = null
  try {
    const files = new Map(
      selection.objects.map((object) => [object.key, { key: object.key, name: object.name }]),
    )
    for (const folder of selection.folders) {
      const result = await s3.listObjectsRecursive(selection.bucket, folder.prefix, MAX_FOLDER_FILES)
      if (result.truncated) {
        folderError.value = `A selected folder holds more than ${MAX_FOLDER_FILES} files. Select a smaller folder.`
        return
      }
      for (const object of result.objects) {
        if (!files.has(object.key)) {
          files.set(object.key, { key: object.key, name: `${folder.name}/${object.name}` })
        }
      }
    }
    if (files.size > MAX_FOLDER_FILES) {
      folderError.value = `Select at most ${MAX_FOLDER_FILES} files in one batch.`
      return
    }
    if (!files.size) {
      folderError.value = 'The selection contains no files.'
      return
    }
    for (const file of files.values()) {
      emit('add', {
        url: `s3://${selection.bucket}/${file.key}`,
        path: `/inputs/${file.name}`,
        name: file.name,
      })
    }
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
        <ObjectBrowserPanel selectable @add="addSelection" />
        <p v-if="folderBusy" class="mt-2 text-[11px] text-muted-foreground">Expanding selected folders…</p>
        <p v-if="folderError" class="mt-2 text-[11px] text-destructive">{{ folderError }}</p>
      </template>

      <p class="text-[11px] text-muted-foreground">
        External sources (S3, HTTP, WebDAV, FTP) are referenced into a bucket first: in the
        <RouterLink :to="{ name: 'buckets' }" class="font-medium text-primary hover:underline">Data section</RouterLink>,
        use Add data &gt; From connector with the Reference strategy, then pick the referenced objects here.
      </p>

      <DialogFooter>
        <DialogClose><Button variant="outline">Close</Button></DialogClose>
      </DialogFooter>

      <CreateCredentialDialog v-model:open="credentialDialogOpen" />
    </DialogContent>
  </Dialog>
</template>
