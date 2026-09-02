<script setup lang="ts">
// The preview itself: origin line, download, and the viewer for the object's
// kind. Both the standalone preview dialog and the file details view mount it,
// so an object is previewed the same way wherever it is opened.
import { defineAsyncComponent, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { asyncChunkError } from '@/lib/chunk-recovery'
import Button from '@/components/ui/Button.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useObjectPreview } from '@/composables/useObjectPreview'
import { useS3, s3ErrorMessage } from '@/composables/useS3'
import { Download, Link2, ShieldAlert } from '@lucide/vue'

const props = defineProps<{
  active: boolean
  bucket: string
  objectKey: string
  name: string
  size?: number
  contentType?: string
  /** Node hosting the bucket; null/absent = the connected node. */
  nodeId?: string | null
  /** A specific version; absent shows the current one. */
  versionId?: string | null
  /**
   * Resolved reference origin. connectorId + groupId make the label a deep
   * link into the owning group's Data sources tab; a bare originNodeId links
   * to that node's Status detail instead.
   */
  referencedFrom?: {
    label: string
    connectorId?: string | null
    groupId?: string | null
    originNodeId?: string | null
  } | null
  /** HeadObject fallback when no listing resolves the origin. */
  probeReference?: boolean
}>()

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
    versionId: props.versionId ?? undefined,
  }
  void preview.load(target)
  // After load(): its reset() would drop an earlier-started probe.
  if (props.probeReference && !props.referencedFrom) void preview.probeReferenced(target)
}

watch(
  () => [props.active, props.objectKey, props.versionId] as const,
  ([active]) => {
    if (active && props.objectKey) reload()
    else preview.reset()
  },
  { immediate: true },
)

async function download() {
  if (!props.objectKey) return
  try {
    const url =
      preview.directUrl.value
      ?? (await s3.downloadUrl(
        props.bucket,
        props.objectKey,
        props.nodeId,
        props.versionId ?? undefined,
        props.name,
      ))
    // In the document, not detached: a detached anchor is ignored by some
    // browsers, and the name travels in the response's Content-Disposition.
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = props.name
    anchor.rel = 'noopener'
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
  } catch (err) {
    preview.errorMessage.value = s3ErrorMessage(err)
    preview.status.value = 'error'
  }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p
        v-if="props.referencedFrom || preview.referenced.value"
        class="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground"
      >
        <Link2 class="h-3 w-3 shrink-0 text-primary/70" />
        <span v-if="props.referencedFrom" class="truncate" :title="`Referenced from ${props.referencedFrom.label}`">
          Referenced from
          <RouterLink
            v-if="props.referencedFrom.connectorId && props.referencedFrom.groupId"
            :to="{ name: 'group', params: { id: props.referencedFrom.groupId }, query: { tab: 'sources', connector: props.referencedFrom.connectorId } }"
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
      <span v-else />
      <Button variant="outline" size="sm" class="shrink-0" @click="download">
        <Download class="h-4 w-4" /> Download
      </Button>
    </div>

    <Spinner
      v-if="preview.status.value === 'loading'"
      show-label
      label="Loading preview…"
      class="flex py-10 text-sm"
    />

    <Notice
      v-else-if="preview.status.value === 'error' && preview.corsBlocked.value"
      tone="warning"
      class="flex flex-col items-center gap-3 px-5 py-10 text-center"
    >
      <ShieldAlert class="h-5 w-5" aria-hidden="true" />
      <p class="text-sm font-medium">This object could not be fetched for preview.</p>
      <p class="max-w-md">
        The bucket does not allow this portal's origin to read objects in the browser (CORS). Downloading the
        file still works.
      </p>
      <Button variant="outline" size="sm" @click="download"><Download class="h-4 w-4" /> Download</Button>
    </Notice>

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
</template>
