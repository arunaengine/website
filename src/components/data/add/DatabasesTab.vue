<script setup lang="ts">
// The databases the user may use. A chosen one becomes the source in Other buckets, where its
// files are added to this bucket as references (not copied) or copied.
import { computed, onMounted } from 'vue'
import Button from '@/components/ui/Button.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useDatabases } from '@/composables/useDatabases'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { openNode, STATE_NOTES, type DatabaseRow } from '@/lib/databases'

const props = defineProps<{ bucket: string }>()
const emit = defineEmits<{ (e: 'choose', bucket: string, nodeId: string): void }>()

const databases = useDatabases()
const { localNodeId } = useRealmNodes()

onMounted(() => databases.ensure())

// A bucket cannot be its own source.
const rows = computed(() => databases.rows.value.filter((row) => row.bucket !== props.bucket))

function choose(row: DatabaseRow) {
  emit('choose', row.bucket, openNode(row, localNodeId.value ?? ''))
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
  </div>
</template>
