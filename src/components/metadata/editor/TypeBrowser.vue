<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Input from '@/components/ui/Input.vue'
import { CURATED_TYPES, typeLabel, vocabTypeUri, type TypeOption } from '@/lib/crate/editor'
import { isDataEntity } from '@/lib/dataEntities'
import { normalizeTypeUri, SCHEMA_ORG } from '@/lib/profiles/uri'
import type { VocabIndex, VocabTerm } from '@/lib/profiles/vocabulary'

// The one type list: the common types on top, every bundled class behind
// them. A host with its own search box passes `query`; otherwise the list
// carries one itself.
const props = defineProps<{
  vocab: VocabIndex | null
  modelValue: string
  query?: string
  /** Property range: when set, "Only matching types" narrows the list to it. */
  range?: string[]
  onlyMatching?: boolean
  /** Contextual entities only: the types that describe stored data are hidden. */
  excludeData?: boolean
  /** Picks an unambiguous search result unless the host mixes in other options. */
  autoSelect?: boolean
  /** The types the picked profile describes, offered first whether or not the vocabulary knows them. */
  profileTypes?: TypeOption[]
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', type: string): void
  (e: 'update:onlyMatching', value: boolean): void
}>()

const ALL_LIMIT = 40
const ownQuery = ref('')
const text = computed(() => (props.query ?? ownQuery.value).trim())

// The curated shortlist keeps its crate names (File is RO-Crate's, not
// schema.org's); everything else comes from the bundled vocabulary.
const curated = computed(() => CURATED_TYPES.map((type) => ({
  type,
  label: type,
  description: props.vocab?.class(vocabTypeUri(type))?.description ?? '',
})))

const rangeTypes = computed(() => new Set((props.vocab?.classesInRange(props.range) ?? []).map((term) => term.uri)))

function allowed(type: string): boolean {
  if (props.excludeData && isDataEntity([type])) return false
  if (!props.onlyMatching || !rangeTypes.value.size) return true
  return rangeTypes.value.has(vocabTypeUri(type))
}

function asOption(term: VocabTerm) {
  return { type: term.source === 'schema.org' ? term.name : term.uri, label: term.label, description: term.description }
}

const profiled = computed(() => (props.profileTypes ?? [])
  .map((option) => ({ ...option, type: normalizeTypeUri(option.type).startsWith(SCHEMA_ORG) ? typeLabel(option.type) : option.type }))
  .filter((option) => allowed(option.type)))

function outside(options: TypeOption[], taken: TypeOption[]): TypeOption[] {
  return options.filter((option) => !taken.some((entry) => normalizeTypeUri(entry.type) === normalizeTypeUri(option.type)))
}

const results = computed(() => {
  if (!text.value) {
    const shortlist = outside(curated.value.filter((option) => allowed(option.type)), profiled.value)
    const all = outside((props.vocab?.classes ?? [])
      .filter((term) => allowed(term.uri) && !CURATED_TYPES.includes(term.name))
      .slice(0, ALL_LIMIT)
      .map(asOption), profiled.value)
    return { profile: profiled.value, shortlist, all }
  }
  const matches = (option: TypeOption) => option.label.toLowerCase().includes(text.value.toLowerCase())
  const profile = profiled.value.filter(matches)
  const hits = (props.vocab?.searchClasses(text.value, ALL_LIMIT) ?? [])
    .filter((term) => allowed(term.uri))
    .map(asOption)
  const shortlist = outside(curated.value.filter((option) => allowed(option.type) && matches(option)), profile)
  return { profile, shortlist, all: outside(hits, [...profile, ...shortlist]) }
})

// One candidate needs no click: it is the answer to the search.
watch(results, (value) => {
  if (props.autoSelect === false) return
  const only = [...value.profile, ...value.shortlist, ...value.all]
  if (only.length === 1 && only[0].type !== props.modelValue) emit('update:modelValue', only[0].type)
})

function isSelected(type: string): boolean {
  return normalizeTypeUri(props.modelValue) === normalizeTypeUri(type)
}
</script>

<template>
  <div class="min-w-0 space-y-2">
    <div v-if="query === undefined || range?.length" class="flex flex-wrap items-center gap-3 px-1">
      <Input
        v-if="query === undefined"
        v-model="ownQuery"
        class="min-w-48 flex-1"
        autofocus
        placeholder="Search every type"
        aria-label="Search entity types"
      />
      <label v-if="range?.length" class="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          :checked="onlyMatching"
          aria-label="Only matching types"
          @change="(event: Event) => emit('update:onlyMatching', (event.target as HTMLInputElement).checked)"
        />
        Only matching types
      </label>
    </div>

    <div v-for="group in [{ title: 'From the profile', options: results.profile }, { title: 'Common', options: results.shortlist }, { title: 'Everything else', options: results.all }]" :key="group.title">
      <p v-if="group.options.length" class="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {{ group.title }}
      </p>
      <button
        v-for="option in group.options"
        :key="option.type"
        type="button"
        role="option"
        class="flex w-full min-w-0 flex-col items-start gap-0.5 rounded-md px-2.5 py-1.5 text-left hover:bg-muted/40 data-[active=true]:bg-muted"
        :class="isSelected(option.type) ? 'bg-primary/10' : ''"
        @click="emit('update:modelValue', option.type)"
      >
        <span class="break-words text-sm font-medium text-foreground">{{ typeLabel(option.label) }}</span>
        <span
          v-if="option.description"
          class="line-clamp-1 w-full text-[11px] text-muted-foreground"
          :title="option.description"
        >{{ option.description }}</span>
      </button>
    </div>

    <p v-if="!results.profile.length && !results.shortlist.length && !results.all.length" class="px-2.5 py-2 text-xs text-muted-foreground">
      No type matches that search.
    </p>
  </div>
</template>
