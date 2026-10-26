<script setup lang="ts">
// Download and a small preview for a file that a dataset names only by its global version id.
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue'
import ImagePreview from '@/components/preview/ImagePreview.vue'
import DetailDialog from '@/components/ui/DetailDialog.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useAruna } from '@/composables/useAruna'
import { classifyObject } from '@/composables/useObjectPreview'
import { readCapped, type VersionStream } from '@/lib/api/resolve'
import { errorMessage, formatBytes } from '@/lib/utils'
import { Download, Eye } from '@lucide/vue'

const props = defineProps<{ realmId: string; versionId: string; name: string; size?: number; contentType?: string }>()

const TextPreview = defineAsyncComponent(() => import('@/components/preview/TextPreview.vue'))
const MarkdownPreview = defineAsyncComponent(() => import('@/components/preview/MarkdownPreview.vue'))

const PREVIEW_CAP = 2 * 1024 * 1024

type SaveHandle = { createWritable(): Promise<WritableStream<Uint8Array>> }
type SavePicker = (options: { suggestedName: string }) => Promise<SaveHandle>

const { resolveVersion, sessionEpoch } = useAruna()
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

// Work for another version, another session, a closed dialog or an earlier click never shows its bytes.
let runs = 0
let running: AbortController | null = null
function invalidate() {
  runs++
  running?.abort()
  running = null
  busy.value = false
  failure.value = null
  open.value = false
  release()
}
watch(() => [props.realmId, props.versionId, sessionEpoch.value], invalidate)
onBeforeUnmount(invalidate)

function begin() {
  const run = ++runs
  const { realmId, versionId } = props
  const epoch = sessionEpoch.value
  running = new AbortController()
  const current = () => run === runs && epoch === sessionEpoch.value && realmId === props.realmId && versionId === props.versionId
  return { realmId, versionId, signal: running.signal, current }
}

// A browser that can write a chosen file takes the stream straight to disk. Others have no way to
// save a bearer-token request without holding it, so the caller collects it in a Blob instead.
async function saveToFile(version: VersionStream, job: ReturnType<typeof begin>): Promise<boolean> {
  const pick = (globalThis as { showSaveFilePicker?: SavePicker }).showSaveFilePicker
  if (!pick) return false
  let handle: SaveHandle
  try {
    handle = await pick({ suggestedName: props.name })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      await version.body.cancel()
      return true
    }
    return false
  }
  const writable = await handle.createWritable()
  if (!job.current()) {
    await Promise.all([version.body.cancel(), writable.abort()])
    return true
  }
  await version.body.pipeTo(writable, { signal: job.signal })
  return true
}

async function download() {
  if (busy.value) return
  busy.value = true
  failure.value = null
  const job = begin()
  try {
    const version = await resolveVersion(job.realmId, job.versionId, job.signal)
    if (!job.current()) {
      await version.body.cancel()
      return
    }
    if (await saveToFile(version, job)) return
    const blob = await new Response(version.body).blob()
    if (!job.current()) return
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = props.name
    anchor.rel = 'noopener'
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (cause) {
    if (job.current()) failure.value = errorMessage(cause)
  } finally {
    if (job.current()) busy.value = false
  }
}

async function preview() {
  if (busy.value) return
  busy.value = true
  failure.value = null
  release()
  open.value = true
  const job = begin()
  try {
    const version = await resolveVersion(job.realmId, job.versionId, job.signal)
    if (!job.current()) {
      await version.body.cancel()
      return
    }
    const blob = await readCapped(version, PREVIEW_CAP)
    if (!job.current()) return
    if (!blob) {
      failure.value = `This file is above the ${formatBytes(PREVIEW_CAP)} preview limit. Download it instead.`
    } else if (kind.value.kind === 'image') {
      imageUrl.value = URL.createObjectURL(blob)
    } else {
      const content = await blob.text()
      if (job.current()) text.value = content
    }
  } catch (cause) {
    if (job.current()) failure.value = errorMessage(cause)
  } finally {
    if (job.current()) busy.value = false
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
  <DetailDialog v-model:open="open" @update:open="open || invalidate()">
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
