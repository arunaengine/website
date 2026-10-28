<script setup lang="ts">
// The databases the user may use. A chosen one becomes the source in Other buckets, where its
// files are added to this bucket as references (not copied) or copied.
import { computed, onMounted, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useBucketDistribution } from '@/composables/useBucketDistribution'
import { useDatabases } from '@/composables/useDatabases'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { sameTarget, targetKey, targetOf, type DatabaseRow } from '@/lib/databases'

const props = defineProps<{ bucket: string }>()
const emit = defineEmits<{ (e: 'choose', bucket: string, nodeId: string, groupId: string): void }>()

const databases = useDatabases()
const { localNodeId } = useRealmNodes()

onMounted(() => databases.ensure())

// A bucket cannot be its own source. The open bucket is on this node and is known by its set; until
// the set is known, a set with the same bucket name is left out too.
const distribution = useBucketDistribution(computed(() => props.bucket), ref(null))
const destination = computed(() => {
  if (distribution.state.value === 'ordinary') return targetOf(props.bucket, localNodeId.value ?? '', null)
  return distribution.view.value?.live ? targetOf(props.bucket, '', distribution.view.value.live.setId) : null
})
const rows = computed(() =>
  databases.rows.value.filter((row) => {
    if (destination.value) return !sameTarget(row.target, destination.value)
    return row.target.kind === 'ordinary' ? !sameTarget(row.target, targetOf(props.bucket, localNodeId.value ?? '', null)) : row.bucket !== props.bucket
  }),
)

function choose(row: DatabaseRow) {
  const place = databases.locate(row)
  emit('choose', place.bucket, place.nodeId, row.ownerGroup)
}
</script>

<template>
  <div class="space-y-3">
    <Spinner v-if="databases.state.value === 'loading' && !rows.length" show-label label="Loading databases…" />
    <p v-else-if="databases.state.value === 'failed'" class="text-xs text-destructive">{{ databases.error.value }}</p>
    <ul v-else-if="rows.length" class="divide-y divide-border rounded-md border border-border">
      <li v-for="row in rows" :key="targetKey(row.target)" class="flex flex-wrap items-center gap-3 px-3 py-2.5">
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-foreground">{{ row.title || row.bucket }}</p>
          <p class="text-xs text-muted-foreground">
            <span class="font-mono">{{ row.bucket }}</span>
            <template v-if="row.public"> · Public</template>
          </p>
        </div>
        <Button size="sm" variant="outline" @click="choose(row)">Add from this database</Button>
      </li>
    </ul>
    <p v-else class="text-xs text-muted-foreground">No database is listed for you yet.</p>
    <p v-if="!databases.complete.value" class="text-xs text-muted-foreground">The list is partial.</p>
  </div>
</template>
