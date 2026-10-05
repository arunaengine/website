<script setup lang="ts">
const props = defineProps<{ url: string; mediaKind: 'video' | 'audio'; name?: string }>()
// The player reports which URL it failed to read, so the preview checks only its own file.
const emit = defineEmits<{ (e: 'failed', url: string): void }>()
</script>

<template>
  <div class="grid place-items-center rounded-md border border-border bg-muted/20 p-4">
    <video
      v-if="mediaKind === 'video'"
      :src="url"
      controls
      preload="metadata"
      class="max-h-[68vh] w-full max-w-full rounded"
      @error="emit('failed', props.url)"
    />
    <audio v-else :src="url" controls preload="metadata" class="w-full" @error="emit('failed', props.url)" />
  </div>
</template>
