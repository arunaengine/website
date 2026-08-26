<script lang="ts">
import { ref } from 'vue'

// Per-session dismissal of the remote-degradation hint, module-scoped so
// dismissing it in one picker hides it in every picker until the next reload.
const remoteHintDismissed = ref(false)
</script>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { Globe, Lightbulb, Loader2 } from '@lucide/vue'
import {
  loadVocabulary,
  searchVocabTerms,
  vocabSourceLabel,
  type VocabData,
  type VocabTerm,
} from '@/lib/profiles/vocabulary'
import { termNameFromUri } from '@/lib/profiles/uri'
import { BUNDLED_PROVIDER_ID, searchAll } from '@/lib/terminology/registry'
import type { ProviderStatus, TermHit } from '@/lib/terminology/types'

// Inline vocabulary suggestions under a term/class input. Section 1 searches
// the bundled schema.org + Dublin Core vocabulary (instant, always available,
// offline); section 2 streams additional hits from remote terminology services
// (TS4NFDI gateway) as they land. Renders nothing while empty.
// Free text always stays possible; this only makes reuse easier than minting.
// Remote degradation is soft by design: bundled results always stand, remote
// failures surface as a dismissible hint plus a status dot, never an error.
const props = defineProps<{
  query: string
  kind: 'property' | 'class'
  // Optional lead-in ("Consider an existing term instead of minting:").
  heading?: string
  // URIs to exclude (e.g. the currently selected term).
  exclude?: string[]
}>()

const emit = defineEmits<{ (e: 'pick', term: VocabTerm): void }>()

const vocab = ref<VocabData | null>(null)
onMounted(() => {
  void loadVocabulary().then((data) => {
    vocab.value = data
  })
})

// Small debounce so fast typing doesn't churn the ranking on every keystroke.
const debounced = ref(props.query)
let timer: number | undefined
watch(
  () => props.query,
  (value) => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      debounced.value = value
    }, 150)
  },
)

const matches = computed<VocabTerm[]>(() => {
  if (!vocab.value) return []
  const pool = props.kind === 'property' ? vocab.value.properties : vocab.value.classes
  const excluded = new Set(props.exclude ?? [])
  return searchVocabTerms(pool, debounced.value, 6).filter((term) => !excluded.has(term.uri))
})

// ---------------------------------------------------------------------------
// Remote terminology providers (streamed via the terminology registry).
// ---------------------------------------------------------------------------
interface RemoteResult {
  label: string
  status: ProviderStatus
  hits: TermHit[]
}

const remoteResults = ref<Record<string, RemoteResult>>({})
const remotePending = ref(false)
let searchAbort: AbortController | null = null
let searchSeq = 0

// The registry runs the bundled provider too (it is the dedupe baseline remote
// hits merge into); section 1 keeps its own instant VocabTerm search above, so
// bundled updates are simply ignored here.
function runRemoteSearch(query: string) {
  searchAbort?.abort()
  searchAbort = null
  const seq = ++searchSeq
  remoteResults.value = {}
  remotePending.value = false
  const trimmed = query.trim()
  // Remote lookups need a real word: skip empty/1-char queries and pasted URIs.
  if (trimmed.length < 2 || /^https?:/i.test(trimmed)) return
  const controller = new AbortController()
  searchAbort = controller
  remotePending.value = true
  void searchAll(
    trimmed,
    (update) => {
      if (seq !== searchSeq || update.providerId === BUNDLED_PROVIDER_ID) return
      remoteResults.value = {
        ...remoteResults.value,
        [update.providerId]: { label: update.providerLabel, status: update.status, hits: update.hits },
      }
    },
    { kinds: [props.kind], limit: 100, signal: controller.signal },
  ).finally(() => {
    if (seq === searchSeq) remotePending.value = false
  })
}

// The remote leg gets its own, slower debounce (the bundled section above keeps
// the snappy 150ms one): the gateway is a slow federated fan-out, and firing on
// every keystroke aborts the in-flight request before it can ever complete, so
// a steady typist would never see a remote result at all. Waiting for a real
// typing pause lets slow-but-healthy responses actually land; stale-while-
// revalidate caching then serves repeats instantly.
const remoteDebounced = ref(props.query)
let remoteTimer: number | undefined
watch(
  () => props.query,
  (value) => {
    window.clearTimeout(remoteTimer)
    remoteTimer = window.setTimeout(() => {
      remoteDebounced.value = value
    }, 600)
  },
)
watch(remoteDebounced, runRemoteSearch, { immediate: true })
onUnmounted(() => searchAbort?.abort())

// Registry output is already deduped against bundled hits by normalized IRI;
// the exclude/section-1 re-check here only guards display-order edge cases.
const remoteHits = computed<TermHit[]>(() => {
  const excluded = new Set([...(props.exclude ?? []), ...matches.value.map((term) => term.uri)])
  return Object.values(remoteResults.value)
    .flatMap((result) => result.hits)
    .filter((hit) => !excluded.has(hit.iri))
})

const degraded = computed(() =>
  Object.values(remoteResults.value).filter((result) => result.status === 'timeout' || result.status === 'error'),
)
const degradedTooltip = computed(() =>
  degraded.value
    .map((result) => `${result.label}: ${result.status === 'timeout' ? 'timed out' : 'unreachable'}`)
    .join('; '),
)
const showDegradedHint = computed(() => degraded.value.length > 0 && !remoteHintDismissed.value)
const showRemoteSection = computed(
  () => remotePending.value || remoteHits.value.length > 0 || showDegradedHint.value,
)

// A remote pick flows through the same VocabTerm pick path as a bundled one:
// the rule (and later the profile crate's mode-file context) bakes uri, label,
// description and source, so the published profile never depends on the
// remote service being reachable again.
function pickRemote(hit: TermHit) {
  emit('pick', {
    uri: hit.iri,
    name: hit.shortForm || termNameFromUri(hit.iri),
    label: hit.label,
    description: hit.definition ?? '',
    source: hit.ontology ?? hit.source,
  })
}
</script>

<template>
  <div
    v-if="matches.length || showRemoteSection"
    class="mt-1.5 rounded-md border border-border bg-muted/20 px-2.5 py-2"
  >
    <p v-if="heading" class="mb-1 flex items-center gap-1 text-[11px] font-medium text-foreground">
      <Lightbulb class="h-3 w-3 shrink-0 text-amber-500" /> {{ heading }}
    </p>
    <ul v-if="matches.length" class="space-y-0.5">
      <li v-for="term in matches" :key="term.uri">
        <!-- mousedown.prevent keeps the anchoring input focused, so a blur
             handler on it cannot unmount this list before the click lands. -->
        <button
          type="button"
          class="flex w-full items-baseline gap-1.5 rounded px-1.5 py-1 text-left text-[11px] transition-colors hover:bg-muted"
          :title="term.uri"
          @mousedown.prevent
          @click="emit('pick', term)"
        >
          <span class="shrink-0 font-medium text-foreground">{{ term.label }}</span>
          <span class="shrink-0 text-muted-foreground">{{ vocabSourceLabel(term) }}</span>
          <span class="min-w-0 truncate text-muted-foreground">{{ term.description }}</span>
        </button>
      </li>
    </ul>

    <!-- Section 2: streamed remote hits. Only ever additive on top of the
         bundled results; a degraded provider shows a hint + status dot. -->
    <div v-if="showRemoteSection" :class="matches.length ? 'mt-1.5 border-t border-border/60 pt-1.5' : ''">
      <p class="mb-0.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        More from terminology services
        <Loader2 v-if="remotePending" class="h-3 w-3 shrink-0 animate-spin" />
        <span
          v-if="degraded.length"
          class="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
          :title="degradedTooltip"
        />
      </p>
      <ul v-if="remoteHits.length" class="max-h-64 space-y-0.5 overflow-y-auto scrollbar-thin">
        <li v-for="hit in remoteHits" :key="hit.iri">
          <button
            type="button"
            class="flex w-full items-baseline gap-1.5 rounded px-1.5 py-1 text-left text-[11px] transition-colors hover:bg-muted"
            :title="hit.iri"
            @mousedown.prevent
            @click="pickRemote(hit)"
          >
            <span class="shrink-0 font-medium text-foreground">{{ hit.label }}</span>
            <span class="inline-flex shrink-0 items-center gap-0.5 text-muted-foreground" :title="hit.iri">
              <Globe class="h-2.5 w-2.5 shrink-0" /> {{ hit.ontology ?? hit.source }}
            </span>
            <span class="min-w-0 truncate text-muted-foreground">{{ hit.definition }}</span>
          </button>
        </li>
      </ul>
      <p
        v-if="showDegradedHint"
        class="mt-1 flex items-baseline gap-1.5 text-[11px] text-muted-foreground"
      >
        <span class="min-w-0">Remote terminology service unreachable, showing bundled vocabulary.</span>
        <button
          type="button"
          class="shrink-0 font-medium underline-offset-2 hover:text-foreground hover:underline"
          @mousedown.prevent
          @click="remoteHintDismissed = true"
        >
          Dismiss
        </button>
      </p>
    </div>
  </div>
</template>
