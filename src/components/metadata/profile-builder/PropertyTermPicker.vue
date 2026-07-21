<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import Input from '@/components/ui/Input.vue'
import Button from '@/components/ui/Button.vue'
import { Plus, X } from '@lucide/vue'
import VocabSuggestions from './VocabSuggestions.vue'
import { propertyTermsForType, type PropertyTermOption } from '@/lib/profiles/propertyCatalog'
import { entityTypeLabel } from '@/lib/profiles/entityTypes'
import { vocabKind, type VocabTerm } from '@/lib/profiles/vocabulary'
import { isValidPropertyTermName, normalizeTypeUri, sameSchemaOrgType } from '@/lib/profiles/uri'
import { draftProperty, propertyName, trimmed, type DraftEntityRule, type ProfileBuilder } from './useProfileBuilder'

// The ONE way to add a property rule (plan 6.3): a single searchable picker with
// progressively broader results — common (curated) properties for the owner
// type first, then bundled/remote terminology matches, then an explicit custom
// escape. Every path inserts the same ordinary editable draft rule; terminology
// picks default to MAY because a terminology cannot decide profile policy.
const props = defineProps<{
  builder: ProfileBuilder
  entity: DraftEntityRule
}>()

const open = ref(false)
const query = ref('')
const searchInput = ref<InstanceType<typeof Input> | null>(null)

const typeLabel = computed(() => entityTypeLabel(props.entity.type))

// URIs already used on this entity: common terms hide, terminology results are
// excluded via VocabSuggestions' own exclude prop, so a duplicate normalized
// URI can never be inserted twice (plan 6.3).
const usedUris = computed(() =>
  props.entity.properties.map((property) => trimmed(property.propertyUri)).filter(Boolean),
)

function isUsed(uri: string): boolean {
  return usedUris.value.some((used) => sameSchemaOrgType(used, uri))
}

const commonTerms = computed<PropertyTermOption[]>(() => {
  const q = trimmed(query.value).toLowerCase()
  return propertyTermsForType(props.entity.type)
    .filter((option) => !isUsed(option.uri))
    .filter(
      (option) =>
        !q ||
        option.name.toLowerCase().includes(q) ||
        option.label.toLowerCase().includes(q) ||
        option.description.toLowerCase().includes(q),
    )
    .slice(0, q ? 8 : 6)
})

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

// A property valueName unique within the owner, suffixing 2,3,… on collision.
function uniqueValueName(base: string): string {
  const taken = new Set(props.entity.properties.map((property) => trimmed(property.valueName)))
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}${n}`)) n++
  return `${base}${n}`
}

function insert(draft: ReturnType<typeof draftProperty>) {
  props.entity.properties.push(draft)
  // The row watches this to expand, scroll into view and flash.
  props.builder.highlightPropertyUid = draft.uid
  close()
}

function pickCommon(option: PropertyTermOption) {
  if (isUsed(option.uri)) return
  insert(
    draftProperty({
      id: option.name,
      label: option.label,
      valueName: uniqueValueName(option.name),
      propertyUri: option.uri,
      description: option.description,
      kind: option.suggestedKind ?? 'text',
      entityTypes: (option.suggestedEntityTypes ?? []).map(normalizeTypeUri).filter(Boolean),
      obligation: 'MAY',
    }),
  )
}

function pickVocab(term: VocabTerm) {
  if (isUsed(term.uri)) return
  const kind = vocabKind(term) ?? 'text'
  const name = isValidPropertyTermName(term.name) ? term.name : propertyName(term.label)
  insert(
    draftProperty({
      id: name || propertyName(term.label) || 'term',
      label: term.label,
      valueName: uniqueValueName(name || 'term'),
      propertyUri: term.uri,
      description: term.description || '',
      kind,
      entityTypes: kind === 'entity' ? (term.targets ?? []).map(normalizeTypeUri).filter(Boolean) : [],
      obligation: 'MAY',
    }),
  )
}

function addCustom() {
  const label = trimmed(query.value)
  const base = propertyName(label) || 'field'
  insert(
    draftProperty({
      id: base,
      label: label || 'Custom property',
      valueName: uniqueValueName(base),
      // Empty URI = custom term, minted from the profile slug at normalize time.
      propertyUri: '',
      obligation: 'MAY',
    }),
  )
}
</script>

<template>
  <div>
    <Button v-if="!open" type="button" variant="outline" size="sm" @click="show">
      <Plus class="size-3.5" /> Add property
    </Button>

    <div v-else class="space-y-3 rounded-lg border border-border bg-card p-3">
      <div class="flex items-center gap-2">
        <Input
          ref="searchInput"
          v-model="query"
          class="flex-1"
          :placeholder="`Search a property for ${typeLabel} (e.g. creator, keywords, license)`"
          :aria-label="`Search a property for ${typeLabel}`"
          @keydown.escape.prevent="close"
        />
        <Button type="button" variant="ghost" size="sm" aria-label="Close property picker" @click="close">
          <X class="size-3.5" />
        </Button>
      </div>

      <div v-if="commonTerms.length">
        <div class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Common for {{ typeLabel }}
        </div>
        <div class="mt-1 flex flex-wrap gap-1.5">
          <button
            v-for="option in commonTerms"
            :key="option.uri"
            type="button"
            class="rounded-full border border-border px-2.5 py-1 text-[11px] text-foreground transition-colors hover:border-aruna-royal/60 hover:bg-aruna-royal/10"
            :title="option.description"
            @click="pickCommon(option)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <VocabSuggestions
        :query="query"
        kind="property"
        heading="Terminology matches"
        :exclude="usedUris"
        @pick="pickVocab"
      />

      <button
        v-if="trimmed(query)"
        type="button"
        class="block w-full rounded-md border border-dashed border-border px-3 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        @click="addCustom"
      >
        <Plus class="mr-1 inline size-3" /> Create custom property "{{ trimmed(query) }}"
      </button>

      <p class="text-[11px] text-muted-foreground">
        Picked properties are added as Optional; set Required or Recommended on the row afterwards.
      </p>
    </div>
  </div>
</template>
