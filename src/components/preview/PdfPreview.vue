<script setup lang="ts">
// Inline viewing requires the served CSP to allow blob: frames (aruna
// api/src/csp.rs serves `frame-src blob:`); the bytes are fetched over the
// already-allowed connect-src path, so the iframe never touches the S3 origin.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { ExternalLink, FileText } from '@lucide/vue'

const props = defineProps<{ url: string; name?: string }>()

const blobUrl = ref<string | null>(null)
const failed = ref(false)
const loading = ref(true)

function openTab() {
  window.open(props.url, '_blank', 'noopener')
}

onMounted(async () => {
  try {
    const response = await fetch(props.url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const blob = await response.blob()
    blobUrl.value = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
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
