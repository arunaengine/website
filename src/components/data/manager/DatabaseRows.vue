<script setup lang="ts">
// The databases the user may use, listed like buckets with the dataset's title under the name.
import { computed, onMounted } from 'vue'
import BucketRow from '@/components/data/BucketRow.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useDatabases } from '@/composables/useDatabases'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { openNode, STATE_NOTES, type DatabaseRow } from '@/lib/databases'

const props = defineProps<{ filter: string; active: string }>()
const emit = defineEmits<{ (e: 'open', bucket: string, nodeId: string | null, groupId: string): void }>()

const databases = useDatabases()
const { localNodeId, isLocalNode } = useRealmNodes()

onMounted(() => databases.ensure())

const rows = computed(() => {
  const term = props.filter.trim().toLowerCase()
  return databases.rows.value.filter((row) => !term || `${row.bucket} ${row.title ?? ''}`.toLowerCase().includes(term))
})

function open(row: DatabaseRow) {
  const node = openNode(row, localNodeId.value ?? '')
  emit('open', row.bucket, isLocalNode(node) ? null : node, row.ownerGroup)
}
</script>

<template>
  <li v-if="databases.state.value === 'loading' && !databases.rows.value.length" class="px-3 py-4">
    <Spinner show-label label="Loading databases…" />
  </li>
  <li v-else-if="databases.state.value === 'failed'" class="px-3 py-3 text-xs text-destructive">
    {{ databases.error.value }}
  </li>
  <template v-else>
    <li v-for="row in rows" :key="row.entryId">
      <BucketRow
        :bucket="row.bucket"
        option
        :pinnable="false"
        :active="row.bucket === active"
        :subtitle="STATE_NOTES[row.state] || row.title"
        @open="open(row)"
      />
    </li>
    <li v-if="!rows.length && databases.state.value === 'ready'" class="px-3 py-4 text-xs text-muted-foreground">
      No database {{ filter.trim() ? 'matches' : 'is listed for you yet' }}.
    </li>
    <li v-if="!databases.complete.value" class="px-3 py-2 text-xs text-muted-foreground">The list is partial. Narrow it with the search.</li>
  </template>
</template>
