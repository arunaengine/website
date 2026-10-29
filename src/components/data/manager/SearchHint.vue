<script setup lang="ts">
// What the typed text does: it filters the open folder, and Enter searches the whole bucket.
// A column=value never filters the folder, so it only names the bucket search.
import { ListFilter } from '@lucide/vue'

defineProps<{ text: string; folder: string; bucket: string }>()
</script>

<template>
  <div class="rounded-md border border-border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-lg" role="status">
    <p v-if="text.includes('=')" class="text-foreground">Press Enter to search all of {{ bucket }} for {{ text.trim() }}.</p>
    <template v-else>
      <p class="flex min-w-0 items-center gap-2 text-foreground">
        <ListFilter class="h-3.5 w-3.5 shrink-0" />
        <span class="min-w-0 truncate">Filtering <span class="font-medium">{{ folder }}</span> for "{{ text.trim() }}"</span>
      </p>
      <p class="mt-1">Press Enter to search all of {{ bucket }}. Use column=value for an exact match, for example organism="E. coli".</p>
    </template>
  </div>
</template>
