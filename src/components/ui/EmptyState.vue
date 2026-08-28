<script setup lang="ts">
defineProps<{ title: string; description?: string; compact?: boolean }>()
</script>

<template>
  <div v-if="compact" class="surface flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
    <p class="text-sm text-muted-foreground">
      {{ title }}<span v-if="description"> {{ description }}</span>
    </p>
    <div v-if="$slots.default" class="shrink-0"><slot /></div>
  </div>
  <div v-else class="surface px-5 py-10 text-center">
    <div v-if="$slots.icon" class="mb-3 flex justify-center text-muted-foreground"><slot name="icon" /></div>
    <p class="text-sm font-medium text-foreground">{{ title }}</p>
    <p v-if="description" class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{{ description }}</p>
    <div v-if="$slots.default" class="mt-4 flex justify-center"><slot /></div>
  </div>
</template>
