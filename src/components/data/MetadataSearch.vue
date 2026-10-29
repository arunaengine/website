<script setup lang="ts">
// One box that searches a bucket's files and folders: words match file names and search columns,
// `column=value` matches a filter column exactly and becomes a chip.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import Button from '@/components/ui/Button.vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import type { ObjectSearchHit } from '@/lib/api'
import { searchQuery, searchTerms } from '@/lib/tableImport'
import { errorMessage } from '@/lib/utils'
import { Search, X } from '@lucide/vue'

/** `nodeId` is the node of the open bucket; null for the connected node. */
const props = defineProps<{ bucket: string; nodeId: string | null }>()
const emit = defineEmits<{ open: [hit: ObjectSearchHit] }>()

const { displayName, isLocalNode } = useRealmNodes()
// The search spans nodes by bucket name; a hit of another node names that node.
const elsewhere = (hit: ObjectSearchHit) => (props.nodeId ? hit.issuer_node_id !== props.nodeId : !isLocalNode(hit.issuer_node_id))

const { searchObjects, sessionEpoch } = useAruna()
const typed = ref('')
const chips = ref<{ column: string; value: string }[]>([])
const hits = ref<ObjectSearchHit[] | null>(null)
const cursor = ref<string | null>(null)
const nameCursor = ref<string | null>(null)
const nameWords = ref('')
const nameFailed = ref(false)
const complete = ref(true)
const failure = ref<string | null>(null)
const busy = ref(false)
let runs = 0
let unmounted = false

// Another bucket, node or session drops every answer still on its way, and the paging.
watch(() => [props.bucket, props.nodeId, sessionEpoch.value], () => {
  runs++
  typed.value = ''
  chips.value = []
  hits.value = null
  cursor.value = null
  nameCursor.value = null
  nameWords.value = ''
  nameFailed.value = false
  complete.value = true
  failure.value = null
  busy.value = false
})

const query = computed(() => searchQuery(searchTerms(typed.value).words, chips.value))

// Each `column=value` typed so far becomes a chip; the words stay in the box. A value whose quote
// is still open waits, so a space inside it does not cut it.
const quoteOpen = () => (typed.value.match(/"/g)?.length ?? 0) % 2 === 1
function takeChips() {
  if (quoteOpen()) return
  const terms = searchTerms(typed.value)
  if (!terms.exact.length) return
  chips.value = [...chips.value, ...terms.exact]
  typed.value = terms.words.join(' ')
}

// A search over a distributed bucket examines a bounded number of files per page, so a page may
// come back empty with a cursor; the search follows it until a hit arrives or the cursor ends.
// A newer search, another bucket or leaving the view ends it.
async function search(more = false) {
  if (unmounted) return
  if (quoteOpen()) typed.value += '"'
  takeChips()
  searchSoon.cancel()
  if (query.value.trim().length < 2) return
  const run = ++runs
  busy.value = true
  failure.value = null
  try {
    // A failed name page is asked again on Show more, not on each automatic page.
    for (let next = more, first = true; ; next = true, first = false) {
      const added = await step(next, run, first || !nameFailed.value)
      if (added === null) return
      if (added > 0 || (!cursor.value && (nameFailed.value || !nameCursor.value))) break
    }
  } catch (cause) {
    if (run === runs) failure.value = errorMessage(cause)
  } finally {
    if (run === runs) busy.value = false
  }
}
onBeforeUnmount(() => {
  unmounted = true
  runs++
  searchSoon.cancel()
})

/** One page of each search; the number of new hits, or null once a newer search took over. */
async function step(more: boolean, run: number, askNames: boolean): Promise<number | null> {
  const before = more ? (hits.value?.length ?? 0) : 0
  // Plain words also match file names; each search pages on its own cursor.
  const words = more ? nameWords.value : chips.value.length ? '' : typed.value.trim()
  const detailsCursor = more ? cursor.value : null
  const namesCursor = more ? nameCursor.value : null
  const [page, named] = await Promise.all([
    !more || detailsCursor ? searchObjects(query.value, { bucket: props.bucket, match: 'metadata', limit: 50, cursor: detailsCursor ?? undefined }) : null,
    askNames && words.length >= 2 && (!more || namesCursor !== null)
      ? searchObjects(words, { bucket: props.bucket, match: 'substring', limit: 50, cursor: namesCursor || undefined }).catch(() => 'failed' as const)
      : null,
  ])
  if (run !== runs) return null
  const names = named === 'failed' ? null : named
  const found = [...(more ? hits.value ?? [] : []), ...(names?.hits ?? []), ...(page?.hits ?? [])]
  const seen = new Set<string>()
  hits.value = found.filter((hit) => !seen.has(`${hit.issuer_node_id}/${hit.key}`) && Boolean(seen.add(`${hit.issuer_node_id}/${hit.key}`)))
  cursor.value = page?.next_cursor ?? null
  // A failed name page keeps its place ('' is the first page), so Show more asks for it again.
  if (names) nameCursor.value = names.next_cursor ?? null
  else if (named === 'failed') nameCursor.value = namesCursor ?? ''
  else if (!more) nameCursor.value = null
  nameWords.value = words
  nameFailed.value = named === null ? more && nameFailed.value : named === 'failed'
  complete.value = (!more || complete.value) && (page?.coverage.complete ?? true) && (names?.coverage.complete ?? true)
  return (hits.value?.length ?? 0) - before
}

// Words search while typing; a `column=value` waits for Enter or a space.
const searchSoon = useDebounceFn(() => void search(), 400)
// An edit or a removed chip ends the search under way and its paging at once.
function stop() {
  runs++
  busy.value = false
  cursor.value = null
  nameCursor.value = null
  searchSoon.cancel()
}
watch(typed, (text) => {
  stop()
  if (!text.includes('=') && !quoteOpen() && text.trim().length >= 2) void searchSoon()
}, { flush: 'sync' })

function drop(index: number) {
  chips.value = chips.value.filter((_, at) => at !== index)
  const searched = hits.value !== null || busy.value
  stop()
  if (searched) void search()
}
</script>

<template>
  <section class="space-y-2">
    <form class="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-field px-2 py-1" @submit.prevent="search()">
      <Search class="h-3.5 w-3.5 text-muted-foreground" />
      <span v-for="(chip, index) in chips" :key="`${chip.column}=${chip.value}`" class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
        {{ chip.column }} = {{ chip.value }}
        <button type="button" :aria-label="`Remove ${chip.column}`" @click="drop(index)"><X class="h-3 w-3" /></button>
      </span>
      <input
        v-model="typed"
        class="min-w-[8rem] flex-1 bg-transparent py-1 text-sm outline-none"
        placeholder="Search names and details"
        aria-label="Search file details"
        @keydown.space="takeChips"
      />
    </form>
    <p class="text-[11px] text-muted-foreground">Finds file names and imported details in the whole bucket. Use column=value for an exact match.</p>
    <p v-if="failure" class="text-xs text-destructive">{{ failure }}</p>
    <ul v-if="hits?.length" class="divide-y divide-border rounded-md border border-border text-xs">
      <li v-for="hit in hits" :key="`${hit.issuer_node_id}/${hit.key}`">
        <button type="button" class="w-full truncate px-3 py-1.5 text-left font-mono text-primary hover:bg-accent" @click="emit('open', hit)">
          {{ hit.key }}<span v-if="elsewhere(hit)" class="ml-2 font-sans text-muted-foreground">on {{ displayName(hit.issuer_node_id) }}</span>
        </button>
      </li>
    </ul>
    <p v-else-if="hits && !busy && complete && !nameFailed" class="text-xs text-muted-foreground">Nothing matches.</p>
    <p v-if="hits && !complete" class="text-[11px] text-muted-foreground">Some parts of this bucket could not be searched, so matches may be missing.</p>
    <p v-if="hits && nameFailed" class="text-[11px] text-muted-foreground">The name search failed, so matches by name may be missing.</p>
    <p v-if="busy" role="status" class="text-[11px] text-muted-foreground">Searching…</p>
    <Button v-if="cursor || nameCursor !== null" size="sm" variant="ghost" :disabled="busy" @click="search(true)">Show more</Button>
  </section>
</template>
