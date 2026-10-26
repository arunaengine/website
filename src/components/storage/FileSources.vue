<script setup lang="ts">
// How files got into the bucket. Only incoming paths are listed, one row each.
import { computed } from 'vue'
import RowList from '@/components/distributed/RowList.vue'
import StorageFeatureLink from '@/components/distributed/StorageFeatureLink.vue'
import { sourceLines } from '@/lib/distributedMockData'
import { Waypoints } from '@lucide/vue'

const props = defineProps<{ bucket: string }>()

const lines = computed(() => sourceLines(props.bucket))
const rows = computed(() =>
  lines.value.length ? lines.value.map((line) => ({ ...line, key: line.label })) : [{ key: 'direct', label: 'Uploaded directly', value: 'All files', question: 'elsewhere' as const }],
)
</script>

<template>
  <section class="surface">
    <header class="flex items-center gap-2 border-b border-border px-5 py-4">
      <Waypoints class="size-4 text-primary" />
      <div>
        <h2 class="font-display text-sm font-semibold text-aruna-navy">File sources</h2>
        <p class="text-xs text-muted-foreground">How files got into this bucket</p>
      </div>
    </header>
    <div class="px-5 py-4">
      <RowList :rows="rows">
        <template v-for="row in rows" :key="row.key" #[row.key]>
          {{ row.value }}
          <StorageFeatureLink icon :question="row.question" class="ml-1" />
        </template>
      </RowList>
    </div>
  </section>
</template>
