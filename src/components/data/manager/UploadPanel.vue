<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import Notice from '@/components/ui/Notice.vue'
import type { DataManager } from '@/composables/useDataManager'
import { formatBytes } from '@/lib/utils'
import { ref } from 'vue'
import { Upload } from '@lucide/vue'

const props = defineProps<{ manager: DataManager }>()

const {
  bucket,
  s3Prefix,
  canWriteCurrentPrefix,
  writeRestrictionMessage,
  uploadRestrictionError,
  requestUpload,
  precheck,
  confirmPrecheckUpload,
} = props.manager

const fileInput = ref<HTMLInputElement | null>(null)
const stripDrag = ref(false)

function pickFiles() {
  if (!canWriteCurrentPrefix.value) return
  fileInput.value?.click()
}

function onFileInput(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.length) void requestUpload(Array.from(input.files))
  input.value = ''
}

function onStripDrop(event: DragEvent) {
  stripDrag.value = false
  if (!canWriteCurrentPrefix.value || !bucket.value || !event.dataTransfer?.files.length) return
  void requestUpload(Array.from(event.dataTransfer.files))
}
</script>

<template>
  <input ref="fileInput" type="file" multiple class="hidden" @change="onFileInput" />

  <!-- Persistent drop target: same upload path and guards as the
       toolbar Upload button. -->
  <button
    type="button"
    class="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-xs transition-colors"
    :class="canWriteCurrentPrefix ? (stripDrag ? 'border-primary bg-primary/[0.06] text-foreground' : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground') : 'cursor-not-allowed border-border text-muted-foreground opacity-60'"
    :disabled="!canWriteCurrentPrefix"
    :title="writeRestrictionMessage ?? 'Upload files'"
    @click="pickFiles"
    @dragover.prevent="stripDrag = true"
    @dragleave="stripDrag = false"
    @drop.prevent="onStripDrop"
  >
    <Upload class="h-4 w-4" />
    <span>{{ canWriteCurrentPrefix ? 'Drop files here to upload to' : 'Uploads are unavailable for' }} <span class="font-mono">{{ bucket }}/{{ s3Prefix }}</span></span>
  </button>
  <p v-if="uploadRestrictionError" class="mt-2 text-xs text-destructive">{{ uploadRestrictionError }}</p>

  <Dialog :open="precheck !== null" @update:open="(v: boolean) => { if (!v) precheck = null }">
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>Storage quota warning</DialogTitle>
        <DialogDescription>
          This upload would push the group past its storage quota. The check is advisory, you can still upload.
        </DialogDescription>
      </DialogHeader>
      <div v-if="precheck" class="space-y-2 text-xs">
        <Notice v-if="precheck.projected.state === 'over-ceiling'" tone="error">
          This upload adds <strong>{{ formatBytes(precheck.totalBytes) }}</strong> to a group already using
          <strong>{{ formatBytes(precheck.current.usedBytes) }}</strong>. It would exceed the group's hard cap of
          <strong>{{ formatBytes(precheck.projected.ceilingBytes ?? 0) }}</strong>, the node rejects writes above the cap with <code>QuotaExceeded</code>.
        </Notice>
        <Notice v-else tone="warning">
          This upload adds <strong>{{ formatBytes(precheck.totalBytes) }}</strong> to a group already using
          <strong>{{ formatBytes(precheck.current.usedBytes) }}</strong>. It crosses the group quota of
          <strong>{{ formatBytes(precheck.projected.quotaBytes ?? 0) }}</strong> into the grace headroom. Uploads still succeed until the hard cap of
          <strong>{{ formatBytes(precheck.projected.ceilingBytes ?? 0) }}</strong>.
        </Notice>
        <p class="text-muted-foreground">Counters on remote nodes can lag, so these numbers are approximate.</p>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="precheck = null">Cancel</Button>
        <Button @click="confirmPrecheckUpload">Upload anyway</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
