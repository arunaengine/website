<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import RootForm from './RootForm.vue'
import EntityHeader from './EntityHeader.vue'
import PropertyEditor from './PropertyEditor.vue'
import AddPropertyDialog from './AddPropertyDialog.vue'
import {
  addValue,
  defaultValue,
  findEntity,
  rootId,
  toRoCrate,
  type CrateDraft,
  type DraftValueKind,
  type LiveIssue,
} from '@/lib/crate/editor'
import type { VocabIndex } from '@/lib/profiles/vocabulary'
import { Plus } from '@lucide/vue'

// One editor per entity: the root gets its form with the remaining properties
// as rows below it, every other entity gets its rows straight away.
const props = defineProps<{
  draft: CrateDraft
  selected: string
  vocab: VocabIndex | null
  issues: LiveIssue[]
  profiles: Array<{ value: string; label: string }>
  profileId: string
}>()
const emit = defineEmits<{
  (e: 'update', draft: CrateDraft): void
  (e: 'select', entityId: string): void
  (e: 'profile', profileId: string): void
}>()

const propertyOpen = ref(false)

const entity = computed(() => findEntity(props.draft, props.selected))
const isRoot = computed(() => props.selected === rootId(props.draft))
const json = computed(() => JSON.stringify(toRoCrate(props.draft), null, 2))

function addProperty(picked: { key: string; kind: DraftValueKind }) {
  if (!entity.value) return
  emit('update', addValue(props.draft, entity.value.id, picked.key, defaultValue(picked.kind)))
}
</script>

<template>
  <section v-if="entity" class="surface">
    <EntityHeader
      :draft="draft"
      :entity="entity"
      :vocab="vocab"
      @update="(next) => emit('update', next)"
      @select="(id) => emit('select', id)"
    />

    <RootForm
      v-if="isRoot"
      :draft="draft"
      :vocab="vocab"
      :issues="issues"
      :profiles="profiles"
      :profile-id="profileId"
      @update="(next) => emit('update', next)"
      @select="(id) => emit('select', id)"
      @profile="(id) => emit('profile', id)"
    />
    <PropertyEditor
      v-else
      :draft="draft"
      :entity="entity"
      :vocab="vocab"
      :issues="issues"
      @update="(next) => emit('update', next)"
      @select="(id) => emit('select', id)"
    />

    <div class="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
      <Button variant="outline" size="sm" @click="propertyOpen = true">
        <Plus class="h-3.5 w-3.5" /> Add property
      </Button>
      <AddPropertyDialog
        v-if="propertyOpen"
        :open="propertyOpen"
        :entity="entity"
        :vocab="vocab"
        @update:open="(value) => (propertyOpen = value)"
        @pick="addProperty"
      />
    </div>

    <details v-if="isRoot" class="border-t border-border">
      <summary class="cursor-pointer px-5 py-2.5 text-xs font-medium text-foreground">Show JSON-LD</summary>
      <div class="border-t border-border p-5">
        <div class="mb-2 flex justify-end">
          <CopyButton :value="json" label="Copy the JSON-LD" />
        </div>
        <pre class="max-h-96 overflow-auto rounded-md bg-muted/30 p-3 text-[11px] leading-relaxed"><code>{{ json }}</code></pre>
      </div>
    </details>
  </section>

  <EmptyState v-else title="Pick something on the left to edit it." />
</template>
