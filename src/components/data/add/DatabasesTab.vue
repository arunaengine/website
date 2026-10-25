<script setup lang="ts">
// The databases the user may use. A chosen one becomes the source in Other buckets, where its
// files are added to this bucket as references (not copied) or copied.
import { computed, onMounted, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useDatabases } from '@/composables/useDatabases'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { NOT_HELD_HERE, STATE_NOTES, type DatabaseRow } from '@/lib/databases'
import { errorMessage } from '@/lib/utils'

const props = defineProps<{ bucket: string }>()
const emit = defineEmits<{ (e: 'choose', bucket: string, nodeId: string, groupId: string): void }>()

const databases = useDatabases()
const { localNodeId } = useRealmNodes()
const problem = ref<string | null>(null)
let choosing = 0

onMounted(() => databases.ensure())

// A bucket cannot be its own source.
const rows = computed(() => databases.rows.value.filter((row) => row.bucket !== props.bucket))

async function choose(row: DatabaseRow) {
  const run = ++choosing
  problem.value = null
  try {
    const place = await databases.locate(row)
    if (run !== choosing) return
    if (!place) problem.value = NOT_HELD_HERE
    else emit('choose', place.bucket, place.nodeId, row.ownerGroup)
  } catch (cause) {
    if (run === choosing) problem.value = errorMessage(cause)
  }
}
</script>

<template>
  <div class="space-y-3">
    <Spinner v-if="databases.state.value === 'loading' && !rows.length" show-label label="Loading databases…" />
    <p v-else-if="databases.state.value === 'failed'" class="text-xs text-destructive">{{ databases.error.value }}</p>
    <ul v-else-if="rows.length" class="divide-y divide-border rounded-md border border-border">
      <li v-for="row in rows" :key="row.entryId" class="flex flex-wrap items-center gap-3 px-3 py-2.5">
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-foreground">{{ row.title || row.bucket }}</p>
          <p class="text-xs text-muted-foreground">
            <span class="font-mono">{{ row.bucket }}</span>
            <template v-if="STATE_NOTES[row.state]"> · {{ STATE_NOTES[row.state] }}</template>
          </p>
        </div>
        <Button size="sm" variant="outline" @click="choose(row)">Add from this database</Button>
      </li>
    </ul>
    <p v-else class="text-xs text-muted-foreground">No database is listed for you yet.</p>
    <p v-if="!databases.complete.value" class="text-xs text-muted-foreground">The list is partial.</p>
    <p v-if="problem" role="status" class="text-xs text-muted-foreground">{{ problem }}</p>
  </div>
</template>
