<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import Input from '@/components/ui/Input.vue'
import Button from '@/components/ui/Button.vue'
import { Plus, X } from '@lucide/vue'
import VocabSuggestions from './VocabSuggestions.vue'
import { CURATED_ENTITY_TYPES, entityTypeLabel } from '@/lib/profiles/entityTypes'
import { isAbsoluteUri, normalizeTypeUri, sameSchemaOrgType } from '@/lib/profiles/uri'
import { trimmed, type ProfileBuilder } from './useProfileBuilder'
import type { VocabTerm } from '@/lib/profiles/vocabulary'

// The ONE way to choose an entity type anywhere in the builder: shapes already
// defined in this profile first, then curated common types, then bundled/remote
// class search, then a paste-URI escape. Emits a pick; the caller decides what
// to do with it (add a shape, add a reference target, change a shape's type).
const props = defineProps<{
  builder: ProfileBuilder
  // URIs to hide from every group (e.g. already-selected targets).
  exclude?: string[]
  buttonLabel?: string
}>()
const emit = defineEmits<{ (e: 'pick', choice: { uri: string; label: string }): void }>()

const open = ref(false)
const query = ref('')
const searchInput = ref<InstanceType<typeof Input> | null>(null)

const excluded = computed(() => (props.exclude ?? []).map(normalizeTypeUri).filter(Boolean))
function isExcluded(uri: string): boolean {
  return excluded.value.some((entry) => sameSchemaOrgType(entry, uri))
}

const q = computed(() => trimmed(query.value).toLowerCase())

// Group 1: shapes this profile already defines (picking one links, never copies).
const profileShapes = computed(() => {
  const seen = new Set<string>()
  const options: { uri: string; label: string }[] = []
  for (const entity of props.builder.entities) {
    const uri = normalizeTypeUri(entity.type)
    if (!uri || seen.has(uri) || isExcluded(uri)) continue
    seen.add(uri)
    const label = trimmed(entity.label) || entityTypeLabel(uri)
    if (q.value && !label.toLowerCase().includes(q.value) && !uri.toLowerCase().includes(q.value)) continue
    options.push({ uri, label })
  }
  return options
})

// Group 2: curated common RO-Crate types without a shape yet.
const curatedTypes = computed(() => {
  const shapeUris = new Set(props.builder.entities.map((entity) => normalizeTypeUri(entity.type)))
  return CURATED_ENTITY_TYPES.filter(
    (type) =>
      !shapeUris.has(type.uri) &&
      !isExcluded(type.uri) &&
      (!q.value || type.label.toLowerCase().includes(q.value) || type.uri.toLowerCase().includes(q.value)),
  ).slice(0, q.value ? 10 : 8)
})

const customUri = computed(() => (isAbsoluteUri(trimmed(query.value)) ? trimmed(query.value) : ''))

async function show() {
  open.value = true
  await nextTick()
  const el = searchInput.value?.$el as HTMLElement | undefined
  ;(el?.matches?.('input') ? (el as HTMLInputElement) : el?.querySelector?.('input'))?.focus()
}

function close() {
  open.value = false
  query.value = ''
}

function pick(uri: string, label: string) {
  emit('pick', { uri: normalizeTypeUri(uri), label })
  close()
}

function pickVocab(term: VocabTerm) {
  pick(term.uri, term.label)
}
</script>

<template>
  <div>
    <Button v-if="!open" type="button" variant="outline" size="sm" @click="show">
      <Plus class="size-3.5" /> {{ buttonLabel ?? 'Add type' }}
    </Button>

    <div v-else class="space-y-3 rounded-lg border border-border bg-card p-3">
      <div class="flex items-center gap-2">
        <Input
          ref="searchInput"
          v-model="query"
          class="flex-1"
          placeholder="Search a type (Person, Organization, Sample…) or paste a URI"
          aria-label="Search an entity type"
          @keydown.escape.prevent="close"
        />
        <Button type="button" variant="ghost" size="sm" aria-label="Close type picker" @click="close">
          <X class="size-3.5" />
        </Button>
      </div>

      <div v-if="profileShapes.length">
        <div class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Shapes in this profile</div>
        <div class="mt-1 flex flex-wrap gap-1.5">
          <button
            v-for="option in profileShapes"
            :key="option.uri"
            type="button"
            class="rounded-full border border-aruna-royal/40 bg-aruna-royal/5 px-2.5 py-1 text-[11px] text-foreground transition-colors hover:border-aruna-royal/70 hover:bg-aruna-royal/10"
            :title="option.uri"
            @click="pick(option.uri, option.label)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div v-if="curatedTypes.length">
        <div class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Common types</div>
        <div class="mt-1 flex flex-wrap gap-1.5">
          <button
            v-for="option in curatedTypes"
            :key="option.uri"
            type="button"
            class="rounded-full border border-border px-2.5 py-1 text-[11px] text-foreground transition-colors hover:border-aruna-royal/60 hover:bg-aruna-royal/10"
            :title="option.uri"
            @click="pick(option.uri, option.label)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <VocabSuggestions :query="query" kind="class" heading="Terminology matches" :exclude="excluded" @pick="pickVocab" />

      <button
        v-if="customUri"
        type="button"
        class="block w-full rounded-md border border-dashed border-border px-3 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        @click="pick(customUri, entityTypeLabel(customUri))"
      >
        <Plus class="mr-1 inline size-3" /> Use type URI "{{ customUri }}"
      </button>
    </div>
  </div>
</template>
