<script setup lang="ts">
// Buckets the node on this computer stores, found through the realm's bucket
// search. Every page is read, since the search cannot filter by node.
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import { useAruna } from '@/composables/useAruna'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { useRealmNodes } from '@/composables/useRealmNodes'
import type { BucketSearchHit } from '@/lib/api'
import { isHiddenBucket } from '@/lib/workspaces'
import { errorMessage } from '@/lib/utils'
import { Boxes } from '@lucide/vue'

const { searchBuckets, sessionEpoch } = useAruna()
const { identity } = useDeviceStatus()
const { isLocalNode } = useRealmNodes()

const hits = ref<BucketSearchHit[] | null>(null)
const error = ref<string | null>(null)
let seq = 0

async function load(nodeId: string | undefined): Promise<void> {
  const mine = ++seq
  hits.value = null
  error.value = null
  if (!nodeId) return
  try {
    const found: BucketSearchHit[] = []
    let cursor: string | undefined
    do {
      const page = await searchBuckets('', { limit: 50, cursor })
      if (mine !== seq) return
      found.push(...page.hits.filter((hit) => hit.node_id === nodeId && !isHiddenBucket(hit.bucket)))
      cursor = page.next_cursor ?? undefined
    } while (cursor)
    hits.value = found
  } catch (err) {
    if (mine !== seq) return
    error.value = errorMessage(err)
  }
}

watch([() => identity.value?.nodeId, sessionEpoch], ([nodeId]) => void load(nodeId), { immediate: true })

function bucketLink(hit: BucketSearchHit) {
  return {
    name: 'bucket',
    params: { bucketId: hit.bucket },
    query: { ...(isLocalNode(hit.node_id) ? {} : { node: hit.node_id }), group: hit.group_id },
  }
}
</script>

<template>
  <section class="surface px-5 py-4">
    <div class="flex items-center gap-2">
      <Boxes class="h-4 w-4 text-primary" />
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Buckets stored here</h2>
      <Badge v-if="hits" variant="outline" size="count">{{ hits.length }}</Badge>
    </div>
    <p v-if="error" class="mt-2 text-xs text-destructive">The buckets here could not be listed: {{ error }}</p>
    <p v-else-if="!hits" class="mt-2 text-xs text-muted-foreground">Looking for buckets on this computer…</p>
    <ul v-else-if="hits.length" class="mt-2 space-y-1 text-xs">
      <li v-for="hit in hits" :key="`${hit.group_id}/${hit.bucket}`" class="flex items-center justify-between gap-3">
        <RouterLink :to="bucketLink(hit)" class="truncate font-mono text-primary hover:underline">{{ hit.bucket }}</RouterLink>
        <span class="truncate text-[11px] text-muted-foreground">{{ hit.group_name || '' }}</span>
      </li>
    </ul>
    <p v-else class="mt-2 text-xs text-muted-foreground">No bucket is stored here.</p>
    <p class="mt-2 text-[11px] text-muted-foreground">Only this computer keeps these. Create buckets in Data.</p>
  </section>
</template>
