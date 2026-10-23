<script setup lang="ts">
// A database is a bucket plus a linked dataset. This shows what the dataset says about it.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import DatasetPreview from '@/components/data/DatasetPreview.vue'
import DetailList from '@/components/ui/DetailList.vue'
import { useMockDatabases } from '@/composables/useMockDatabases'
import { mockBucket } from '@/lib/distributedMockData'

const props = withDefaults(defineProps<{ bucket: string; heading?: boolean }>(), { heading: true })

const { entries } = useMockDatabases()
const entry = computed(() => entries.value.find((item) => item.bucket === props.bucket))
</script>

<template>
  <section v-if="entry" class="space-y-2">
    <div class="flex flex-wrap items-baseline gap-x-3">
      <h3 v-if="heading" class="text-sm font-medium text-foreground">Database: {{ entry.dataset.name }}</h3>
      <RouterLink :to="{ name: 'dataset', params: { id: entry.datasetId } }" class="text-xs font-medium text-primary hover:underline">Open the dataset</RouterLink>
    </div>
    <p class="text-sm text-muted-foreground">{{ entry.dataset.description }}</p>
    <DetailList
      :items="[
        { label: 'Source', value: entry.dataset.source },
        { label: 'License', value: entry.dataset.license },
        { label: 'Creator', value: entry.dataset.creator },
        { label: 'Refresh', value: mockBucket(bucket)?.refresh ?? 'Off' },
        { label: 'Who may read', value: entry.readers },
        { label: 'Dataset id', value: entry.datasetId, mono: true },
      ]"
    />
    <DatasetPreview :dataset-id="entry.datasetId" />
  </section>
</template>
