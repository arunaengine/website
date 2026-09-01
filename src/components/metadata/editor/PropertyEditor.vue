<script setup lang="ts">
import { computed } from 'vue'
import PropertyRow from './PropertyRow.vue'
import { propertyTerm, type CrateDraft, type DraftEntity, type LiveIssue } from '@/lib/crate/editor'
import type { VocabIndex } from '@/lib/profiles/vocabulary'

const props = defineProps<{
  draft: CrateDraft
  entity: DraftEntity
  vocab: VocabIndex | null
  /** Properties another surface renders (the root form's own fields). */
  skip?: string[]
  issues?: LiveIssue[]
}>()
const emit = defineEmits<{
  (e: 'update', draft: CrateDraft): void
  (e: 'select', entityId: string): void
}>()

// The name comes first because it is what the entity is read by; the rest is
// alphabetical, so a property keeps its place while the entity is edited.
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

function issuesFor(property: string): LiveIssue[] {
  return (props.issues ?? []).filter(
    (issue) => issue.entityId === props.entity.id && issue.property === property,
  )
}
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
      :issues="issuesFor(property)"
      @update="(next) => emit('update', next)"
      @select="(id) => emit('select', id)"
    />
  </div>
  <p v-else class="px-5 py-3.5 text-xs text-muted-foreground">
    Nothing described yet. Add a property to say something about this.
  </p>
</template>
