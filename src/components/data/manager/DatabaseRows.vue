<script setup lang="ts">
// The databases the user may use, listed like buckets with the dataset's title under the name.
import { computed, onMounted, ref } from 'vue'
import BucketRow from '@/components/data/BucketRow.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useDatabases } from '@/composables/useDatabases'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { NOT_HELD_HERE, STATE_NOTES, type DatabaseRow } from '@/lib/databases'
import { errorMessage } from '@/lib/utils'

const props = defineProps<{ filter: string; active: string }>()
const emit = defineEmits<{ (e: 'open', bucket: string, nodeId: string | null, groupId: string): void }>()

const databases = useDatabases()
const { isLocalNode } = useRealmNodes()
const problem = ref<string | null>(null)
let opening = 0

onMounted(() => databases.ensure())

const rows = computed(() => {
  const term = props.filter.trim().toLowerCase()
  return databases.rows.value.filter((row) => !term || `${row.bucket} ${row.title ?? ''}`.toLowerCase().includes(term))
})

async function open(row: DatabaseRow) {
  const run = ++opening
  problem.value = null
  try {
    const place = await databases.locate(row)
    if (run !== opening) return
    if (!place) problem.value = NOT_HELD_HERE
    else emit('open', place.bucket, isLocalNode(place.nodeId) ? null : place.nodeId, row.ownerGroup)
  } catch (cause) {
    if (run === opening) problem.value = errorMessage(cause)
  }
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
    <li v-if="problem" role="status" class="px-3 py-2 text-xs text-muted-foreground">{{ problem }}</li>
  </template>
</template>
