<script setup lang="ts">
defineProps<{ url: string; name?: string }>()
</script>

<template>
  <div class="grid max-h-[72vh] place-items-center overflow-auto rounded-md border border-border bg-muted/20 p-4">
    <img :src="url" :alt="name ?? 'Image preview'" class="max-h-[64vh] max-w-full object-contain" />
  </div>
</template>
