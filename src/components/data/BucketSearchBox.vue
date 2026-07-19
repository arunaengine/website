<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useBucketShortcuts } from '@/composables/useBucketShortcuts'
import { isWorkspaceBucket } from '@/lib/workspaces'
import type { BucketSearchHit } from '@/lib/api'
import { truncateMiddle } from '@/lib/utils'
import { useDebounceFn } from '@vueuse/core'
import { computed, ref, useId, watch } from 'vue'
import { AlertTriangle, ArrowLeftRight, Loader2, Pin, Search, X } from '@lucide/vue'

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
  }>(),
  {
    modelValue: undefined,
    mode: 'browse',
    filterNodeId: null,
    excludeLocalBucket: undefined,
    allowNew: false,
    placeholder: 'Find buckets across nodes…',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'open', hit: BucketSearchHit): void
  (e: 'select', hit: BucketSearchHit): void
  (e: 'sync', hit: BucketSearchHit): void
}>()

const { authToken, searchBuckets } = useAruna()
const { displayName, isLocalNode } = useRealmNodes()
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
      class="absolute left-0 right-0 top-9 z-40 overflow-hidden rounded-md border border-border bg-popover shadow-xl"
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

      <ul v-else-if="visibleHits.length" role="listbox" class="max-h-64 overflow-y-auto py-1">
        <li v-for="(hit, index) in visibleHits" :key="hit.arn" class="group/hit flex items-center gap-1 pr-1">
          <button
            type="button"
            role="option"
            :aria-selected="index === activeIndex"
            class="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted"
            :class="index === activeIndex ? 'bg-muted' : ''"
            @mousedown.prevent="pick(hit)"
          >
            <span class="truncate font-mono text-xs text-foreground">{{ hit.bucket }}</span>
            <span class="ml-auto flex min-w-0 shrink-0 items-center gap-1.5">
              <span class="max-w-24 truncate text-[10px] text-muted-foreground" :title="hit.group_id">
                Group: {{ hit.group_name || truncateMiddle(hit.group_id) }}
              </span>
              <Badge
                v-if="!isLocalNode(hit.node_id)"
                variant="outline"
                class="shrink-0 text-[10px]"
                :title="hit.node_id"
              >
                on {{ displayName(hit.node_id) }}
              </Badge>
            </span>
          </button>
          <template v-if="mode === 'browse'">
            <Button
              v-if="!isLocalNode(hit.node_id)"
              variant="ghost"
              size="icon-sm"
              class="shrink-0 opacity-0 transition-opacity group-hover/hit:opacity-100 focus-visible:opacity-100"
              :title="`Sync ${hit.bucket} from ${displayName(hit.node_id)} to this node…`"
              :aria-label="`Sync ${hit.bucket} to this node`"
              @mousedown.prevent="syncHit(hit)"
            >
              <ArrowLeftRight class="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              class="shrink-0"
              :class="shortcuts.isPinned(hit.bucket, pinNodeId(hit)) ? 'text-primary' : 'text-muted-foreground opacity-0 transition-opacity group-hover/hit:opacity-100 focus-visible:opacity-100'"
              :title="shortcuts.isPinned(hit.bucket, pinNodeId(hit)) ? 'Unpin bucket' : 'Pin bucket'"
              :aria-label="shortcuts.isPinned(hit.bucket, pinNodeId(hit)) ? `Unpin ${hit.bucket}` : `Pin ${hit.bucket}`"
              @mousedown.prevent
              @click="shortcuts.togglePin(hit.bucket, pinNodeId(hit))"
            >
              <Pin class="size-3.5" :fill="shortcuts.isPinned(hit.bucket, pinNodeId(hit)) ? 'currentColor' : 'none'" />
            </Button>
          </template>
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
