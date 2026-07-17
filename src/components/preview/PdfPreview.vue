<script setup lang="ts">
defineProps<{ url: string; name?: string }>()
</script>

<template>
  <iframe
    :src="url"
    :title="name ? `PDF preview of ${name}` : 'PDF preview'"
    class="h-[74vh] w-full rounded-md border border-border bg-background"
  />
</template>
