<script setup lang="ts">
// Where the files of a bucket come from. Only what applies is listed, in plain sentences.
import { computed } from 'vue'
import StorageFeatureLink from '@/components/distributed/StorageFeatureLink.vue'
import { storedLabel, type StorageQuestion } from '@/lib/distributedMock'
import { isMulti, mockBucket, sourceLines } from '@/lib/distributedMockData'
import { Waypoints } from '@lucide/vue'

const props = defineProps<{ bucket: string }>()

const example = computed(() => mockBucket(props.bucket))
const lines = computed<{ text: string; question: StorageQuestion }[]>(() => {
  const found = example.value
  const stored =
    found && isMulti(found)
      ? [{
          text: `${storedLabel(found.preset, found.members.length)}: ${found.members.map((member) => member.nodeId).join(', ')}.`,
          question: 'nodes' as const,
        }]
      : []
  return [...sourceLines(props.bucket), ...stored]
})
</script>

<template>
  <section class="surface">
    <header class="flex items-center gap-2 border-b border-border px-5 py-4">
      <Waypoints class="size-4 text-primary" />
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Where the contents come from</h2>
    </header>
    <div class="space-y-3 px-5 py-4 text-sm">
      <p v-if="!sourceLines(bucket).length" class="text-muted-foreground">All files were uploaded to this bucket directly.</p>
      <ul v-if="lines.length" class="space-y-1.5">
        <li v-for="line in lines" :key="line.text" class="flex items-start gap-2">
          <span>{{ line.text }}</span>
          <StorageFeatureLink icon :question="line.question" class="mt-0.5" />
        </li>
      </ul>
    </div>
  </section>
</template>
