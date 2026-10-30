<script setup lang="ts">
// Beside the bucket list while no bucket is open: one tile per listed bucket, each opening it.
import { computed, onMounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import IconTile from '@/components/ui/IconTile.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import { useListedUsage } from '@/composables/useBucketUsage'
import { useDatabases } from '@/composables/useDatabases'
import type { DataManager } from '@/composables/useDataManager'
import { Boxes, ChevronRight, Database, FolderOpen, Package } from '@lucide/vue'

const props = defineProps<{ manager: DataManager }>()
const { allBuckets, sidebarBuckets, bucketNodeChoice, selectedGroupId, realmNodes } = props.manager
const databases = useDatabases()
const usage = useListedUsage()
onMounted(() => databases.ensure())

interface Tile {
  key: string
  bucket: string
  nodeId: string | null
  setId: string | null
  nodes: string[]
}
const own = (id: string | null) => (id && !realmNodes.isLocalNode(id) ? id : null)
const tiles = computed<Tile[]>(() =>
  bucketNodeChoice.value === null && !allBuckets.needsName.value
    ? allBuckets.hits.value.map((hit) => ({ key: hit.arn, bucket: hit.bucket, nodeId: own(hit.node_id), setId: hit.set_id ?? null, nodes: hit.set_id ? hit.nodes : [] }))
    : sidebarBuckets.value.map((entry) => ({ key: `${entry.nodeId ?? ''}/${entry.bucket}`, bucket: entry.bucket, nodeId: entry.nodeId ?? null, setId: null, nodes: [] })),
)
watch(tiles, (list) => usage.ensure(list.map(({ bucket, nodeId }) => ({ bucket, nodeId }))), { immediate: true })

const databaseOf = (tile: Tile) => databases.find(tile.bucket, tile.nodeId, tile.setId)
// One line for every tile: a database's title, the files and size, then where it is.
function lineOf(tile: Tile): string {
  const facts = usage.textOf(tile.bucket, tile.nodeId)
  const place = tile.nodes.length > 1 ? `spread over ${tile.nodes.length} nodes` : `on ${realmNodes.displayName(tile.nodeId ?? realmNodes.localNodeId.value)}`
  return [databaseOf(tile)?.title, facts, place].filter(Boolean).join(', ')
}
const target = (tile: Tile) => ({
  name: 'bucket',
  params: { bucketId: tile.bucket },
  query: { ...(tile.nodeId ? { node: tile.nodeId } : {}), ...(selectedGroupId.value ? { group: selectedGroupId.value } : {}) },
})
</script>

<template>
  <div class="flex min-w-0 flex-col">
    <SectionHeading title="Choose a bucket" :icon="FolderOpen" />
    <div class="surface flex flex-1 flex-col">
      <div class="px-5 py-8 text-center">
        <div class="mb-3 flex justify-center"><IconTile :icon="Boxes" tone="muted" /></div>
        <p class="text-sm font-medium text-foreground">Choose a bucket</p>
        <p class="mt-1 text-sm text-muted-foreground">Its files, folders and search show up here.</p>
      </div>
      <ul v-if="tiles.length" class="grid gap-3 border-t border-border-subtle p-4 sm:grid-cols-2 2xl:grid-cols-3">
        <li v-for="tile in tiles" :key="tile.key">
          <RouterLink
            :to="target(tile)"
            class="flex h-full items-center gap-3 rounded-lg border border-border-subtle bg-background/40 p-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
          >
            <IconTile :icon="databaseOf(tile) ? Database : Package" :tone="databaseOf(tile) ? 'royal' : 'muted'" size="sm" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium text-foreground">{{ tile.bucket }}</span>
              <span class="block text-xs tabular-nums text-muted-foreground">{{ lineOf(tile) }}</span>
            </span>
            <ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </RouterLink>
        </li>
      </ul>
    </div>
  </div>
</template>
