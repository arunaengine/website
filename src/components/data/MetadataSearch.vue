<script setup lang="ts">
// One box that searches the stored details of a bucket's files and folders: words match search
// columns, `column=value` matches a filter column exactly and becomes a chip.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import { useAruna } from '@/composables/useAruna'
import type { ObjectSearchHit } from '@/lib/api'
import { searchQuery, searchTerms } from '@/lib/tableImport'
import { errorMessage } from '@/lib/utils'
import { Search, X } from '@lucide/vue'

const props = defineProps<{ bucket: string }>()
const emit = defineEmits<{ open: [key: string] }>()

const { searchObjects } = useAruna()
const typed = ref('')
const chips = ref<{ column: string; value: string }[]>([])
const hits = ref<ObjectSearchHit[] | null>(null)
const cursor = ref<string | null>(null)
const complete = ref(true)
const failure = ref<string | null>(null)
const busy = ref(false)
let runs = 0

watch(() => props.bucket, () => {
  typed.value = ''
  chips.value = []
  hits.value = null
})

const query = computed(() => searchQuery(searchTerms(typed.value).words, chips.value))

// Each `column=value` typed so far becomes a chip; the words stay in the box.
function takeChips() {
  const terms = searchTerms(typed.value)
  if (!terms.exact.length) return
  chips.value = [...chips.value, ...terms.exact]
  typed.value = terms.words.join(' ')
}

async function search(more = false) {
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
      <li v-for="hit in hits" :key="hit.key">
        <button type="button" class="w-full truncate px-3 py-1.5 text-left font-mono text-primary hover:bg-accent" @click="emit('open', hit.key)">{{ hit.key }}</button>
      </li>
    </ul>
    <p v-else-if="hits" class="text-xs text-muted-foreground">Nothing matches.</p>
    <p v-if="hits && !complete" class="text-[11px] text-muted-foreground">Some parts of this bucket could not be searched, so matches may be missing.</p>
    <Button v-if="cursor" size="sm" variant="ghost" :disabled="busy" @click="search(true)">Show more</Button>
  </section>
</template>
