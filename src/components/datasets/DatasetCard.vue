<script setup lang="ts">
// One catalog result. Search results label the classified purpose above the
// card; browse sections already group by it and pass `purpose` false.
import Badge from '@/components/ui/Badge.vue'
import CatalogCard from '@/components/metadata/CatalogCard.vue'
import { useAruna } from '@/composables/useAruna'
import { datasetPurposeLabel, datasetPurposeOf } from '@/lib/datasetPurpose'
import type { MetadataDoc } from '@/data/types'

defineProps<{
  doc: MetadataDoc
  score?: number
  purpose?: boolean
  favourite?: boolean
  busy?: boolean
}>()
const emit = defineEmits<{ (e: 'toggle-favourite', id: string): void }>()

const { currentUser } = useAruna()
</script>

<template>
  <div class="flex min-w-0 flex-col gap-1.5">
    <Badge v-if="purpose" variant="secondary" size="sm" class="w-fit uppercase">
      {{ datasetPurposeLabel(datasetPurposeOf(doc)) }}
    </Badge>
    <CatalogCard
      :doc="doc"
      :score="score"
      :favourite="favourite"
      :can-favourite="Boolean(currentUser)"
      :favourite-busy="busy"
      @toggle-favourite="emit('toggle-favourite', $event)"
    />
  </div>
</template>
