<script setup lang="ts">
// Getting started in one line: how many steps are done, the next one and its button.
defineProps<{ done: number; total: number; next: string }>()
defineEmits<{ hide: [] }>()
</script>

<template>
  <section class="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border px-5 py-3" aria-label="Getting started">
    <p class="min-w-0 flex-1 text-sm text-muted-foreground">
      <span class="font-semibold text-foreground">Getting started</span>
      {{ done }} of {{ total }} done. Next: {{ next }}.
    </p>
    <slot />
    <button type="button" class="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline" @click="$emit('hide')">
      Hide
    </button>
  </section>
</template>
