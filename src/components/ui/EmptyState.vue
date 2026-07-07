<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <div class="surface px-5 py-10 text-center">
    <div v-if="$slots.icon" class="mb-3 flex justify-center text-muted-foreground"><slot name="icon" /></div>
    <p class="text-sm font-medium text-foreground">{{ title }}</p>
    <p v-if="description" class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{{ description }}</p>
    <div v-if="$slots.default" class="mt-4 flex justify-center"><slot /></div>
  </div>
</template>
