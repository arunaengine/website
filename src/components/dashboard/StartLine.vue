<script setup lang="ts">
// The desktop's first steps as a card: how many are done, what is still open, the buttons of the
// open steps (the next one first) and Not now.
import { Laptop, X } from '@lucide/vue'
import IconButton from '@/components/ui/IconButton.vue'
import IconTile from '@/components/ui/IconTile.vue'

defineProps<{ done: number; total: number; next: string }>()
defineEmits<{ hide: [] }>()
</script>

<template>
  <section class="surface relative flex flex-wrap items-center gap-4 border-primary/40 bg-primary/5 p-5 pr-12" aria-label="Set up this computer">
    <IconTile :icon="Laptop" />
    <div class="min-w-0 flex-1">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Set up this computer, {{ done }} of {{ total }} done</h2>
      <p class="mt-1 text-xs text-muted-foreground">Next: {{ next }}.</p>
    </div>
    <div class="flex w-full flex-wrap items-center gap-2 lg:w-auto"><slot /></div>
    <IconButton label="Not now" class="absolute right-2 top-2" @click="$emit('hide')"><X class="h-4 w-4" /></IconButton>
  </section>
</template>
