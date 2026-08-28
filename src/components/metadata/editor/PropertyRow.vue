<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import ValueInput from './ValueInput.vue'
import ReferenceValue from './ReferenceValue.vue'
import LinkEntityPopover from './LinkEntityPopover.vue'
import AddEntityDialog from './AddEntityDialog.vue'
import {
  addValue,
  changeKind,
  defaultValue,
  propertyTerm,
  removeValue,
  updateValue,
  valueKindsFor,
  VALUE_KIND_LABELS,
  type CrateDraft,
  type DraftEntity,
  type DraftValueKind,
} from '@/lib/crate/editor'
import type { VocabIndex } from '@/lib/profiles/vocabulary'
import { Link2, Plus, Trash2 } from '@lucide/vue'

const props = defineProps<{
  draft: CrateDraft
  entity: DraftEntity
  property: string
  vocab: VocabIndex | null
}>()
const emit = defineEmits<{
  (e: 'update', draft: CrateDraft): void
  (e: 'jump', entityId: string): void
}>()

const linkOpen = ref(false)
const createOpen = ref(false)

const term = computed(() => propertyTerm(props.vocab, props.property))
const label = computed(() => term.value?.label ?? props.property)
const values = computed(() => props.entity.properties[props.property] ?? [])
const kinds = computed(() => valueKindsFor(props.vocab, props.property))
const kindOptions = computed(() => kinds.value.map((kind) => ({ value: kind, label: VALUE_KIND_LABELS[kind] })))
const range = computed(() => term.value?.targets ?? [])

function add(kind: DraftValueKind) {
  emit('update', addValue(props.draft, props.entity.id, props.property, defaultValue(kind)))
}

function link(id: string) {
  linkOpen.value = false
  emit('update', addValue(props.draft, props.entity.id, props.property, { kind: 'reference', value: id }))
}
</script>

<template>
  <div class="grid gap-2 px-5 py-3.5 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-4">
    <div class="min-w-0">
      <p class="text-sm font-medium text-foreground">{{ label }}</p>
      <p v-if="term?.description" class="mt-0.5 text-[11px] leading-snug text-muted-foreground">{{ term.description }}</p>
      <p v-else class="mt-0.5 font-mono text-[11px] text-muted-foreground">{{ property }}</p>
    </div>

    <div class="min-w-0 space-y-2">
      <div v-for="(value, index) in values" :key="index" class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <ReferenceValue
            v-if="value.kind === 'reference'"
            :draft="draft"
            :value="value.value"
            :label="`${label} reference`"
            @jump="(id) => emit('jump', id)"
            @update:value="(next) => emit('update', updateValue(draft, entity.id, property, index, next))"
          />
          <ValueInput
            v-else
            :model-value="value"
            :label="label"
            @update:model-value="(next) => emit('update', updateValue(draft, entity.id, property, index, next.value))"
          />
        </div>
        <Select
          v-if="kindOptions.length > 1"
          :model-value="value.kind"
          :options="kindOptions"
          class="h-9 w-36 shrink-0"
          aria-label="Change the value type"
          @update:model-value="(kind: string) => emit('update', changeKind(draft, entity.id, property, index, kind as DraftValueKind))"
        />
        <Button
          variant="ghost"
          size="icon-sm"
          class="shrink-0"
          :aria-label="`Remove this ${label} value`"
          @click="emit('update', removeValue(draft, entity.id, property, index))"
        >
          <Trash2 class="h-3.5 w-3.5" />
        </Button>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <template v-if="kinds.includes('reference')">
          <Button variant="link" size="sm" class="h-auto p-0 text-xs" @click="createOpen = true">
            <Plus class="h-3.5 w-3.5" /> Add entity
          </Button>
          <div class="relative">
            <Button variant="link" size="sm" class="h-auto p-0 text-xs" @click="linkOpen = !linkOpen">
              <Link2 class="h-3.5 w-3.5" /> Choose existing
            </Button>
            <LinkEntityPopover
              v-if="linkOpen"
              :draft="draft"
              :vocab="vocab"
              :range="range"
              @pick="link"
              @close="linkOpen = false"
            />
          </div>
        </template>
        <Button
          v-for="kind in kinds.filter((candidate) => candidate !== 'reference')"
          :key="kind"
          variant="link"
          size="sm"
          class="h-auto p-0 text-xs"
          @click="add(kind)"
        >
          <Plus class="h-3.5 w-3.5" />
          {{ kinds.length > 1 ? `Add ${VALUE_KIND_LABELS[kind].toLowerCase()}` : 'Add another entry' }}
        </Button>
      </div>
    </div>

    <AddEntityDialog
      v-if="createOpen"
      :open="createOpen"
      :draft="draft"
      :vocab="vocab"
      :range="range"
      @update:open="(value) => (createOpen = value)"
      @created="(created) => { createOpen = false; emit('update', addValue(created.draft, entity.id, property, { kind: 'reference', value: created.entity.id })) }"
    />
  </div>
</template>
