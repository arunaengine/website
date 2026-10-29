<script setup lang="ts">
// One cell of the Overview card: a label, the figures (each number in <b>, its word plain) and a short line.
defineProps<{ label: string }>()
</script>

<template>
  <div class="flex min-w-0 flex-col gap-1.5 bg-card px-5 py-4">
    <span class="text-xs text-muted-foreground">{{ label }}</span>
    <div class="flex flex-wrap items-baseline gap-x-1.5 text-sm text-muted-foreground [&_b]:font-display [&_b]:text-2xl [&_b]:font-semibold [&_b]:text-foreground">
      <slot name="value" />
    </div>
    <p v-if="$slots.default" class="text-xs text-muted-foreground"><slot /></p>
  </div>
</template>
