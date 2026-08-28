<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { ref } from 'vue'
import { FolderInput, UploadCloud } from '@lucide/vue'

const emit = defineEmits<{ (e: 'add', files: File[]): void }>()

const { writesDisabled } = useConnectivity()

const dragActive = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const folderInput = ref<HTMLInputElement | null>(null)

function onBrowse(event: Event) {
  const input = event.target as HTMLInputElement
  if (!writesDisabled.value && input.files?.length) emit('add', Array.from(input.files))
  input.value = ''
}

function onDrop(event: DragEvent) {
  dragActive.value = false
  if (writesDisabled.value) return
  const files = event.dataTransfer?.files
  if (files?.length) emit('add', Array.from(files))
}
</script>

<template>
  <div
    class="rounded-md border-2 border-dashed p-8 text-center transition-colors"
    :class="dragActive ? 'border-primary bg-primary/5 ring-2 ring-primary ring-offset-2' : 'border-border'"
    @dragover.prevent="dragActive = true"
    @dragleave="dragActive = false"
    @drop.prevent="onDrop"
  >
    <UploadCloud class="mx-auto h-8 w-8 text-muted-foreground" />
    <p class="mt-2 text-sm text-foreground">Drop files here to add them to the basket</p>
    <p class="mt-1 text-xs text-muted-foreground">or</p>
    <input ref="fileInput" type="file" multiple class="hidden" @change="onBrowse" />
    <input ref="folderInput" type="file" webkitdirectory class="hidden" @change="onBrowse" />
    <div class="mt-2 flex items-center justify-center gap-2">
      <Button
        variant="outline"
        size="sm"
        :disabled="writesDisabled"
        :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
        @click="fileInput?.click()"
      >
        Browse files
      </Button>
      <Button
        variant="outline"
        size="sm"
        :disabled="writesDisabled"
        :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
        @click="folderInput?.click()"
      >
        <FolderInput class="h-3.5 w-3.5" /> Browse folder
      </Button>
    </div>
  </div>
  <p class="text-[11px] text-muted-foreground">
    Uploads are multipart (16 MiB parts), run up to three at a time, and keep going while you navigate.
    A picked folder keeps its structure under the target prefix.
  </p>
</template>
