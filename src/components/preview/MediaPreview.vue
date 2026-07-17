<script setup lang="ts">
defineProps<{ url: string; mediaKind: 'video' | 'audio'; name?: string }>()
</script>

<template>
  <div class="grid place-items-center rounded-md border border-border bg-muted/20 p-4">
    <video
      v-if="mediaKind === 'video'"
      :src="url"
      controls
      preload="metadata"
      class="max-h-[68vh] w-full max-w-full rounded"
    />
    <audio v-else :src="url" controls preload="metadata" class="w-full" />
  </div>
</template>
