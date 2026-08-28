<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import KBD from '@/components/ui/KBD.vue'
import EntityCard from './EntityCard.vue'
import AddEntityDialog from './AddEntityDialog.vue'
import { displayName, orderedEntities, type CrateDraft, type DraftEntity } from '@/lib/crate/editor'
import type { VocabIndex } from '@/lib/profiles/vocabulary'
import { Plus } from '@lucide/vue'

const props = defineProps<{ draft: CrateDraft; vocab: VocabIndex | null }>()
const emit = defineEmits<{ (e: 'update', draft: CrateDraft): void }>()

const query = ref('')
const addOpen = ref(false)

const entities = computed(() => {
  const text = query.value.trim().toLowerCase()
  const all = orderedEntities(props.draft)
  if (!text) return all
  return all.filter((entity: DraftEntity) =>
    `${displayName(entity)} ${entity.id} ${entity.types.join(' ')}`.toLowerCase().includes(text))
})

function focus(entityId: string) {
  query.value = ''
  globalThis.document?.getElementById(`entity-${entityId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// Shift+Ctrl/Cmd+A adds an entity from anywhere on the page.
function onKeydown(event: KeyboardEvent) {
  if (event.key.toLowerCase() !== 'a' || !event.shiftKey || !(event.ctrlKey || event.metaKey)) return
  event.preventDefault()
  addOpen.value = true
}

onMounted(() => globalThis.document?.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => globalThis.document?.removeEventListener('keydown', onKeydown))

defineExpose({ focus })
</script>

<template>
  <section class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <Input
        v-model="query"
        class="max-w-sm"
        placeholder="Search this dataset"
        aria-label="Search entities"
      />
      <div class="flex items-center gap-2">
        <KBD class="hidden sm:inline-flex">Shift Ctrl A</KBD>
        <Button size="sm" @click="addOpen = true"><Plus class="h-3.5 w-3.5" /> Add entity</Button>
      </div>
    </div>

    <EntityCard
      v-for="entity in entities"
      :key="entity.id"
      :draft="draft"
      :entity="entity"
      :vocab="vocab"
      @update="(next) => emit('update', next)"
      @jump="focus"
    />

    <p v-if="!entities.length" class="surface px-5 py-6 text-center text-sm text-muted-foreground">
      Nothing here matches that search.
    </p>

    <AddEntityDialog
      v-if="addOpen"
      :open="addOpen"
      :draft="draft"
      :vocab="vocab"
      @update:open="(value) => (addOpen = value)"
      @created="(created) => emit('update', created.draft)"
    />
  </section>
</template>
