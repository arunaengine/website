<script setup lang="ts">
// Where a file version came from, in one sentence with a link to the source when there is one.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { stamp } from '@/lib/distributedMock'
import type { Origin } from '@/lib/fileOrigin'

const props = defineProps<{ origin: Origin; short?: boolean }>()

const host = computed(() => (props.origin.kind === 'source' ? props.origin.source.replace(/^https?:\/\//, '') : ''))
// An id from the node is a full URL; the example data names versions by their short form.
const w3id = (id: string) => (id.startsWith('http') ? id : `https://w3id.org/aruna/data${id}`)
const link = computed(() => {
  const origin = props.origin
  if (origin.kind === 'source') {
    const href = origin.url ?? (origin.source ? `${origin.source}/${origin.path}` : '')
    return href ? { href, label: origin.path } : null
  }
  if (origin.kind === 'copy' || origin.kind === 'sync') return { href: w3id(origin.from), label: origin.from }
  return null
})
</script>

<template>
  <p v-if="short">
    <template v-if="origin.kind === 'source'">
      <a v-if="link" :href="link.href" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">
        From {{ origin.database ?? host }}<template v-if="origin.database && host"> · {{ host }}</template>
      </a>
      <template v-else>From {{ origin.database ?? 'an external source' }}</template>
    </template>
    <template v-else-if="origin.kind === 'upload'">
      Uploaded by {{ origin.user }} · {{ stamp(origin.time).slice(0, 10) }}<template v-if="origin.device"> · {{ origin.device }}</template>
    </template>
    <a v-else-if="origin.kind === 'copy' && link" :href="link.href" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">Copy of another version</a>
    <a v-else-if="origin.kind === 'sync' && link" :href="link.href" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">Synced from {{ origin.sync.includes(' to ') ? origin.sync.split(' ')[0] : 'another bucket' }}</a>
    <template v-else-if="origin.kind === 'storage'">Registered from storage folder {{ origin.folder }}</template>
    <RouterLink v-else-if="origin.kind === 'job'" :to="{ name: 'compute', query: { tab: 'jobs' } }" class="text-primary hover:underline">Result of a run</RouterLink>
  </p>
  <div v-else class="space-y-0.5">
    <p v-if="origin.kind === 'upload'">
      Uploaded by {{ origin.user }} on {{ origin.node }}, {{ stamp(origin.time) }}<template v-if="origin.device">, from the device {{ origin.device }}</template>.
    </p>
    <p v-else-if="origin.kind === 'source'">From the source <template v-if="origin.source">{{ origin.source }}, </template>path:
      <a v-if="link" :href="link.href" target="_blank" rel="noopener noreferrer" class="break-all font-mono text-primary hover:underline">{{ link.label }}</a>
      <span v-else class="break-all font-mono">{{ origin.path }}</span>
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
