<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import RootForm from './RootForm.vue'
import EntityHeader from './EntityHeader.vue'
import PropertyEditor from './PropertyEditor.vue'
import AddPropertyPopover from './AddPropertyPopover.vue'
import {
  addValue,
  defaultValue,
  displayName,
  findEntity,
  propertyTerm,
  referencesTo,
  rootId,
  type CrateDraft,
  type DraftValueKind,
  type LiveIssue,
} from '@/lib/crate/editor'
import type { VocabIndex } from '@/lib/profiles/vocabulary'
import { Plus, Search } from '@lucide/vue'

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
const referencesOpen = ref(false)

const entity = computed(() => findEntity(props.draft, props.selected))
const isRoot = computed(() => props.selected === rootId(props.draft))
const uses = computed(() => referencesTo(props.draft, props.selected).map((use) => ({
  ...use,
  name: displayName(findEntity(props.draft, use.entityId)),
  label: propertyTerm(props.vocab, use.property)?.label ?? use.property,
})))

function addProperty(picked: { key: string; kind: DraftValueKind }) {
  propertyOpen.value = false
  if (!entity.value) return
  emit('update', addValue(props.draft, entity.value.id, picked.key, defaultValue(picked.kind)))
}
</script>

<template>
  <section v-if="entity" class="surface">
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
    <template v-else>
      <EntityHeader
        :draft="draft"
        :entity="entity"
        :vocab="vocab"
        @update="(next) => emit('update', next)"
        @select="(id) => emit('select', id)"
      />
      <PropertyEditor
        :draft="draft"
        :entity="entity"
        :vocab="vocab"
        :skip="['name']"
        :issues="issues"
        @update="(next) => emit('update', next)"
        @select="(id) => emit('select', id)"
      />
    </template>

    <div class="relative flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
      <Button variant="outline" size="sm" @click="propertyOpen = !propertyOpen">
        <Plus class="h-3.5 w-3.5" /> Add property
      </Button>
      <Button variant="ghost" size="sm" @click="referencesOpen = !referencesOpen">
        <Search class="h-3.5 w-3.5" /> Find references ({{ uses.length }})
      </Button>
      <AddPropertyPopover
        v-if="propertyOpen"
        :entity="entity"
        :vocab="vocab"
        class="left-5"
        @pick="addProperty"
        @close="propertyOpen = false"
      />
    </div>

    <ul v-if="referencesOpen && uses.length" class="divide-y divide-border border-t border-border">
      <li v-for="use in uses" :key="`${use.entityId}:${use.property}:${use.index}`" class="flex items-center gap-3 px-5 py-2">
        <span class="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {{ use.name || use.entityId }} · {{ use.label }}
        </span>
        <Button variant="ghost" size="sm" @click="emit('select', use.entityId)">Open</Button>
      </li>
    </ul>
    <p v-else-if="referencesOpen" class="border-t border-border px-5 py-3 text-xs text-muted-foreground">
      Nothing in this dataset points at this yet.
    </p>
  </section>

  <EmptyState v-else title="Pick something on the left to edit it." />
</template>
