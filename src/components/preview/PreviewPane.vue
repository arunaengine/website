<script setup lang="ts">
import { defineAsyncComponent, watch } from 'vue'
import { asyncChunkError } from '@/lib/chunk-recovery'
import Sheet from '@/components/ui/Sheet.vue'
import SheetContent from '@/components/ui/SheetContent.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Button from '@/components/ui/Button.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import { useObjectPreview } from '@/composables/useObjectPreview'
import { useS3, s3ErrorMessage } from '@/composables/useS3'
import { formatBytes } from '@/lib/utils'
import { Download, Loader2, ShieldAlert } from '@lucide/vue'

const props = defineProps<{
  open: boolean
  bucket: string
  objectKey: string
  name: string
  size?: number
  contentType?: string
}>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>()

// Viewer deps (CodeMirror, markdown-it, papaparse, native players) stay in
// dynamic chunks fetched only when their kind is shown.
const TextPreview = defineAsyncComponent({ loader: () => import('./TextPreview.vue'), onError: asyncChunkError })
const MarkdownPreview = defineAsyncComponent({ loader: () => import('./MarkdownPreview.vue'), onError: asyncChunkError })
const CsvPreview = defineAsyncComponent(() => import('./CsvPreview.vue'))
const ImagePreview = defineAsyncComponent(() => import('./ImagePreview.vue'))
const MediaPreview = defineAsyncComponent(() => import('./MediaPreview.vue'))
const PdfPreview = defineAsyncComponent(() => import('./PdfPreview.vue'))
const DownloadCard = defineAsyncComponent(() => import('./DownloadCard.vue'))

const s3 = useS3()
const preview = useObjectPreview()

function reload() {
  if (!props.objectKey) return
  void preview.load({
    bucket: props.bucket,
    key: props.objectKey,
    size: props.size,
    contentType: props.contentType,
  })
}

watch(
  () => [props.open, props.objectKey] as const,
  ([open]) => {
    if (open && props.objectKey) reload()
    else preview.reset()
  },
  { immediate: true },
)

async function download() {
  if (!props.objectKey) return
  try {
    const url = preview.directUrl.value ?? (await s3.downloadUrl(props.bucket, props.objectKey))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = props.name
    anchor.rel = 'noopener'
    anchor.click()
  } catch (err) {
    preview.errorMessage.value = s3ErrorMessage(err)
    preview.status.value = 'error'
  }
}
</script>

<template>
  <Sheet :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <SheetContent side="right" class="flex w-full flex-col p-6 sm:max-w-3xl">
      <div class="flex items-start justify-between gap-3 pr-8">
        <div class="min-w-0">
          <DialogTitle class="truncate text-base font-semibold text-foreground" :title="props.name">
            {{ props.name || 'Preview' }}
          </DialogTitle>
          <p class="mt-0.5 font-mono text-[11px] text-muted-foreground">
            <span class="break-all">{{ props.bucket }}/{{ props.objectKey }}</span>
            <span v-if="props.size !== undefined"> · {{ formatBytes(props.size) }}</span>
          </p>
        </div>
        <Button variant="outline" size="sm" class="shrink-0" @click="download">
          <Download class="h-4 w-4" /> Download
        </Button>
      </div>

      <div class="mt-4 min-h-0 flex-1 overflow-auto">
        <div
          v-if="preview.status.value === 'loading'"
          class="flex items-center gap-2 py-10 text-sm text-muted-foreground"
        >
          <Loader2 class="h-4 w-4 animate-spin" /> Loading preview…
        </div>

        <div
          v-else-if="preview.status.value === 'error' && preview.corsBlocked.value"
          class="surface flex flex-col items-center gap-3 border-amber-500/30 bg-amber-500/5 px-5 py-10 text-center"
        >
          <ShieldAlert class="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <p class="text-sm font-medium text-amber-900 dark:text-amber-200">This object could not be fetched for preview.</p>
          <p class="max-w-md text-xs text-amber-800/90 dark:text-amber-300/90">
            The bucket does not allow this portal's origin to read objects in the browser (CORS). Downloading the
            file still works.
          </p>
          <Button variant="outline" size="sm" @click="download"><Download class="h-4 w-4" /> Download</Button>
        </div>

        <ErrorPanel
          v-else-if="preview.status.value === 'error'"
          :message="preview.errorMessage.value ?? 'This object could not be previewed.'"
          @retry="reload"
        />

        <template v-else-if="preview.status.value === 'ready'">
          <TextPreview
            v-if="preview.kind.value === 'text' && preview.text.value !== null"
            :text="preview.text.value"
            :language="preview.language.value"
          />
          <MarkdownPreview
            v-else-if="preview.kind.value === 'markdown' && preview.text.value !== null"
            :text="preview.text.value"
          />
          <CsvPreview
            v-else-if="preview.kind.value === 'table' && preview.text.value !== null"
            :text="preview.text.value"
            :delimiter="preview.delimiter.value"
          />
          <ImagePreview
            v-else-if="preview.kind.value === 'image' && preview.objectUrl.value"
            :url="preview.objectUrl.value"
            :name="props.name"
          />
          <MediaPreview
            v-else-if="preview.kind.value === 'media' && preview.directUrl.value"
            :url="preview.directUrl.value"
            :media-kind="preview.mediaKind.value"
            :name="props.name"
          />
          <PdfPreview
            v-else-if="preview.kind.value === 'pdf' && preview.directUrl.value"
            :url="preview.directUrl.value"
            :name="props.name"
          />
          <DownloadCard
            v-else
            :name="props.name"
            :size="props.size"
            :note="preview.sizeNote.value"
            @download="download"
          />
        </template>
      </div>
    </SheetContent>
  </Sheet>
</template>
