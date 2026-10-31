<script setup lang="ts">
// The upload area of a share link: drop or choose files, progress per file, and for upload-only
// links a summary of what this visit sent. Nothing else in the bucket is shown.
import { computed, ref } from 'vue'
import { CircleCheck, CircleX, Upload } from '@lucide/vue'
import Button from '@/components/ui/Button.vue'
import Progress from '@/components/ui/Progress.vue'
import { useVisitUploads } from '@/composables/useVisitUploads'
import { collectDropFiles } from '@/lib/upload/dropEntries'
import { formatBytes } from '@/lib/utils'

type Visit = <T>(call: (token: string, base: string) => Promise<T>) => Promise<T>

const props = defineProps<{ visit: Visit; prefix: string; uploadOnly: boolean }>()
const emit = defineEmits<{ (e: 'landed'): void }>()

const { uploads, add } = useVisitUploads(props.visit, () => emit('landed'))
const dragging = ref(false)
const picker = ref<HTMLInputElement | null>(null)

const sent = computed(() => uploads.value.filter((entry) => entry.state === 'done'))
const sentBytes = computed(() => sent.value.reduce((sum, entry) => sum + entry.size, 0))

function onPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  if (files.length) void add(props.prefix, files)
}

async function onDrop(event: DragEvent) {
  dragging.value = false
  const files = await collectDropFiles(event.dataTransfer)
  if (files.length) void add(props.prefix, files)
}

const percent = (sentBytes: number, size: number) => (size ? Math.round((sentBytes / size) * 100) : 100)
</script>

<template>
  <section class="space-y-3" aria-label="Upload files">
    <div
      class="surface flex flex-col items-center gap-3 border-2 border-dashed px-6 py-10 text-center"
      :class="dragging ? 'border-primary bg-primary/5' : 'border-border'"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <Upload class="h-6 w-6 text-primary" aria-hidden="true" />
      <p class="text-sm text-foreground">Drop files or folders here</p>
      <Button variant="outline" size="sm" @click="picker?.click()">Choose files</Button>
      <input ref="picker" type="file" multiple class="hidden" aria-label="Choose files" @change="onPicked" />
    </div>

    <ul v-if="uploads.length" class="surface divide-y divide-border">
      <li v-for="entry in uploads" :key="entry.id" class="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
        <CircleCheck v-if="entry.state === 'done'" class="h-4 w-4 text-status-ok" aria-label="Uploaded" />
        <CircleX v-else-if="entry.state === 'failed'" class="h-4 w-4 text-status-failed" aria-label="Failed" />
        <span v-else aria-hidden="true"></span>
        <span class="min-w-0">
          <span class="block truncate text-foreground" :title="entry.name">{{ entry.name }}</span>
          <span v-if="entry.state === 'done' && entry.landed && entry.landed !== entry.name" class="block truncate text-xs text-muted-foreground">Uploaded as {{ entry.landed }}</span>
          <span v-else-if="entry.state === 'failed'" class="block text-xs text-status-failed">{{ entry.error }}</span>
          <Progress v-else-if="entry.state === 'sending'" :value="percent(entry.sent, entry.size)" :warn="101" :critical="101" class="mt-1 h-1.5" :label="`Uploading ${entry.name}`" />
          <span v-else class="block text-xs text-muted-foreground">Waiting</span>
        </span>
        <span class="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{{ formatBytes(entry.size) }}</span>
      </li>
    </ul>

    <p v-if="uploadOnly && sent.length" class="text-sm text-foreground" role="status">
      Files sent: {{ sent.length.toLocaleString('en-US') }}, {{ formatBytes(sentBytes) }}
    </p>
  </section>
</template>
