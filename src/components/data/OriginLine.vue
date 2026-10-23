<script setup lang="ts">
// Where a file version came from, in one sentence with a link to the source when there is one.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { stamp } from '@/lib/distributedMock'
import type { Origin } from '@/lib/distributedMockData'

const props = defineProps<{ origin: Origin }>()

const w3id = (id: string) => `https://w3id.org/aruna/data${id}`
const link = computed(() => {
  const origin = props.origin
  if (origin.kind === 'source') return { href: `${origin.source}/${origin.path}`, label: origin.path }
  if (origin.kind === 'copy' || origin.kind === 'sync') return { href: w3id(origin.from), label: origin.from }
  return null
})
</script>

<template>
  <div class="space-y-0.5">
    <p v-if="origin.kind === 'upload'">
      Uploaded by {{ origin.user }} on {{ origin.node }}, {{ stamp(origin.time) }}<template v-if="origin.device">, from the device {{ origin.device }}</template>.
    </p>
    <p v-else-if="origin.kind === 'source'">From the source {{ origin.source }}, path:
      <a v-if="link" :href="link.href" target="_blank" rel="noopener noreferrer" class="break-all font-mono text-primary hover:underline">{{ link.label }}</a>
    </p>
    <p v-else-if="origin.kind === 'copy'">Copy of the version
      <a v-if="link" :href="link.href" target="_blank" rel="noopener noreferrer" class="break-all font-mono text-primary hover:underline">{{ link.label }}</a>.
    </p>
    <p v-else-if="origin.kind === 'sync'">Copied by the sync {{ origin.sync }} from the version
      <a v-if="link" :href="link.href" target="_blank" rel="noopener noreferrer" class="break-all font-mono text-primary hover:underline">{{ link.label }}</a>.
    </p>
    <p v-else-if="origin.kind === 'storage'">
      Registered from the storage folder {{ origin.folder }}, key <span class="break-all font-mono">{{ origin.key }}</span>.
    </p>
    <p v-else>
      Result of the run
      <RouterLink :to="{ name: 'compute', query: { tab: 'jobs' } }" class="font-mono text-primary hover:underline">{{ origin.run }}</RouterLink>.
    </p>
    <p v-if="origin.kind === 'source' && (origin.etag || origin.digest)" class="text-muted-foreground">
      At registration:
      <template v-if="origin.etag">ETag <span class="font-mono">{{ origin.etag }}</span></template>
      <template v-if="origin.etag && origin.digest">, </template>
      <template v-if="origin.digest"><span class="break-all font-mono">{{ origin.digest }}</span> (evidence)</template>.
    </p>
    <p v-if="origin.kind === 'source' && origin.database" class="text-muted-foreground">
      Database: <RouterLink :to="{ name: 'buckets' }" class="text-primary hover:underline">{{ origin.database }}</RouterLink>.
    </p>
  </div>
</template>
