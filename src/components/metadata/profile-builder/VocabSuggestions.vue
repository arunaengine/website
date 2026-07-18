<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Lightbulb } from '@lucide/vue'
import {
  loadVocabulary,
  searchVocabTerms,
  vocabSourceLabel,
  type VocabData,
  type VocabTerm,
} from '@/lib/profiles/vocabulary'

// Inline vocabulary suggestions under a term/class input: searches the bundled
// schema.org + Dublin Core vocabulary for the current query and offers matches
// as one-click picks. Renders nothing while empty — free text always stays
// possible; this only makes reuse easier than minting.
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
</script>

<template>
  <div v-if="matches.length" class="mt-1.5 rounded-md border border-border bg-muted/20 px-2.5 py-2">
    <p v-if="heading" class="mb-1 flex items-center gap-1 text-[11px] font-medium text-foreground">
      <Lightbulb class="h-3 w-3 shrink-0 text-amber-500" /> {{ heading }}
    </p>
    <ul class="space-y-0.5">
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
  </div>
</template>
