<script setup lang="ts">
// How files got into this bucket. Only incoming paths are listed: external sources that are
// read without copying, and buckets that a sync you created copies from.
import { computed, watch } from 'vue'
import RowList from '@/components/distributed/RowList.vue'
import StorageFeatureLink from '@/components/distributed/StorageFeatureLink.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useBucketSyncs } from '@/composables/useBucketSyncs'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useStagingReferences } from '@/composables/useStagingReferences'
import { sourceRows } from '@/lib/bucketSources'
import { Waypoints } from '@lucide/vue'

const props = defineProps<{ bucket: string; nodeId: string | null }>()

const bucket = computed(() => props.bucket)
const nodeId = computed(() => props.nodeId)
const { displayName } = useRealmNodes()
const references = useStagingReferences(bucket, computed(() => !props.nodeId))
const syncs = useBucketSyncs(bucket, nodeId)

watch(() => [props.bucket, props.nodeId], () => void syncs.load(), { immediate: true })

const rows = computed(() => sourceRows(references.stats.value.groups, syncs.incoming.value, displayName))
const loading = computed(() => references.loading.value || syncs.loading.value)
// A failed read says so; it never reads as "no sources".
const unknown = computed(() => Boolean(props.nodeId) || references.status.value === 'error' || Boolean(syncs.error.value))
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
      <p v-else-if="!unknown" class="text-xs text-muted-foreground">No external source and no sync feeds this bucket.</p>
      <p v-if="unknown" class="text-xs text-muted-foreground">
        {{ nodeId ? 'This bucket is hosted on another node, so its sources are not listed here.' : 'The sources could not be read from this node.' }}
      </p>
    </div>
  </section>
</template>
