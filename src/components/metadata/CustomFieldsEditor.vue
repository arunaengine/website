<script setup lang="ts">
import { ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import VocabSuggestions from '@/components/metadata/profile-builder/VocabSuggestions.vue'
import {
  CUSTOM_FIELD_TYPE_OPTIONS,
  type CustomFieldRow,
  type CustomFieldType,
  type PreservedFieldRow,
} from '@/lib/customFields'
import { isSchemaOrgUri } from '@/lib/profiles/propertyCatalog'
import { termNameFromUri } from '@/lib/profiles/uri'
import type { VocabTerm } from '@/lib/profiles/vocabulary'
import { Lock, Plus, X } from '@lucide/vue'

// Typed extra root properties shared by the create and edit metadata dialogs.
// The key input is terminology-backed (bundled schema.org + Dublin Core always
// instant, remote providers streamed with soft degradation) so users pick
// proper vocabulary properties instead of inventing keys; free text stays
// possible, picking a suggestion is optional.
const props = defineProps<{
  rows: CustomFieldRow[]
  // Read-only structured root properties (edit dialog only); preserved as-is.
  preserved?: PreservedFieldRow[]
}>()
const emit = defineEmits<{ (e: 'update:rows', rows: CustomFieldRow[]): void }>()

// Suggestions render only under the focused key input; the suggestion buttons
// prevent mousedown so a pick lands before this blur-driven close.
const activeKeyRow = ref<number | null>(null)

function update(mutate: (rows: CustomFieldRow[]) => void) {
  const next = props.rows.map((row) => ({ ...row }))
  mutate(next)
  emit('update:rows', next)
}
function addRow() {
  update((rows) => rows.push({ key: '', type: 'text', value: '' }))
}
function removeRow(index: number) {
  update((rows) => rows.splice(index, 1))
}
// Repeated keys emit as an array; this seeds the repeat without retyping.
function duplicateKey(index: number) {
  update((rows) => rows.splice(index + 1, 0, { key: rows[index].key, type: rows[index].type, value: '' }))
}
function setKey(index: number, value: string) {
  update((rows) => (rows[index].key = value))
}
function setType(index: number, value: CustomFieldType) {
  update((rows) => (rows[index].type = value))
}
function setValue(index: number, value: string) {
  update((rows) => (rows[index].value = value))
}

// A picked term is written the way the crate's @context resolves it: a
// schema.org property by its plain key (the RO-Crate context covers
// schema.org), anything else by its full IRI, matching the profile builder's
// baking, where non-schema.org terms are only compacted when a context term
// maps them (none exists for ad-hoc fields).
function pickTerm(index: number, term: VocabTerm) {
  update((rows) => (rows[index].key = isSchemaOrgUri(term.uri) ? term.name || termNameFromUri(term.uri) : term.uri))
  activeKeyRow.value = null
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-3">
      <label class="text-xs font-medium text-foreground">Additional fields</label>
      <Button variant="outline" size="sm" @click="addRow">
        <Plus class="h-3.5 w-3.5" /> Add field
      </Button>
    </div>
    <div v-for="(row, index) in rows" :key="index" class="mt-1.5">
      <div class="flex items-center gap-2">
        <Input
          :model-value="row.key"
          class="w-44 shrink-0 font-mono text-xs"
          placeholder="property"
          aria-label="Property key"
          @update:model-value="(value: string | number) => setKey(index, String(value))"
          @focus="activeKeyRow = index"
          @blur="activeKeyRow = null"
        />
        <Select
          :model-value="row.type"
          :options="CUSTOM_FIELD_TYPE_OPTIONS"
          class="w-28 shrink-0"
          aria-label="Value type"
          @update:model-value="(value: string) => setType(index, value as CustomFieldType)"
        />
        <Input
          :model-value="row.value"
          :type="row.type === 'date' ? 'date' : row.type === 'number' ? 'number' : 'text'"
          class="min-w-0 flex-1"
          :placeholder="row.type === 'iri' ? 'https://example.org/resource' : 'value'"
          aria-label="Value"
          @update:model-value="(value: string | number) => setValue(index, String(value))"
        />
        <Button
          variant="ghost"
          size="icon-sm"
          class="shrink-0 text-muted-foreground"
          title="Add another value for this key (repeated keys become an array)"
          aria-label="Add another value for this key"
          @click="duplicateKey(index)"
        >
          <Plus class="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon-sm" class="shrink-0 text-muted-foreground" aria-label="Remove field" @click="removeRow(index)">
          <X class="h-3.5 w-3.5" />
        </Button>
      </div>
      <VocabSuggestions
        v-if="activeKeyRow === index"
        :query="row.key"
        kind="property"
        heading="Matching vocabulary properties"
        @pick="(term) => pickTerm(index, term)"
      />
    </div>
    <ul v-if="preserved?.length" class="mt-1.5 space-y-1">
      <li
        v-for="entry in preserved"
        :key="entry.key"
        class="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground"
      >
        <Lock class="h-3 w-3 shrink-0" />
        <span class="font-mono">{{ entry.key }}</span>
        <span class="text-[11px]">{{ entry.note }}, preserved as-is; edit it in the Raw JSON tab.</span>
      </li>
    </ul>
    <p class="mt-1 text-[11px] text-muted-foreground">
      Extra properties on the root entity. Pick a suggested vocabulary property or type any key; repeat a key to write multiple values as an array.
    </p>
  </div>
</template>
