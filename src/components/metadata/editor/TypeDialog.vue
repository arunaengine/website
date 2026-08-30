<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import CommandDialog from '@/components/ui/CommandDialog.vue'
import TypeBrowser from './TypeBrowser.vue'
import { typeLabel, vocabTypeUri } from '@/lib/crate/editor'
import type { VocabIndex } from '@/lib/profiles/vocabulary'

// Adds one more type to an entity: the list picks it, the footer confirms it.
const props = defineProps<{ open: boolean; vocab: VocabIndex | null }>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'pick', type: string): void
}>()

const query = ref('')
const picked = ref('')

watch(() => props.open, (open) => {
  if (!open) return
  query.value = ''
  picked.value = ''
})

const about = computed(() => props.vocab?.class(vocabTypeUri(picked.value))?.description ?? '')

function add() {
  if (!picked.value) return
  emit('pick', picked.value)
  emit('update:open', false)
}
</script>

<template>
  <CommandDialog
    :open="open"
    v-model="query"
    :title="picked ? typeLabel(picked) : 'Add a type'"
    :description="picked ? undefined : 'Every class the bundled vocabulary knows, the common ones first.'"
    :picked="Boolean(picked)"
    placeholder="Search every type"
    aria-label="Search entity types"
    @update:open="(value) => emit('update:open', value)"
  >
    <template v-if="picked" #subtitle>
      <p v-if="picked !== typeLabel(picked)" class="hash mt-0.5 break-all">{{ picked }}</p>
      <p v-if="about" class="mt-1 break-words text-xs text-muted-foreground">{{ about }}</p>
    </template>

    <p v-if="picked" class="break-words text-xs text-muted-foreground">
      This adds {{ typeLabel(picked) }} to the types of this entity.
    </p>
    <TypeBrowser
      v-else
      :model-value="picked"
      :query="query"
      :vocab="vocab"
      @update:model-value="(value: string) => (picked = value)"
    />

    <template v-if="picked" #footer>
      <div class="flex justify-end gap-2">
        <Button variant="outline" size="sm" @click="picked = ''">Back</Button>
        <Button size="sm" @click="add">Add type</Button>
      </div>
    </template>
  </CommandDialog>
</template>
