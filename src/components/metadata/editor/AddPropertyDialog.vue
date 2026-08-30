<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import CommandDialog from '@/components/ui/CommandDialog.vue'
import {
  propertyKey,
  propertyTerm,
  typeLabel,
  valueKindsFor,
  VALUE_KIND_LABELS,
  vocabTypes,
  type DraftEntity,
  type DraftValueKind,
} from '@/lib/crate/editor'
import { isAbsoluteUri } from '@/lib/profiles/uri'
import type { VocabIndex, VocabTerm } from '@/lib/profiles/vocabulary'

const props = defineProps<{ open: boolean; entity: DraftEntity; vocab: VocabIndex | null }>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'pick', value: { key: string; kind: DraftValueKind }): void
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

const OPTION =
  'w-full rounded-md px-2.5 py-1.5 text-left hover:bg-muted/40 data-[active=true]:bg-muted'

const query = ref('')
const showAll = ref(false)
const pending = ref<{ key: string; kinds: DraftValueKind[] } | null>(null)
const kind = ref<DraftValueKind>('text')

watch(() => props.open, (open) => {
  if (!open) return
  query.value = ''
  pending.value = null
})

const chosen = computed(() => (pending.value ? propertyTerm(props.vocab, pending.value.key) : undefined))
const chosenLabel = computed(() => chosen.value?.label ?? pending.value?.key ?? '')

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

function rankOf(term: VocabTerm): number {
  const position = COMMON.indexOf(term.name)
  return position < 0 ? COMMON.length : position
}

const suggested = computed(() => (props.vocab?.propertiesForTypes(vocabTypes(props.entity)) ?? [])
  .filter((term) => unused(term) && matches(term))
  .sort((a, b) => rankOf(a) - rankOf(b) || a.label.localeCompare(b.label, 'en')))

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
    kind.value = kinds[0]
    return
  }
  pick(key, kinds[0])
}

function pick(key: string, value: DraftValueKind) {
  emit('pick', { key, kind: value })
  emit('update:open', false)
}

function add() {
  if (pending.value) pick(pending.value.key, kind.value)
}
</script>

<template>
  <CommandDialog
    :open="open"
    v-model="query"
    :title="pending ? chosenLabel : 'Add a property'"
    :description="pending ? undefined : `Suggested for ${entity.types.map(typeLabel).join(', ')} first, then everything else.`"
    :picked="Boolean(pending)"
    placeholder="Search properties"
    aria-label="Search properties"
    @update:open="(value) => emit('update:open', value)"
  >
    <template v-if="pending" #subtitle>
      <p class="hash mt-0.5 break-all">{{ pending.key }}</p>
      <p v-if="chosen?.description" class="mt-1 break-words text-xs text-muted-foreground">{{ chosen.description }}</p>
    </template>

    <template v-if="pending">
      <p class="text-xs text-muted-foreground">What kind of value does {{ pending.key }} take?</p>
      <div class="mt-2 flex flex-wrap gap-2">
        <Button
          v-for="option in pending.kinds"
          :key="option"
          :variant="option === kind ? 'default' : 'outline'"
          size="sm"
          :aria-pressed="option === kind"
          @click="kind = option"
        >
          {{ VALUE_KIND_LABELS[option] }}
        </Button>
      </div>
    </template>

    <template v-else>
      <p class="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Suggested
      </p>
      <button
        v-for="term in suggested"
        :key="term.uri"
        type="button"
        role="option"
        :class="OPTION"
        @click="choose(propertyKey(term))"
      >
        <span class="text-xs font-medium text-foreground">{{ term.label }}</span>
        <span class="ml-1.5 text-[11px] text-muted-foreground">{{ (term.targets ?? []).map(typeLabel).join(', ') }}</span>
        <span v-if="term.description" class="line-clamp-1 text-[11px] text-muted-foreground">{{ term.description }}</span>
      </button>
      <p v-if="!suggested.length" class="px-2.5 py-2 text-xs text-muted-foreground">No suggestion left for this type.</p>

      <template v-if="all.length">
        <p class="px-2.5 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Everything else
        </p>
        <button
          v-for="term in all"
          :key="term.uri"
          type="button"
          role="option"
          :class="OPTION"
          @click="choose(propertyKey(term))"
        >
          <span class="text-xs font-medium text-foreground">{{ term.label }}</span>
          <span class="ml-1.5 text-[11px] text-muted-foreground">{{ (term.targets ?? []).map(typeLabel).join(', ') }}</span>
          <span v-if="term.description" class="line-clamp-1 text-[11px] text-muted-foreground">{{ term.description }}</span>
        </button>
      </template>

      <button
        v-if="custom"
        type="button"
        role="option"
        class="mt-2 w-full rounded-md border border-dashed border-border px-2.5 py-1.5 text-left text-xs hover:bg-muted/40 data-[active=true]:bg-muted"
        @click="choose(custom)"
      >
        Use custom term <span class="font-mono">{{ custom }}</span>
      </button>
    </template>

    <template #footer>
      <div v-if="pending" class="flex justify-end gap-2">
        <Button variant="outline" size="sm" @click="pending = null">Back</Button>
        <Button size="sm" @click="add">Add property</Button>
      </div>
      <label v-else class="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          :checked="showAll"
          aria-label="Show all properties"
          @change="(event: Event) => (showAll = (event.target as HTMLInputElement).checked)"
        />
        Show all properties
      </label>
    </template>
  </CommandDialog>
</template>
