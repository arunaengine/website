<script setup lang="ts">
// A database is a bucket plus a dataset that describes it. A compact header with what the dataset says.
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import { useDatabases } from '@/composables/useDatabases'
import { useDatasetBrief } from '@/composables/useDatasetBrief'
import { STATE_NOTES } from '@/lib/databases'
import { cn } from '@/lib/utils'

const props = defineProps<{ bucket: string; nodeId: string | null; bare?: boolean }>()

const databases = useDatabases()
onMounted(() => databases.ensure())

const entry = computed(() => databases.find(props.bucket, props.nodeId))
const brief = useDatasetBrief(computed(() => entry.value?.datasetId ?? null))
const title = computed(() => brief.value?.name || entry.value?.title || '')
const facts = computed(() => [brief.value?.license, STATE_NOTES[entry.value?.state ?? 'active']].filter(Boolean).join(' · '))
</script>

<template>
  <section v-if="entry" :class="cn('flex flex-wrap items-center gap-x-4 gap-y-2', bare ? '' : 'surface p-4')">
    <div class="min-w-0 flex-1">
      <p class="text-sm font-medium text-foreground">{{ title || 'Database' }}</p>
      <p v-if="brief?.description" class="text-sm text-muted-foreground">{{ brief.description }}</p>
      <p v-if="facts" class="text-xs text-muted-foreground">{{ facts }}</p>
    </div>
    <Button size="sm" variant="outline" as-child>
      <RouterLink :to="{ name: 'dataset', params: { id: entry.datasetId } }">Open the dataset</RouterLink>
    </Button>
  </section>
</template>
