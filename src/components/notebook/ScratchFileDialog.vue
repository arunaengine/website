<script setup lang="ts">
// One file from the container's working directory, read through the session and
// shown the way the portal shows a stored file of the same kind.
import { computed, onScopeDispose, ref, watch } from 'vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import HtmlPreview from '@/components/preview/HtmlPreview.vue'
import ImagePreview from '@/components/preview/ImagePreview.vue'
import TextPreview from '@/components/preview/TextPreview.vue'
import { readScratch } from '@/lib/notebook/session'
import type { ApiClientOptions } from '@/lib/api'
import { errorMessage } from '@/lib/utils'

const props = defineProps<{
  open: boolean
  jobId: string
  path: string
  client: ApiClientOptions
}>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const loading = ref(false)
const error = ref<string | null>(null)
const text = ref('')
const imageUrl = ref('')
const kind = ref<'text' | 'image' | 'html' | 'other'>('other')

const name = computed(() => props.path.split('/').filter(Boolean).pop() ?? props.path)

function release() {
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  imageUrl.value = ''
  text.value = ''
  error.value = null
}

async function load(active: () => boolean) {
  release()
  loading.value = true
  try {
    const file = await readScratch(props.jobId, props.path, props.client)
    if (!active()) return
    const type = file.contentType.split(';')[0].trim()
    const body = type.startsWith('text/') || type === 'application/json' ? await file.blob.text() : ''
    if (!active()) return
    if (type.startsWith('image/')) {
      kind.value = 'image'
      imageUrl.value = URL.createObjectURL(file.blob)
    } else if (type === 'text/html') {
      kind.value = 'html'
      text.value = body
    } else if (type.startsWith('text/') || type === 'application/json') {
      kind.value = 'text'
      text.value = body
    } else {
      kind.value = 'other'
    }
  } catch (cause) {
    if (!active()) return
    error.value = errorMessage(cause)
  } finally {
    if (active()) loading.value = false
  }
}

watch(
  () => [props.open, props.path, props.jobId, props.client.baseUrl, props.client.token] as const,
  ([open], _, onCleanup) => {
    let active = true
    onCleanup(() => { active = false })
    if (open && props.path && props.jobId) void load(() => active)
    else {
      release()
      loading.value = false
    }
  },
  { immediate: true },
)
onScopeDispose(release)
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-w-3xl">
      <DialogHeader>
        <DialogTitle>{{ name }}</DialogTitle>
        <DialogDescription>
          Read from the working directory of the running session. It is gone when the session ends.
        </DialogDescription>
      </DialogHeader>
      <div v-if="loading" class="grid place-items-center py-10"><Spinner /></div>
      <Notice v-else-if="error" tone="error">{{ error }}</Notice>
      <ImagePreview v-else-if="kind === 'image'" :url="imageUrl" :name="name" />
      <HtmlPreview v-else-if="kind === 'html'" :text="text" :name="name" />
      <TextPreview v-else-if="kind === 'text'" :text="text" />
      <Notice v-else tone="info">This file is not text or an image, so it is not shown here.</Notice>
    </DialogContent>
  </Dialog>
</template>
