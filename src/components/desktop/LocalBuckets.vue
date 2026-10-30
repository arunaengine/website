<script setup lang="ts">
// Buckets the node on this computer stores, found through the realm's bucket
// search. Every page is read, since the search cannot filter by node.
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import IconTile from '@/components/ui/IconTile.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import { useAruna } from '@/composables/useAruna'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { useRealmNodes } from '@/composables/useRealmNodes'
import type { BucketSearchHit } from '@/lib/api'
import { isHiddenBucket } from '@/lib/workspaces'
import { errorMessage } from '@/lib/utils'
import { Boxes, Info, Package, Plus } from '@lucide/vue'

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
  <section class="surface overflow-hidden">
    <div class="flex items-center gap-2 border-b border-border-subtle px-5 py-3">
      <Boxes class="h-4 w-4 text-muted-foreground" />
      <h3 class="text-sm font-medium text-foreground">Buckets stored here</h3>
      <span v-if="hits" class="text-sm text-muted-foreground"><b class="font-medium text-foreground">{{ hits.length }}</b></span>
      <Tooltip label="Only this computer keeps these. Create buckets in Data.">
        <span class="inline-flex text-muted-foreground" tabindex="0" aria-label="Only this computer keeps these. Create buckets in Data."><Info class="size-3.5" /></span>
      </Tooltip>
    </div>
    <p v-if="error" class="px-5 py-3 text-xs text-destructive">The buckets here could not be listed: {{ error }}</p>
    <p v-else-if="!hits" class="px-5 py-3 text-xs text-muted-foreground">Looking for buckets on this computer…</p>
    <ul v-else-if="hits.length" class="divide-y divide-border-subtle">
      <li v-for="hit in hits" :key="`${hit.group_id}/${hit.bucket}`" class="flex items-center gap-3 px-5 py-2.5">
        <IconTile :icon="Package" tone="muted" size="sm" />
        <span class="min-w-0 flex-1">
          <RouterLink :to="bucketLink(hit)" class="block truncate text-sm font-medium text-foreground hover:underline">{{ hit.bucket }}</RouterLink>
          <RouterLink v-if="hit.group_name" :to="{ name: 'group', params: { id: hit.group_id } }" class="block truncate text-xs text-muted-foreground hover:text-foreground hover:underline">{{ hit.group_name }}</RouterLink>
        </span>
      </li>
    </ul>
    <div v-else class="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <p class="text-xs text-muted-foreground">No bucket is stored here.</p>
      <Button variant="outline" size="sm" as-child>
        <RouterLink :to="{ name: 'buckets', query: { create: 'bucket' } }"><Plus class="h-3.5 w-3.5" /> New bucket</RouterLink>
      </Button>
    </div>
  </section>
</template>
