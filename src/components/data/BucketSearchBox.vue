<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import { useAruna, isUnsupportedEndpoint } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useBucketShortcuts } from '@/composables/useBucketShortcuts'
import { featureEnabled } from '@/lib/config'
import { isWorkspaceBucket } from '@/lib/workspaces'
import type { BucketSearchHit } from '@/lib/api'
import { truncateMiddle } from '@/lib/utils'
import { useDebounceFn } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { AlertTriangle, ArrowLeftRight, Loader2, Pin, Search, X } from '@lucide/vue'

// Federated bucket search over GET /search/buckets. Two modes:
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
    placeholder?: string
  }>(),
  { modelValue: undefined, mode: 'browse', filterNodeId: null, placeholder: 'Find buckets across nodes…' },
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
const syncEnabled = featureEnabled('bucketSync')

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
// 404 from an older node: the endpoint does not exist there yet.
const unsupported = ref(false)
let seq = 0

const MIN_CHARS = 2
const active = computed(() => query.value.trim().length >= MIN_CHARS)
const partial = computed(() => nodesFailed.value > 0)

const visibleHits = computed(() =>
  hits.value.filter((hit) => {
    if (isWorkspaceBucket(hit.bucket)) return false
    if (props.filterNodeId && hit.node_id !== props.filterNodeId) return false
    return true
  }),
)

const runSearch = useDebounceFn(async (term: string) => {
  const mySeq = ++seq
  if (term.length < MIN_CHARS || !authToken.value || unsupported.value) {
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
    if (isUnsupportedEndpoint(err)) unsupported.value = true
    else error.value = err instanceof Error ? err.message : String(err)
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
}

function pinNodeId(hit: BucketSearchHit): string | null {
  return isLocalNode(hit.node_id) ? null : hit.node_id
}
</script>

<template>
  <div class="space-y-2">
    <div class="relative">
      <Search class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        v-model="query"
        :placeholder="placeholder"
        :aria-label="placeholder"
        class="h-8 w-full rounded-md border border-input bg-field pl-8 pr-7 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
      />
      <button
        v-if="query"
        type="button"
        aria-label="Clear bucket search"
        class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
        @click="clear"
      >
        <X class="h-3.5 w-3.5" />
      </button>
    </div>

    <p v-if="unsupported" class="rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground">
      Federated bucket search is not supported by this node yet.
    </p>

    <template v-else-if="active">
      <div
        v-if="partial && searched"
        role="status"
        class="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-300"
      >
        <AlertTriangle class="h-3.5 w-3.5 shrink-0" />
        <span>Partial results — {{ nodesQueried - nodesFailed }} of {{ nodesQueried }} nodes answered; matches on failed nodes are missing.</span>
      </div>

      <p v-if="error" class="px-1 text-[11px] text-destructive">{{ error }}</p>

      <div v-if="searching && !visibleHits.length" class="flex items-center gap-2 px-1 py-1 text-[11px] text-muted-foreground">
        <Loader2 class="h-3 w-3 animate-spin" /> Searching buckets…
      </div>

      <ul v-else-if="visibleHits.length" class="max-h-64 space-y-0.5 overflow-y-auto">
        <li v-for="hit in visibleHits" :key="hit.arn" class="group/hit flex items-center gap-1">
          <button
            type="button"
            class="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-muted"
            @click="pick(hit)"
          >
            <span class="truncate font-mono text-xs text-foreground">{{ hit.bucket }}</span>
            <span class="flex min-w-0 items-center gap-1.5">
              <Badge
                :variant="isLocalNode(hit.node_id) ? 'accent' : 'outline'"
                class="shrink-0 text-[10px]"
                :title="hit.node_id"
              >
                {{ isLocalNode(hit.node_id) ? 'this node' : displayName(hit.node_id) }}
              </Badge>
              <span class="truncate text-[10px] text-muted-foreground" :title="hit.group_id">
                {{ hit.group_name || truncateMiddle(hit.group_id) }}
              </span>
            </span>
          </button>
          <template v-if="mode === 'browse'">
            <Button
              v-if="syncEnabled && !isLocalNode(hit.node_id)"
              variant="ghost"
              size="icon-sm"
              class="shrink-0 opacity-0 transition-opacity group-hover/hit:opacity-100 focus-visible:opacity-100"
              :title="`Sync ${hit.bucket} from ${displayName(hit.node_id)} to this node…`"
              :aria-label="`Sync ${hit.bucket} to this node`"
              @click="emit('sync', hit)"
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
              @click="shortcuts.togglePin(hit.bucket, pinNodeId(hit))"
            >
              <Pin class="size-3.5" :fill="shortcuts.isPinned(hit.bucket, pinNodeId(hit)) ? 'currentColor' : 'none'" />
            </Button>
          </template>
        </li>
      </ul>

      <p v-else-if="searched && !searching" class="px-1 py-1 text-[11px] text-muted-foreground">
        No buckets matched.
      </p>
    </template>
  </div>
</template>
