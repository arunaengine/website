<script setup lang="ts">
// A database is a bucket plus a linked dataset. A compact header with what the dataset says.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import { useMockDatabases } from '@/composables/useMockDatabases'
import { cn } from '@/lib/utils'
import { mockBucket } from '@/lib/distributedMockData'

const props = defineProps<{ bucket: string; bare?: boolean }>()

const { entries } = useMockDatabases()
const entry = computed(() => entries.value.find((item) => item.bucket === props.bucket))
const refresh = computed(() => {
  const value = mockBucket(props.bucket)?.refresh ?? 'Off'
  return value === 'Off' ? '' : value.toLowerCase()
})
</script>

<template>
  <section
    v-if="entry"
    :class="cn('flex flex-wrap items-center gap-x-4 gap-y-2', bare ? '' : 'surface p-4')"
    :title="`Who may read: ${entry.readers}. Dataset ${entry.datasetId}.`"
  >
    <div class="min-w-0 flex-1">
      <p class="text-sm font-medium text-foreground">{{ entry.dataset.name }}</p>
      <p class="text-sm text-muted-foreground">{{ entry.dataset.description }}</p>
      <p class="text-xs text-muted-foreground">{{ [entry.dataset.license, entry.dataset.source, refresh].filter(Boolean).join(' · ') }}</p>
    </div>
    <Button size="sm" variant="outline" as-child>
      <RouterLink :to="{ name: 'dataset', params: { id: entry.datasetId } }">Open the dataset</RouterLink>
    </Button>
  </section>
</template>
