<script setup lang="ts">
// Searches published records of one repository connector; picking a hit hands
// its record to the host.
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import Input from '@/components/ui/Input.vue'
import Pagination from '@/components/ui/Pagination.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useInvenioSearch } from '@/composables/useInvenio'
import type { InvenioHit } from '@/lib/invenio'
import { Search } from '@lucide/vue'

const props = defineProps<{ groupId: string; connectorId: string; selectedId?: string }>()
const emit = defineEmits<{ (e: 'pick', hit: InvenioHit): void }>()

const search = useInvenioSearch(() => ({ groupId: props.groupId, connectorId: props.connectorId }))
const { query, page, hits, total, pageCount, hasNext, loading, error, run } = search
</script>

<template>
  <div class="space-y-2 rounded-md border border-border p-2">
    <div class="relative">
      <Search class="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input v-model="query" class="pl-7 text-xs" placeholder="Search published records" aria-label="Search published records" />
    </div>
    <div v-if="error" class="flex items-center gap-2">
      <p class="text-xs text-destructive">{{ error }}</p>
      <Button variant="ghost" size="sm" @click="run">Retry</Button>
    </div>
    <Spinner v-else-if="loading" show-label label="Searching…" class="flex text-xs" />
    <EmptyState v-else-if="!hits.length" compact title="No matching records." />
    <template v-else>
      <p class="text-[11px] text-muted-foreground">
        {{ total === null ? `${hits.length} records on this page` : `${total} records` }}
      </p>
      <ul class="max-h-60 space-y-1 overflow-y-auto">
        <li v-for="hit in hits" :key="hit.id">
          <button
            type="button"
            class="w-full rounded-md border px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
            :class="hit.id === selectedId ? 'border-primary/50 bg-primary/5' : 'border-transparent'"
            :aria-pressed="hit.id === selectedId"
            @click="emit('pick', hit)"
          >
            <span class="block text-sm font-medium text-foreground">{{ hit.title }}</span>
            <span class="block text-[11px] text-muted-foreground">
              {{ [hit.date, hit.creators.slice(0, 3).join('; '), hit.doi || hit.id].filter(Boolean).join(' · ') }}
            </span>
          </button>
          <ExternalLink v-if="hit.url" :href="hit.url" label="Open in the repository" class="ml-2 text-[11px]" />
        </li>
      </ul>
      <Pagination v-model:page="page" :page-count="pageCount" :has-next="hasNext" :disabled="loading" />
    </template>
  </div>
</template>
