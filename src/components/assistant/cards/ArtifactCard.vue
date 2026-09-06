<script setup lang="ts">
// A stored object the assistant asked to show: the image itself, the text it
// holds, or a download row for bytes the browser cannot render.
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue'
import BucketLink from '@/components/assistant/BucketLink.vue'
import ImagePreview from '@/components/preview/ImagePreview.vue'
import ObjectLink from '@/components/assistant/ObjectLink.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { classifyObject } from '@/composables/useObjectPreview'
import { errorMessage, formatBytes, truncateMiddle } from '@/lib/utils'
import { ARTIFACT_TEXT_CAP } from '@/lib/assistant/types'
import type { ArtifactView } from '@/lib/assistant/types'
import type { LoadedArtifact } from '@/lib/assistant/renderTools'
import { Download, Eye, FileBox } from '@lucide/vue'

const props = defineProps<{ title: string; caption?: string; artifact: ArtifactView }>()

const TEXT_KINDS = new Set(['text', 'markdown', 'table'])

// The viewer dependencies stay in their own chunks, fetched only for the kind
// a card actually shows.
const TextPreview = defineAsyncComponent(() => import('@/components/preview/TextPreview.vue'))
const HtmlPreview = defineAsyncComponent(() => import('@/components/preview/HtmlPreview.vue'))
const MarkdownPreview = defineAsyncComponent(() => import('@/components/preview/MarkdownPreview.vue'))
const CsvPreview = defineAsyncComponent(() => import('@/components/preview/CsvPreview.vue'))

// A restored card holds the object's record but not its bytes; they are read
// again here and shown from `loaded`.
const loaded = ref<LoadedArtifact | null>(null)
const fetched = ref<string | null>(null)
const loading = ref(false)
const failed = ref<string | null>(null)
let readId = 0

const classified = computed(() => classifyObject({ key: props.artifact.name || props.artifact.key, contentType: props.artifact.contentType }))
// An artifact above the byte cap was never fetched, so it stays a download row.
const kind = computed(() =>
  loaded.value?.kind ?? (props.artifact.previewKind === 'download' ? 'download' : classified.value.kind))
const isText = computed(() => TEXT_KINDS.has(kind.value))
// An HTML report is shown as the page it is, never as its markup.
const isHtml = computed(() =>
  isText.value
  && (/\.x?html?$/i.test(props.artifact.name || props.artifact.key)
    || props.artifact.contentType.toLowerCase().startsWith('text/html')))
const delimiter = computed(() => (props.artifact.key.toLowerCase().endsWith('.tsv') ? '\t' : ','))
const url = computed(() => loaded.value?.url ?? props.artifact.url)
const size = computed(() => loaded.value?.size ?? props.artifact.size)
const contentType = computed(() => loaded.value?.contentType ?? props.artifact.contentType)
const isDownload = computed(() => kind.value !== 'image' && !isText.value)

// The bytes normally arrive with the card; a card without them reads the URL.
const text = computed(() => (isText.value ? props.artifact.text ?? loaded.value?.text ?? fetched.value : null))
// A stored card that has neither its URL nor its text reads the object again.
const needsObject = computed(() =>
  !props.artifact.url && props.artifact.previewKind !== 'download' && !(isText.value && props.artifact.text !== undefined))

function release(target: LoadedArtifact | null) {
  if (target?.url.startsWith('blob:')) URL.revokeObjectURL(target.url)
}

async function readText(target: string) {
  const id = ++readId
  loading.value = true
  failed.value = null
  fetched.value = null
  try {
    const response = await fetch(target)
    if (!response.ok) throw new Error(`This file could not be read (HTTP ${response.status}).`)
    const body = await response.text()
    if (id !== readId) return
    fetched.value = body.length > ARTIFACT_TEXT_CAP ? body.slice(0, ARTIFACT_TEXT_CAP) : body
  } catch (cause) {
    if (id === readId) failed.value = errorMessage(cause)
  } finally {
    if (id === readId) loading.value = false
  }
}

// The same read path and byte cap as the show_artifact tool.
async function readObject() {
  const id = ++readId
  loading.value = true
  failed.value = null
  try {
    const { loadArtifact } = await import('@/composables/useAssistantChat')
    const result = await loadArtifact({
      bucket: props.artifact.bucket,
      key: props.artifact.key,
      versionId: props.artifact.versionId,
      contentType: props.artifact.contentType || undefined,
      filename: props.artifact.name || undefined,
      size: props.artifact.size,
    })
    if (id !== readId) {
      release(result)
      return
    }
    loaded.value = result
  } catch (cause) {
    if (id === readId) failed.value = errorMessage(cause)
  } finally {
    if (id === readId) loading.value = false
  }
}

watch(
  () => [props.artifact.url, props.artifact.text, props.artifact.previewKind] as const,
  () => {
    ++readId
    release(loaded.value)
    loaded.value = null
    fetched.value = null
    failed.value = null
    loading.value = false
    if (needsObject.value) void readObject()
    else if (isText.value && props.artifact.text === undefined && props.artifact.url) void readText(props.artifact.url)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  ++readId
  release(loaded.value)
})
</script>

<template>
  <div class="surface-inline overflow-hidden text-xs">
    <div class="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5">
      <FileBox class="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <ObjectLink
        :bucket="artifact.bucket"
        :object-key="artifact.key"
        :name="artifact.name"
        :size="artifact.size"
        class="min-w-0 flex-1 truncate font-medium text-foreground hover:text-primary hover:underline"
        :title="`Open ${artifact.bucket}/${artifact.key}`"
      >{{ title }}</ObjectLink>
      <ObjectLink
        :bucket="artifact.bucket"
        :object-key="artifact.key"
        :name="artifact.name"
        :size="artifact.size"
        class="chip shrink-0 text-primary hover:bg-muted"
        title="Open the file viewer"
      >
        <Eye class="size-3 shrink-0" aria-hidden="true" />
        Open
      </ObjectLink>
    </div>
    <div class="space-y-2 px-3 py-2.5">
      <p v-if="caption" class="leading-relaxed text-foreground/85">{{ caption }}</p>

      <Spinner v-if="loading" label="Loading the file…" show-label />

      <ImagePreview v-else-if="kind === 'image' && !failed" :url="url" :name="artifact.name" />

      <template v-else-if="isText && !failed">
        <HtmlPreview v-if="text !== null && isHtml" :text="text" :name="artifact.name" />
        <CsvPreview v-else-if="text !== null && kind === 'table'" :text="text" :delimiter="delimiter" />
        <MarkdownPreview v-else-if="text !== null && kind === 'markdown'" :text="text" />
        <TextPreview v-else-if="text !== null" :text="text" :language="classified.language" />
      </template>

      <template v-else>
        <Notice v-if="failed" tone="error">{{ failed }}</Notice>
        <div class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
          <span class="min-w-0 flex-1 truncate font-medium text-foreground">{{ artifact.name }}</span>
          <span v-if="size !== undefined" class="font-mono text-[11px] text-muted-foreground">
            {{ formatBytes(size) }}
          </span>
          <a
            v-if="url && isDownload"
            :href="url"
            :download="artifact.name"
            class="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            <Download class="h-3.5 w-3.5" aria-hidden="true" /> Download
          </a>
          <ObjectLink
            v-else
            :bucket="artifact.bucket"
            :object-key="artifact.key"
            :name="artifact.name"
            :size="size"
            class="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            title="Open the file viewer"
          >
            <Eye class="h-3.5 w-3.5" aria-hidden="true" /> Open
          </ObjectLink>
        </div>
      </template>

      <p class="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
        <span class="break-all">
          <BucketLink
            :bucket="artifact.bucket"
            class="text-primary hover:underline"
            :title="`Open the bucket ${artifact.bucket}`"
          >{{ artifact.bucket }}</BucketLink>/<ObjectLink
            :bucket="artifact.bucket"
            :object-key="artifact.key"
            :name="artifact.name"
            :size="artifact.size"
            class="text-primary hover:underline"
          >{{ artifact.key }}</ObjectLink>
        </span>
        <span v-if="artifact.versionId">version {{ truncateMiddle(artifact.versionId) }}</span>
        <span v-if="artifact.jobId">job {{ artifact.jobId }}</span>
        <span v-if="size !== undefined">{{ formatBytes(size) }}</span>
        <span>{{ contentType }}</span>
      </p>
    </div>
  </div>
</template>
