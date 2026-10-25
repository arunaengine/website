<script setup lang="ts">
// How files got into this bucket, from the node's bounded list of incoming paths: buckets that a
// sync copies from and storage folders registered in place. Files from an external source or a
// database name it in their own origin, so this list never claims to cover every file.
import { computed, ref, watch } from 'vue'
import RowList from '@/components/distributed/RowList.vue'
import StorageFeatureLink from '@/components/distributed/StorageFeatureLink.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useAruna } from '@/composables/useAruna'
import { useBucketSources } from '@/composables/useBucketSources'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { sourceRows } from '@/lib/bucketSources'
import { truncateMiddle } from '@/lib/utils'
import { Waypoints } from '@lucide/vue'

const props = defineProps<{ bucket: string; nodeId: string | null; groupId?: string | null }>()

const { listGroupBackends } = useAruna()
const bucket = computed(() => props.bucket)
const nodeId = computed(() => props.nodeId)
const { displayName } = useRealmNodes()
const listed = useBucketSources(bucket, nodeId)

// Names of the storage backends of the group, for the folders registered in place.
const backends = ref<Record<string, string>>({})
watch(
  () => [props.groupId, listed.sources.value.some((source) => source.kind === 'storage')],
  async ([groupId, any]) => {
    if (!groupId || !any) return
    try {
      const answer = await listGroupBackends(String(groupId))
      backends.value = Object.fromEntries(answer.backends.map((backend) => [backend.backend_id, backend.name]))
    } catch {
      backends.value = {}
    }
  },
  { immediate: true },
)

const rows = computed(() => sourceRows(listed.sources.value, displayName, (id) => backends.value[id] ?? truncateMiddle(id, 8, 4)))
const loading = computed(() => listed.state.value === 'loading')
// A failed read or a node without the list says so; it never reads as "no sources".
const unknown = computed(() => {
  if (props.nodeId) return 'This bucket is on another node, so its sources are not listed here.'
  if (listed.state.value === 'missing') return 'This node does not list the sources of a bucket.'
  if (listed.state.value === 'failed') return `The sources could not be read: ${listed.error.value}`
  return null
})
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
    <div class="space-y-2 px-5 py-4">
      <Skeleton v-if="loading && !rows.length" class="h-4 w-48" />
      <RowList v-else-if="rows.length" :rows="rows">
        <template v-for="row in rows" :key="row.key" #[row.key]>
          {{ row.value }}
          <StorageFeatureLink icon :question="row.question" class="ml-1" />
        </template>
      </RowList>
      <p v-else-if="!unknown && listed.complete.value" class="text-xs text-muted-foreground">No sync or storage folder feeds this bucket.</p>
      <p v-if="unknown" class="text-xs text-muted-foreground">{{ unknown }}</p>
      <template v-else-if="!loading">
        <p v-if="!listed.complete.value" class="text-xs text-muted-foreground">More sources exist than are listed.</p>
        <p class="text-xs text-muted-foreground">Files from an external source or a database show it in their origin.</p>
      </template>
    </div>
  </section>
</template>
