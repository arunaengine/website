<script setup lang="ts">
// A stored object the assistant asked to show: the image itself, the text it
// holds, or a download row for bytes the browser cannot render.
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import ImagePreview from '@/components/preview/ImagePreview.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { classifyObject } from '@/composables/useObjectPreview'
import { errorMessage, formatBytes, truncateMiddle } from '@/lib/utils'
import type { ArtifactView } from '@/lib/assistant/types'
import { Download, FileBox } from '@lucide/vue'

const props = defineProps<{ title: string; caption?: string; artifact: ArtifactView }>()

// Chat cards stay small; a longer file is read in the object browser.
const TEXT_CAP = 200_000
const TEXT_KINDS = new Set(['text', 'markdown', 'table'])

// The viewer dependencies stay in their own chunks, fetched only for the kind
// a card actually shows.
const TextPreview = defineAsyncComponent(() => import('@/components/preview/TextPreview.vue'))
const MarkdownPreview = defineAsyncComponent(() => import('@/components/preview/MarkdownPreview.vue'))
const CsvPreview = defineAsyncComponent(() => import('@/components/preview/CsvPreview.vue'))

const classified = computed(() => classifyObject({ key: props.artifact.name || props.artifact.key, contentType: props.artifact.contentType }))
// An artifact above the byte cap was never fetched, so it stays a download row.
const kind = computed(() => (props.artifact.previewKind === 'download' ? 'download' : classified.value.kind))
const isText = computed(() => TEXT_KINDS.has(kind.value))
const delimiter = computed(() => (props.artifact.key.toLowerCase().endsWith('.tsv') ? '\t' : ','))

const text = ref<string | null>(null)
const loading = ref(false)
const failed = ref<string | null>(null)
let readId = 0

async function readText(url: string) {
  const id = ++readId
  loading.value = true
  failed.value = null
  text.value = null
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`This file could not be read (HTTP ${response.status}).`)
    const body = await response.text()
    if (id !== readId) return
    text.value = body.length > TEXT_CAP ? body.slice(0, TEXT_CAP) : body
  } catch (cause) {
    if (id === readId) failed.value = errorMessage(cause)
  } finally {
    if (id === readId) loading.value = false
  }
}

watch(
  () => [props.artifact.url, isText.value] as const,
  () => {
    if (isText.value && props.artifact.url) {
      void readText(props.artifact.url)
      return
    }
    ++readId
    text.value = null
    failed.value = null
    loading.value = false
  },
  { immediate: true },
)
</script>

<template>
  <div class="surface-inline overflow-hidden text-xs">
    <div class="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5">
      <FileBox class="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span class="min-w-0 flex-1 truncate font-medium text-foreground" :title="artifact.key">{{ title }}</span>
    </div>
    <div class="space-y-2 px-3 py-2.5">
      <p v-if="caption" class="leading-relaxed text-foreground/85">{{ caption }}</p>

      <ImagePreview v-if="kind === 'image'" :url="artifact.url" :name="artifact.name" />

      <template v-else-if="isText">
        <Spinner v-if="loading" label="Reading the file…" show-label />
        <Notice v-else-if="failed" tone="error">{{ failed }}</Notice>
        <CsvPreview v-else-if="text !== null && kind === 'table'" :text="text" :delimiter="delimiter" />
        <MarkdownPreview v-else-if="text !== null && kind === 'markdown'" :text="text" />
        <TextPreview v-else-if="text !== null" :text="text" :language="classified.language" />
      </template>

      <div v-else class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
        <span class="min-w-0 flex-1 truncate font-medium text-foreground">{{ artifact.name }}</span>
        <span v-if="artifact.size !== undefined" class="font-mono text-[11px] text-muted-foreground">
          {{ formatBytes(artifact.size) }}
        </span>
        <a
          :href="artifact.url"
          :download="artifact.name"
          class="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          <Download class="h-3.5 w-3.5" aria-hidden="true" /> Download
        </a>
      </div>

      <p class="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
        <span class="break-all">{{ artifact.bucket }}/{{ artifact.key }}</span>
        <span v-if="artifact.versionId">version {{ truncateMiddle(artifact.versionId) }}</span>
        <span v-if="artifact.jobId">job {{ artifact.jobId }}</span>
        <span v-if="artifact.size !== undefined">{{ formatBytes(artifact.size) }}</span>
        <span>{{ artifact.contentType }}</span>
      </p>
    </div>
  </div>
</template>
