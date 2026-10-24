<script setup lang="ts">
// How files got into this bucket. Only incoming paths are listed: external sources that are read
// without copying, buckets that a sync copies from, and storage folders registered in place.
// Files that no list covers are not claimed to come from anywhere.
import { computed, ref, watch } from 'vue'
import RowList from '@/components/distributed/RowList.vue'
import StorageFeatureLink from '@/components/distributed/StorageFeatureLink.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useAruna } from '@/composables/useAruna'
import { useBucketSources } from '@/composables/useBucketSources'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useStagingReferences } from '@/composables/useStagingReferences'
import { sourceRows } from '@/lib/bucketSources'
import { truncateMiddle } from '@/lib/utils'
import { Waypoints } from '@lucide/vue'

const props = defineProps<{ bucket: string; nodeId: string | null; groupId?: string | null }>()

const { listGroupBackends } = useAruna()
const bucket = computed(() => props.bucket)
const nodeId = computed(() => props.nodeId)
const { displayName } = useRealmNodes()
const references = useStagingReferences(bucket, computed(() => !props.nodeId))
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

const rows = computed(() =>
  sourceRows(references.stats.value.groups, listed.sources.value, displayName, (id) => backends.value[id] ?? truncateMiddle(id, 8, 4)),
)
const loading = computed(() => references.loading.value || listed.state.value === 'loading')
// A failed read says so; it never reads as "no sources".
const unknown = computed(() => Boolean(props.nodeId) || references.status.value === 'error' || listed.state.value === 'failed')
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
      <p v-else-if="!unknown" class="text-xs text-muted-foreground">No external source, sync or storage folder feeds this bucket.</p>
      <p v-if="!listed.complete.value" class="text-xs text-muted-foreground">More sources exist than are listed.</p>
      <p v-if="unknown" class="text-xs text-muted-foreground">
        {{ nodeId ? 'This bucket is hosted on another node, so its sources are not listed here.' : 'The sources could not be read from this node.' }}
      </p>
    </div>
  </section>
</template>
