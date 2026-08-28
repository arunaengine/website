<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import {
  propertyKey,
  typeLabel,
  valueKindsFor,
  VALUE_KIND_LABELS,
  vocabTypes,
  type DraftEntity,
  type DraftValueKind,
} from '@/lib/crate/editor'
import { isAbsoluteUri } from '@/lib/profiles/uri'
import type { VocabIndex, VocabTerm } from '@/lib/profiles/vocabulary'

const props = defineProps<{ entity: DraftEntity; vocab: VocabIndex | null }>()
const emit = defineEmits<{
  (e: 'pick', value: { key: string; kind: DraftValueKind }): void
  (e: 'close'): void
}>()

const LIMIT = 25
const CURIE = /^[A-Za-z][\w-]*:[\w-]+$/
// What a dataset author reaches for first; everything else stays alphabetical.
const COMMON = [
  'name',
  'description',
  'datePublished',
  'license',
  'author',
  'keywords',
  'identifier',
  'url',
  'publisher',
  'funder',
  'citation',
  'contactPoint',
  'spatialCoverage',
  'temporalCoverage',
  'contentUrl',
  'encodingFormat',
  'contentSize',
]

const query = ref('')
const showAll = ref(false)
const pending = ref<{ key: string; kinds: DraftValueKind[] } | null>(null)

const used = computed(() => new Set(Object.keys(props.entity.properties)))
const text = computed(() => query.value.trim())

function unused(term: VocabTerm): boolean {
  return !used.value.has(propertyKey(term))
}

function matches(term: VocabTerm): boolean {
  const needle = text.value.toLowerCase()
  if (!needle) return true
  return `${term.name} ${term.label} ${term.description}`.toLowerCase().includes(needle)
}

const suggested = computed(() => (props.vocab?.propertiesForTypes(vocabTypes(props.entity)) ?? [])
  .filter((term) => unused(term) && matches(term))
  .sort((a, b) => rankOf(a) - rankOf(b) || a.label.localeCompare(b.label, 'en')))

function rankOf(term: VocabTerm): number {
  const position = COMMON.indexOf(term.name)
  return position < 0 ? COMMON.length : position
}

const all = computed(() => {
  if (!showAll.value && !text.value) return []
  const hits = text.value
    ? props.vocab?.searchProperties(text.value, vocabTypes(props.entity), LIMIT * 2) ?? []
    : props.vocab?.properties ?? []
  const suggestedUris = new Set(suggested.value.map((term) => term.uri))
  return hits.filter((term) => unused(term) && !suggestedUris.has(term.uri)).slice(0, LIMIT)
})

// Anything the bundled vocabulary does not know can still be written down.
const custom = computed(() => (CURIE.test(text.value) || isAbsoluteUri(text.value) ? text.value : ''))

function choose(key: string) {
  const kinds = valueKindsFor(props.vocab, key)
  if (kinds.length > 1) {
    pending.value = { key, kinds }
    return
  }
  emit('pick', { key, kind: kinds[0] })
}
</script>

<template>
  <div class="absolute left-0 top-full z-30 mt-1 w-96 rounded-md border border-border bg-popover p-2 shadow-md">
    <template v-if="pending">
      <p class="px-1 py-1 text-xs text-muted-foreground">What kind of value does {{ pending.key }} take?</p>
      <div class="mt-1 flex flex-wrap gap-2">
        <Button
          v-for="kind in pending.kinds"
          :key="kind"
          variant="outline"
          size="sm"
          @click="emit('pick', { key: pending.key, kind })"
        >
          {{ VALUE_KIND_LABELS[kind] }}
        </Button>
      </div>
    </template>

    <template v-else>
      <Input v-model="query" placeholder="Search properties" aria-label="Search properties" />
      <p class="mt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Suggested for {{ entity.types.map(typeLabel).join(', ') }}
      </p>
      <ul class="mt-1 max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border">
        <li v-for="term in suggested" :key="term.uri">
          <button type="button" class="w-full px-2.5 py-1.5 text-left hover:bg-muted/40" @click="choose(propertyKey(term))">
            <span class="text-xs font-medium text-foreground">{{ term.label }}</span>
            <span class="ml-1.5 text-[11px] text-muted-foreground">{{ (term.targets ?? []).map(typeLabel).join(', ') }}</span>
            <span v-if="term.description" class="line-clamp-1 text-[11px] text-muted-foreground">{{ term.description }}</span>
          </button>
        </li>
        <li v-if="!suggested.length" class="px-2.5 py-2 text-xs text-muted-foreground">
          No suggestion left for this type.
        </li>
      </ul>

      <label class="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          :checked="showAll"
          aria-label="Show all properties"
          @change="(event: Event) => (showAll = (event.target as HTMLInputElement).checked)"
        />
        Show all properties
      </label>

      <ul v-if="all.length" class="mt-1 max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border">
        <li v-for="term in all" :key="term.uri">
          <button type="button" class="w-full px-2.5 py-1.5 text-left hover:bg-muted/40" @click="choose(propertyKey(term))">
            <span class="text-xs font-medium text-foreground">{{ term.label }}</span>
            <span class="ml-1.5 text-[11px] text-muted-foreground">{{ (term.targets ?? []).map(typeLabel).join(', ') }}</span>
            <span v-if="term.description" class="line-clamp-1 text-[11px] text-muted-foreground">{{ term.description }}</span>
          </button>
        </li>
      </ul>

      <button
        v-if="custom"
        type="button"
        class="mt-2 w-full rounded-md border border-dashed border-border px-2.5 py-1.5 text-left text-xs hover:bg-muted/40"
        @click="choose(custom)"
      >
        Use custom term <span class="font-mono">{{ custom }}</span>
      </button>

      <div class="mt-2 flex justify-end">
        <Button variant="ghost" size="sm" @click="emit('close')">Close</Button>
      </div>
    </template>
  </div>
</template>
