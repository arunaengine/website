<script setup lang="ts">
// Every bucket the owner can use, each with its place. A bucket on a device
// cannot be linked and stays greyed with the reason. Nothing is created here;
// the last row asks for New bucket instead.
import { computed, ref, watch } from 'vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useBucketSearch } from '@/composables/useBucketSearch'
import { useRealmNodes } from '@/composables/useRealmNodes'
import type { BucketSearchHit } from '@/lib/api'
import { placeName, placeTitle } from '@/lib/bucketPlace'
import { isHiddenBucket } from '@/lib/workspaces'
import { Boxes, Laptop, Plus, Search, Server } from '@lucide/vue'

const query = defineModel<string>({ default: '' })
const emit = defineEmits<{
  (e: 'select', hit: BucketSearchHit): void
  (e: 'new', name: string): void
}>()

const realmNodes = useRealmNodes()
const { hits, searching, searched, error, more, loadMore } = useBucketSearch(query, { listAll: true })
const open = ref(false)

const rows = computed(() =>
  hits.value
    .filter((hit) => !isHiddenBucket(hit.bucket))
    .map((hit) => {
      const node = realmNodes.nodeById(hit.node_id)
      const here = realmNodes.isLocalNode(hit.node_id)
      const device = here || node?.kind === 'user'
      return {
        hit,
        device,
        place: here ? 'This computer' : node ? placeName(node) : realmNodes.displayName(hit.node_id),
        title: node ? placeTitle(node) : hit.node_id,
        reason: here ? 'Already here, nothing to link' : device ? 'On another device, cannot be linked' : null,
      }
    }),
)
const typed = computed(() => query.value.trim())

// A page with nothing to show (only workspace buckets) asks for the next one.
watch(
  [rows, more, searching, error],
  () => {
    if (!rows.value.length && more.value && !searching.value && !error.value) void loadMore()
  },
  { immediate: true },
)

function pick(row: (typeof rows.value)[number]) {
  if (row.device) return
  open.value = false
  emit('select', row.hit)
}

function askNew() {
  open.value = false
  emit('new', typed.value)
}

function onFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  if (!next || !(event.currentTarget as HTMLElement).contains(next)) open.value = false
}
</script>

<template>
  <div class="relative" @focusin="open = true" @focusout="onFocusOut">
    <Search class="pointer-events-none absolute left-2.5 top-[18px] h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    <input
      v-model="query"
      role="combobox"
      aria-label="Bucket"
      :aria-expanded="open"
      placeholder="Find a bucket"
      class="h-9 w-full rounded-md border border-input bg-field pl-8 pr-3 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      @keydown.escape="open = false"
    />
    <div
      v-if="open"
      class="absolute left-0 right-0 top-10 z-40 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
    >
      <p v-if="error" class="px-3 py-2 text-[11px] text-destructive">{{ error }}</p>
      <Spinner v-else-if="searching && !rows.length" show-label label="Finding buckets…" class="px-3 py-2" />
      <ul v-if="rows.length" role="listbox" class="max-h-64 overflow-y-auto py-1">
        <li v-for="row in rows" :key="row.hit.arn">
          <button
            type="button"
            role="option"
            :aria-selected="false"
            :aria-disabled="row.device"
            :disabled="row.device"
            class="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-1.5 text-left text-xs"
            :class="row.device ? 'cursor-not-allowed opacity-60' : 'hover:bg-muted'"
            @mousedown.prevent
            @click="pick(row)"
          >
            <Boxes class="h-3.5 w-3.5 shrink-0" :class="row.device ? 'text-muted-foreground' : 'text-primary'" />
            <span class="font-mono text-foreground">{{ row.hit.bucket }}</span>
            <span class="flex min-w-0 items-center gap-1 text-muted-foreground" :title="row.title">
              <component :is="row.device ? Laptop : Server" class="h-3 w-3 shrink-0" />
              <span class="truncate">{{ row.place }}</span>
            </span>
            <span class="ml-auto text-muted-foreground">{{ row.reason ?? row.hit.group_name ?? '' }}</span>
          </button>
        </li>
      </ul>
      <p v-else-if="searched && !searching && !error && !more" class="px-3 py-2 text-[11px] text-muted-foreground">
        No bucket matched.
      </p>
      <button
        v-if="more"
        type="button"
        class="w-full border-t border-border px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        :disabled="searching"
        @mousedown.prevent
        @click="loadMore"
      >
        {{ searching ? 'Loading more…' : 'Load more' }}
      </button>
      <button
        type="button"
        class="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-xs text-primary hover:bg-muted"
        @mousedown.prevent
        @click="askNew"
      >
        <Plus class="h-3.5 w-3.5 shrink-0" /> {{ typed ? `New bucket "${typed}"…` : 'New bucket…' }}
      </button>
    </div>
  </div>
</template>
