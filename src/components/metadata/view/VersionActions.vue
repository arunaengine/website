<script setup lang="ts">
// Download and a small preview for a file that a dataset names only by its global version id.
import { computed, defineAsyncComponent, onBeforeUnmount, ref } from 'vue'
import ImagePreview from '@/components/preview/ImagePreview.vue'
import DetailDialog from '@/components/ui/DetailDialog.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useAruna } from '@/composables/useAruna'
import { classifyObject } from '@/composables/useObjectPreview'
import { errorMessage, formatBytes } from '@/lib/utils'
import { Download, Eye } from '@lucide/vue'

const props = defineProps<{ realmId: string; versionId: string; name: string; size?: number; contentType?: string }>()

const TextPreview = defineAsyncComponent(() => import('@/components/preview/TextPreview.vue'))
const MarkdownPreview = defineAsyncComponent(() => import('@/components/preview/MarkdownPreview.vue'))

const PREVIEW_CAP = 2 * 1024 * 1024

const { resolveVersion } = useAruna()
const busy = ref(false)
const failure = ref<string | null>(null)
const open = ref(false)
const text = ref<string | null>(null)
const imageUrl = ref<string | null>(null)

const kind = computed(() => classifyObject({ key: props.name, contentType: props.contentType }))
// Only a small file of a kind the viewers show; the size must be known before any bytes are read.
const canPreview = computed(
  () => props.size !== undefined && props.size <= PREVIEW_CAP && ['text', 'markdown', 'image'].includes(kind.value.kind),
)

function release() {
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  imageUrl.value = null
  text.value = null
}
onBeforeUnmount(release)

async function download() {
  if (busy.value) return
  busy.value = true
  failure.value = null
  try {
    const url = URL.createObjectURL(await resolveVersion(props.realmId, props.versionId))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = props.name
    anchor.rel = 'noopener'
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (cause) {
    failure.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}

async function preview() {
  if (busy.value) return
  busy.value = true
  failure.value = null
  release()
  open.value = true
  try {
    const blob = await resolveVersion(props.realmId, props.versionId)
    if (blob.size > PREVIEW_CAP) {
      failure.value = `This file is ${formatBytes(blob.size)}, above the ${formatBytes(PREVIEW_CAP)} preview limit. Download it instead.`
    } else if (kind.value.kind === 'image') {
      imageUrl.value = URL.createObjectURL(blob)
    } else {
      text.value = await blob.text()
    }
  } catch (cause) {
    failure.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <IconButton :label="`Download ${name}`" :disabled="busy" @click.stop="download">
    <Download class="size-3.5" />
  </IconButton>
  <IconButton v-if="canPreview" label="Preview" :disabled="busy" @click.stop="preview">
    <Eye class="size-3.5" />
  </IconButton>
  <p v-if="failure && !open" class="basis-full text-right text-[11px] text-destructive">{{ failure }}</p>
  <DetailDialog v-model:open="open" @update:open="open || release()">
    <template #header>
      <DialogTitle class="truncate text-base font-semibold text-foreground" :title="name">{{ name }}</DialogTitle>
    </template>
    <Spinner v-if="busy" label="Reading the file" />
    <Notice v-else-if="failure" tone="error">{{ failure }}</Notice>
    <ImagePreview v-else-if="imageUrl" :url="imageUrl" :name="name" />
    <MarkdownPreview v-else-if="text !== null && kind.kind === 'markdown'" :text="text" />
    <TextPreview v-else-if="text !== null" :text="text" :language="kind.language" />
  </DetailDialog>
</template>
