<script setup lang="ts">
// The databases the realm admins listed. Each one is an ordinary bucket.
import Badge from '@/components/ui/Badge.vue'
import { useMockDatabases } from '@/composables/useMockDatabases'
import { Database } from '@lucide/vue'

const emit = defineEmits<{ (e: 'open', bucket: string): void }>()
const { entries } = useMockDatabases()
</script>

<template>
  <section class="surface overflow-hidden">
    <header class="flex items-center justify-between border-b border-border px-3 py-3">
      <h2 class="text-sm font-semibold text-foreground">Databases</h2>
      <Badge variant="outline" size="count">{{ entries.length }}</Badge>
    </header>
    <ul v-if="entries.length" class="py-1">
      <li v-for="entry in entries" :key="entry.id">
        <button
          type="button"
          class="flex w-full min-w-0 items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
          :title="`${entry.description} ${entry.license}`"
          @click="emit('open', entry.bucket)"
        >
          <Database class="h-3.5 w-3.5 shrink-0 text-primary" />
          <span class="min-w-0 flex-1">
            <span class="block truncate">{{ entry.name }}</span>
            <span class="block truncate text-[10px] font-normal">{{ entry.source }}</span>
          </span>
        </button>
      </li>
    </ul>
    <p v-else class="px-3 py-4 text-xs text-muted-foreground">No databases are listed yet.</p>
  </section>
</template>
