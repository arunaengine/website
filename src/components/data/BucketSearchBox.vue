<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import BucketRow from '@/components/data/BucketRow.vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useBucketShortcuts } from '@/composables/useBucketShortcuts'
import { syncBucketKey } from '@/lib/sync'
import { isWorkspaceBucket } from '@/lib/workspaces'
import type { BucketSearchHit } from '@/lib/api'
import { useDebounceFn } from '@vueuse/core'
import { computed, ref, useId, watch } from 'vue'
import { AlertTriangle, ArrowLeftRight, Loader2, Search, X } from '@lucide/vue'

// Federated bucket search over GET /search/buckets, rendered as a compact
// combobox: one input, results in a dropdown overlay. Local and remote hits
// share one list; remote rows carry a small node annotation. Two modes:
//  - browse (Data manager sidebar): rows open the bucket; pin toggles and a
//    "sync to this node" affordance on remote hits.
//  - picker (dialogs): the input doubles as the bucket-name field (v-model);
//    rows fill it in and emit `select`.
// Debounced with request-id staleness; ws-* scratch buckets never surface.
const props = withDefaults(
  defineProps<{
    modelValue?: string
    mode?: 'browse' | 'picker'
    /** Picker: restrict suggestions to buckets hosted on this node. */
    filterNodeId?: string | null
    /** Picker: hide this bucket when it is hosted on the connected node. */
    excludeLocalBucket?: string
    /** Picker: explain that an unmatched value may create a new bucket. */
    allowNew?: boolean
    placeholder?: string
    /** Buckets with sync relationships, keyed by lib/sync syncBucketKey; hits show the sync glyph. */
    syncByBucket?: ReadonlyMap<string, unknown> | null
  }>(),
  {
    modelValue: undefined,
    mode: 'browse',
    filterNodeId: null,
    excludeLocalBucket: undefined,
    allowNew: false,
    placeholder: 'Find buckets across nodes…',
    syncByBucket: null,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'open', hit: BucketSearchHit): void
  (e: 'select', hit: BucketSearchHit): void
  (e: 'sync', hit: BucketSearchHit): void
}>()

const { authToken, searchBuckets } = useAruna()
const { displayName, isLocalNode, localNodeId } = useRealmNodes()

// Same (node, bucket) key the Data manager builds its overview map with.
function hitSynced(hit: BucketSearchHit): boolean {
  if (!props.syncByBucket) return false
  const nodeId = isLocalNode(hit.node_id) ? (localNodeId.value ?? '') : hit.node_id
  return props.syncByBucket.has(syncBucketKey(nodeId, hit.bucket))
}
const shortcuts = useBucketShortcuts()

const listId = `bucket-search-results-${useId()}`

const query = ref(props.modelValue ?? '')
watch(
  () => props.modelValue,
  (value) => {
    if (value !== undefined && value !== query.value) query.value = value
  },
)

const hits = ref<BucketSearchHit[]>([])
const nodesQueried = ref(0)
const nodesFailed = ref(0)
const searching = ref(false)
const searched = ref(false)
const error = ref<string | null>(null)
let seq = 0

const MIN_CHARS = 2
const active = computed(() => query.value.trim().length >= MIN_CHARS)
const partial = computed(() => nodesFailed.value > 0)

const visibleHits = computed(() =>
  hits.value.filter((hit) => {
    if (isWorkspaceBucket(hit.bucket)) return false
    if (props.filterNodeId && hit.node_id !== props.filterNodeId) return false
    if (props.excludeLocalBucket === hit.bucket && isLocalNode(hit.node_id)) return false
    return true
  }),
)

// Dropdown state: opens on focus/typing, closes on blur (deferred so
// mousedown on a row lands first), Escape, or a browse-mode pick.
const open = ref(false)
const activeIndex = ref(-1)
watch(visibleHits, () => (activeIndex.value = -1))
watch(query, () => (activeIndex.value = -1))
const dropdownVisible = computed(() => open.value && active.value)
let hideTimer: number | undefined

function show() {
  if (hideTimer !== undefined) window.clearTimeout(hideTimer)
  open.value = true
}

function scheduleHide() {
  hideTimer = window.setTimeout(() => (open.value = false), 120)
}

function onKeydown(event: KeyboardEvent) {
  const list = visibleHits.value
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    open.value = true
    activeIndex.value = list.length ? (activeIndex.value + 1) % list.length : -1
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = list.length ? (activeIndex.value - 1 + list.length) % list.length : -1
  } else if (event.key === 'Enter') {
    const hit = list[activeIndex.value]
    if (hit) pick(hit)
  } else if (event.key === 'Escape') {
    open.value = false
  }
}

const runSearch = useDebounceFn(async (term: string) => {
  const mySeq = ++seq
  if (term.length < MIN_CHARS || !authToken.value) {
    hits.value = []
    searching.value = false
    searched.value = false
    return
  }
  searching.value = true
  error.value = null
  try {
    const response = await searchBuckets(term)
    if (mySeq !== seq) return
    hits.value = response.hits
    nodesQueried.value = response.nodes_queried
    nodesFailed.value = response.nodes_failed
    searched.value = true
  } catch (err) {
    if (mySeq !== seq) return
    hits.value = []
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (mySeq === seq) searching.value = false
  }
}, 250)

watch(
  query,
  (value) => {
    emit('update:modelValue', value)
    void runSearch(value.trim())
  },
  { immediate: true },
)

function clear() {
  query.value = ''
  hits.value = []
  searched.value = false
  error.value = null
}

function pick(hit: BucketSearchHit) {
  if (props.mode === 'picker') {
    query.value = hit.bucket
    emit('select', hit)
  } else {
    emit('open', hit)
  }
  open.value = false
}

function syncHit(hit: BucketSearchHit) {
  open.value = false
  emit('sync', hit)
}

function pinNodeId(hit: BucketSearchHit): string | null {
  return isLocalNode(hit.node_id) ? null : hit.node_id
}
</script>

<template>
  <div class="relative">
    <Search class="pointer-events-none absolute left-2.5 top-4 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    <input
      v-model="query"
      role="combobox"
      :aria-controls="listId"
      :aria-expanded="dropdownVisible"
      :placeholder="placeholder"
      :aria-label="placeholder"
      class="h-8 w-full rounded-md border border-input bg-field pl-8 pr-7 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
      @focus="show"
      @blur="scheduleHide"
      @keydown="onKeydown"
    />
    <button
      v-if="query"
      type="button"
      aria-label="Clear bucket search"
      class="absolute right-1.5 top-4 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
      @mousedown.prevent
      @click="clear"
    >
      <X class="h-3.5 w-3.5" />
    </button>

    <div
      v-if="dropdownVisible"
      :id="listId"
      class="absolute left-0 right-0 top-9 z-40 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
    >
      <div
        v-if="partial && searched"
        role="status"
        class="flex items-center gap-1.5 border-b border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-300"
      >
        <AlertTriangle class="h-3.5 w-3.5 shrink-0" />
        <span>Partial results, {{ nodesQueried - nodesFailed }} of {{ nodesQueried }} nodes answered; matches on failed nodes are missing.</span>
      </div>

      <p v-if="error" class="px-2.5 py-2 text-[11px] text-destructive">{{ error }}</p>

      <div v-else-if="searching && !visibleHits.length" class="flex items-center gap-2 px-2.5 py-2 text-[11px] text-muted-foreground">
        <Loader2 class="h-3 w-3 animate-spin" /> Searching buckets…
      </div>

      <ul v-else-if="visibleHits.length" role="listbox" class="max-h-64 overflow-y-auto p-1">
        <li v-for="(hit, index) in visibleHits" :key="hit.arn">
          <BucketRow
            :bucket="hit.bucket"
            :node-id="pinNodeId(hit)"
            :pinned="shortcuts.isPinned(hit.bucket, pinNodeId(hit))"
            :synced="hitSynced(hit)"
            :subtitle="hit.group_name || null"
            :highlighted="index === activeIndex"
            option
            open-on-mousedown
            :pinnable="mode === 'browse'"
            @open="pick(hit)"
            @toggle-pin="shortcuts.togglePin(hit.bucket, pinNodeId(hit))"
          >
            <template #tooltip>
              <dl class="grid max-w-72 grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1">
                <dt class="text-muted-foreground">Node</dt>
                <dd class="min-w-0 break-all"><span class="font-medium">{{ displayName(hit.node_id) }}</span><br><span class="font-mono text-[10px]">{{ hit.node_id }}</span></dd>
                <dt class="text-muted-foreground">Group</dt>
                <dd class="min-w-0 break-all"><span class="font-medium">{{ hit.group_name || 'Unnamed group' }}</span><br><span class="font-mono text-[10px]">{{ hit.group_id }}</span></dd>
              </dl>
            </template>
            <template v-if="mode === 'browse' && !isLocalNode(hit.node_id)" #actions>
              <Button
                variant="ghost"
                size="icon-sm"
                class="shrink-0 text-muted-foreground hover:text-foreground"
                :title="`Sync ${hit.bucket} from ${displayName(hit.node_id)} to this node…`"
                :aria-label="`Sync ${hit.bucket} to this node`"
                @mousedown.prevent="syncHit(hit)"
              >
                <ArrowLeftRight class="size-3.5" />
              </Button>
            </template>
          </BucketRow>
        </li>
      </ul>

      <p v-else-if="searched && !searching" class="px-2.5 py-2 text-[11px] text-muted-foreground">
        {{ allowNew ? 'No existing bucket matched. This name will create a new target bucket.' : 'No buckets matched.' }}
      </p>

      <div v-else class="flex items-center gap-2 px-2.5 py-2 text-[11px] text-muted-foreground">
        <Loader2 class="h-3 w-3 animate-spin" /> Searching buckets…
      </div>
    </div>
  </div>
</template>
