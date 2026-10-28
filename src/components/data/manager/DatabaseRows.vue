<script setup lang="ts">
// The databases the user may use, listed like buckets with the dataset's title under the name.
import { computed, onMounted } from 'vue'
import BucketRow from '@/components/data/BucketRow.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useDatabases } from '@/composables/useDatabases'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { targetKey, type DatabaseRow } from '@/lib/databases'

const props = defineProps<{ filter: string; active: string; highlighted?: number }>()
const emit = defineEmits<{ (e: 'open', bucket: string, nodeId: string | null, groupId: string): void }>()

const databases = useDatabases()
const { isLocalNode } = useRealmNodes()
onMounted(() => databases.ensure())

const rows = computed(() => {
  const term = props.filter.trim().toLowerCase()
  return databases.rows.value.filter((row) => !term || `${row.bucket} ${row.title ?? ''}`.toLowerCase().includes(term))
})

function open(row: DatabaseRow) {
  const place = databases.locate(row)
  emit('open', place.bucket, isLocalNode(place.nodeId) ? null : place.nodeId, row.ownerGroup)
}

// The sidebar's arrow keys move through these rows.
defineExpose({ openers: computed(() => rows.value.map((row) => () => open(row))) })
</script>

<template>
  <li v-if="databases.state.value === 'loading' && !databases.rows.value.length" class="px-3 py-4">
    <Spinner show-label label="Loading databases…" />
  </li>
  <li v-else-if="databases.state.value === 'failed'" class="px-3 py-3 text-xs text-destructive">
    {{ databases.error.value }}
  </li>
  <template v-else>
    <li v-for="(row, index) in rows" :key="targetKey(row.target)">
      <BucketRow
        :bucket="row.bucket"
        option
        :highlighted="index === highlighted"
        :pinnable="false"
        :active="row.bucket === active"
        :subtitle="row.title ?? undefined"
        @open="open(row)"
      />
    </li>
    <li v-if="!rows.length && databases.state.value === 'ready'" class="px-3 py-4 text-xs text-muted-foreground">
      No database {{ filter.trim() ? 'matches' : 'is listed for you yet' }}.
    </li>
    <li v-if="!databases.complete.value" class="px-3 py-2 text-xs text-muted-foreground">The list is partial. Narrow it with the search.</li>
  </template>
</template>
