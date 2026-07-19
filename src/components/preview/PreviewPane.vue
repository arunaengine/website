<script setup lang="ts">
import { defineAsyncComponent, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { asyncChunkError } from '@/lib/chunk-recovery'
import DetailDialog from '@/components/ui/DetailDialog.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Button from '@/components/ui/Button.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import { useObjectPreview } from '@/composables/useObjectPreview'
import { useS3, s3ErrorMessage } from '@/composables/useS3'
import { formatBytes } from '@/lib/utils'
import { Download, Link2, Loader2, ShieldAlert } from '@lucide/vue'

const props = defineProps<{
  open: boolean
  bucket: string
  objectKey: string
  name: string
  size?: number
  contentType?: string
  /** Node hosting the bucket; null/absent = the connected node. */
  nodeId?: string | null
  /**
   * Resolved reference origin ("connector <name> on node <label> · <path>",
   * "node <label>"). connectorId + groupId make the label a deep link into
   * the owning group's Data sources tab; a bare originNodeId (native
   * references carry no connector) links to the node's Status detail instead.
   */
  referencedFrom?: {
    label: string
    connectorId?: string | null
    groupId?: string | null
    originNodeId?: string | null
  } | null
  /**
   * HeadObject fallback when no listing resolves the origin: probe the single
   * previewed object for reference metadata and show a source-less marker.
   */
  probeReference?: boolean
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
  const target = {
    bucket: props.bucket,
    key: props.objectKey,
    size: props.size,
    contentType: props.contentType,
    nodeId: props.nodeId,
  }
  void preview.load(target)
  // After load(): its reset() would drop an earlier-started probe.
  if (props.probeReference && !props.referencedFrom) void preview.probeReferenced(target)
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
    const url = preview.directUrl.value ?? (await s3.downloadUrl(props.bucket, props.objectKey, props.nodeId))
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
  <DetailDialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
      <div class="flex items-start justify-between gap-3 pr-8">
        <div class="min-w-0">
          <DialogTitle class="truncate text-base font-semibold text-foreground" :title="props.name">
            {{ props.name || 'Preview' }}
          </DialogTitle>
          <p class="mt-0.5 font-mono text-[11px] text-muted-foreground">
            <span class="break-all">{{ props.bucket }}/{{ props.objectKey }}</span>
            <span v-if="props.size !== undefined"> · {{ formatBytes(props.size) }}</span>
          </p>
          <p
            v-if="props.referencedFrom || preview.referenced.value"
            class="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"
          >
            <Link2 class="h-3 w-3 shrink-0 text-primary/70" />
            <span v-if="props.referencedFrom" class="truncate" :title="`Referenced from ${props.referencedFrom.label}`">
              Referenced from
              <RouterLink
                v-if="props.referencedFrom.connectorId && props.referencedFrom.groupId"
                :to="{ name: 'groups', params: { id: props.referencedFrom.groupId }, query: { tab: 'sources', connector: props.referencedFrom.connectorId } }"
                class="text-primary hover:underline"
                title="Open the connector in its group"
              >
                {{ props.referencedFrom.label }}
              </RouterLink>
              <RouterLink
                v-else-if="props.referencedFrom.originNodeId"
                :to="{ name: 'status', query: { node: props.referencedFrom.originNodeId } }"
                class="text-primary hover:underline"
                title="Open the node on the Status page"
              >
                {{ props.referencedFrom.label }}
              </RouterLink>
              <template v-else>{{ props.referencedFrom.label }}</template>
            </span>
            <span v-else>Referenced (external source)</span>
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
  </DetailDialog>
</template>
