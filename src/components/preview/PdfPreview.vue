<script setup lang="ts">
// Inline viewing requires the served CSP to allow blob: frames (aruna
// api/src/csp.rs serves `frame-src blob:`); the bytes are fetched over the
// already-allowed connect-src path, so the iframe never touches the S3 origin.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { BUCKET_LOCKED_HEADER } from '@/composables/s3/errors'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { ExternalLink, FileText } from '@lucide/vue'

const props = defineProps<{ url: string; name?: string }>()
/** `locked` names the URL whose read a locked bucket refused. */
const emit = defineEmits<{ (e: 'locked', url: string): void }>()
// A viewer that is gone neither reports nor keeps what its read returns.
const reading = new AbortController()

const blobUrl = ref<string | null>(null)
const failed = ref(false)
const loading = ref(true)

function openTab() {
  window.open(props.url, '_blank', 'noopener')
}

onMounted(async () => {
  const url = props.url
  try {
    const response = await fetch(url, { signal: reading.signal })
    if (reading.signal.aborted) return
    if (response.status === 403 && response.headers.get(BUCKET_LOCKED_HEADER) === 'true') {
      emit('locked', url)
      return
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const blob = await response.blob()
    if (reading.signal.aborted) return
    blobUrl.value = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
  } catch {
    if (!reading.signal.aborted) failed.value = true
  } finally {
    if (!reading.signal.aborted) loading.value = false
  }
})

onBeforeUnmount(() => {
  reading.abort()
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value)
})
</script>

<template>
  <div v-if="loading" class="flex h-full min-h-[24rem] flex-col gap-3 p-4">
    <Skeleton class="h-full min-h-[20rem] w-full" />
  </div>
  <iframe
    v-else-if="blobUrl"
    :src="blobUrl"
    :title="name || 'PDF document'"
    class="h-full min-h-[70vh] w-full rounded-md border border-border bg-background"
  />
  <EmptyState
    v-else
    :title="name || 'PDF document'"
    description="The PDF could not be loaded inline (the bucket may not allow this portal's origin). The document opens in your browser's PDF viewer instead."
  >
    <template #icon><FileText class="h-8 w-8" /></template>
    <Button size="sm" @click="openTab"><ExternalLink class="h-4 w-4" /> Open PDF in new tab</Button>
  </EmptyState>
</template>
