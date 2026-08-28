<script setup lang="ts">
import { computed } from 'vue'
import PropertyRow from './PropertyRow.vue'
import { propertyTerm, type CrateDraft, type DraftEntity } from '@/lib/crate/editor'
import type { VocabIndex } from '@/lib/profiles/vocabulary'

const props = defineProps<{
  draft: CrateDraft
  entity: DraftEntity
  vocab: VocabIndex | null
  /** Properties the card renders itself (the root's parts list). */
  skip?: string[]
}>()
const emit = defineEmits<{
  (e: 'update', draft: CrateDraft): void
  (e: 'jump', entityId: string): void
}>()

// The name comes first because it is what the entity is read by; the rest is
// alphabetical, so a property keeps its place while the card is edited.
const properties = computed(() => {
  const skip = new Set(props.skip ?? [])
  const keys = Object.keys(props.entity.properties).filter((key) => !skip.has(key))
  const label = (key: string) => propertyTerm(props.vocab, key)?.label ?? key
  return keys.sort((a, b) => {
    if (a === 'name') return -1
    if (b === 'name') return 1
    return label(a).localeCompare(label(b), 'en')
  })
})
</script>

<template>
  <div v-if="properties.length" class="divide-y divide-border">
    <PropertyRow
      v-for="property in properties"
      :key="property"
      :draft="draft"
      :entity="entity"
      :property="property"
      :vocab="vocab"
      @update="(next) => emit('update', next)"
      @jump="(id) => emit('jump', id)"
    />
  </div>
  <p v-else class="px-5 py-3.5 text-xs text-muted-foreground">
    Nothing described yet. Add a property to say something about this.
  </p>
</template>
