<script setup lang="ts">
// One box that searches the stored details of a bucket's files and folders: words match search
// columns, `column=value` matches a filter column exactly and becomes a chip.
import { computed, ref, watch } from 'vue'
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
const complete = ref(true)
const failure = ref<string | null>(null)
const busy = ref(false)
let runs = 0

// Another bucket, node or session drops every answer still on its way, and the paging.
watch(() => [props.bucket, props.nodeId, sessionEpoch.value], () => {
  runs++
  typed.value = ''
  chips.value = []
  hits.value = null
  cursor.value = null
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

async function search(more = false) {
  if (quoteOpen()) typed.value += '"'
  takeChips()
  if (query.value.trim().length < 2) return
  const run = ++runs
  busy.value = true
  failure.value = null
  try {
    const page = await searchObjects(query.value, { bucket: props.bucket, match: 'metadata', limit: 50, cursor: more ? cursor.value ?? undefined : undefined })
    if (run !== runs) return
    hits.value = more ? [...(hits.value ?? []), ...page.hits] : page.hits
    cursor.value = page.next_cursor ?? null
    complete.value = page.coverage.complete
  } catch (cause) {
    if (run === runs) failure.value = errorMessage(cause)
  } finally {
    if (run === runs) busy.value = false
  }
}

function drop(index: number) {
  chips.value = chips.value.filter((_, at) => at !== index)
  if (hits.value) void search()
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
        placeholder="Search file details"
        aria-label="Search file details"
        @keydown.space="takeChips"
      />
    </form>
    <p class="text-[11px] text-muted-foreground">Type words, or column=value for an exact match.</p>
    <p v-if="failure" class="text-xs text-destructive">{{ failure }}</p>
    <ul v-if="hits?.length" class="divide-y divide-border rounded-md border border-border text-xs">
      <li v-for="hit in hits" :key="`${hit.issuer_node_id}/${hit.key}`">
        <button type="button" class="w-full truncate px-3 py-1.5 text-left font-mono text-primary hover:bg-accent" @click="emit('open', hit)">
          {{ hit.key }}<span v-if="elsewhere(hit)" class="ml-2 font-sans text-muted-foreground">on {{ displayName(hit.issuer_node_id) }}</span>
        </button>
      </li>
    </ul>
    <p v-else-if="hits" class="text-xs text-muted-foreground">Nothing matches.</p>
    <p v-if="hits && !complete" class="text-[11px] text-muted-foreground">Some parts of this bucket could not be searched, so matches may be missing.</p>
    <Button v-if="cursor" size="sm" variant="ghost" :disabled="busy" @click="search(true)">Show more</Button>
  </section>
</template>
