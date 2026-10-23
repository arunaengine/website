<script setup lang="ts">
// Where the files of a bucket come from: sources, buckets that follow it, imports and nodes.
import { computed } from 'vue'
import MockNotice from '@/components/distributed/MockNotice.vue'
import StorageFeatureLink from '@/components/distributed/StorageFeatureLink.vue'
import { storedLabel } from '@/lib/distributedMock'
import { contentSources, isMulti, mockBucket } from '@/lib/distributedMockData'
import { Waypoints } from '@lucide/vue'

const props = defineProps<{ bucket: string }>()

const sources = computed(() => contentSources(props.bucket))
const stored = computed(() => {
  const found = mockBucket(props.bucket)
  if (!found) return ['This node only']
  if (!isMulti(found)) return [`This node: ${found.members[0].nodeId}`]
  return [`${storedLabel(found.preset, found.members.length)}: ${found.members.map((member) => member.nodeId).join(', ')}`]
})
const groups = computed(() => [
  { title: 'References', rows: sources.value.references },
  { title: 'Follows', rows: sources.value.follows },
  { title: 'Followed by', rows: sources.value.followedBy },
  { title: 'Imported in place', rows: sources.value.imports },
  { title: 'Stored on', rows: stored.value },
])
</script>

<template>
  <section class="surface">
    <header class="flex items-center gap-2 border-b border-border px-5 py-4">
      <Waypoints class="size-4 text-primary" />
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Where the contents come from</h2>
      <StorageFeatureLink icon question="elsewhere" />
    </header>
    <div class="space-y-3 px-5 py-4">
      <MockNotice v-if="!mockBucket(bucket)" />
      <dl class="space-y-2 text-sm">
        <div v-for="group in groups" :key="group.title" class="grid gap-1 sm:grid-cols-[10rem_1fr]">
          <dt class="text-xs font-medium text-muted-foreground">{{ group.title }}</dt>
          <dd>
            <ul v-if="group.rows.length" class="space-y-0.5">
              <li v-for="row in group.rows" :key="row">{{ row }}</li>
            </ul>
            <span v-else class="text-muted-foreground">None</span>
          </dd>
        </div>
      </dl>
    </div>
  </section>
</template>
