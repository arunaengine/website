<script setup lang="ts">
import { ref, watch } from 'vue'
import CommandDialog from '@/components/ui/CommandDialog.vue'
import TypeBrowser from './TypeBrowser.vue'
import type { VocabIndex } from '@/lib/profiles/vocabulary'

// Adds one more type to an entity: picking a type in the list is the choice.
const props = defineProps<{ open: boolean; vocab: VocabIndex | null }>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'pick', type: string): void
}>()

const query = ref('')

watch(() => props.open, (open) => {
  if (open) query.value = ''
})

function pick(type: string) {
  if (!type) return
  emit('pick', type)
  emit('update:open', false)
}
</script>

<template>
  <CommandDialog
    :open="open"
    v-model="query"
    title="Add a type"
    description="Every class the bundled vocabulary knows, the common ones first."
    placeholder="Search every type"
    aria-label="Search entity types"
    @update:open="(value) => emit('update:open', value)"
  >
    <TypeBrowser model-value="" :query="query" :vocab="vocab" @update:model-value="pick" />
  </CommandDialog>
</template>
