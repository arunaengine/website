<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import RootForm from './RootForm.vue'
import EntityHeader from './EntityHeader.vue'
import PropertyEditor from './PropertyEditor.vue'
import AddPropertyDialog from './AddPropertyDialog.vue'
import AddFilesDialog from './AddFilesDialog.vue'
import IssueMark from './IssueMark.vue'
import {
  addValue,
  defaultValue,
  findEntity,
  profileShape,
  ROOT_FORM_PROPERTIES,
  rootId,
  type CrateDraft,
  type DraftValueKind,
  type LiveIssue,
  type ProfileExpectation,
} from '@/lib/crate/editor'
import { pickerFor } from '@/lib/crate/pickers'
import { seedRules } from '@/lib/crate/profileSeed'
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
  /** What the picked profile asks of this draft, or null when none is picked. */
  profileRules?: ProfileExpectation | null
}>()
const emit = defineEmits<{
  (e: 'update', draft: CrateDraft): void
  (e: 'select', entityId: string): void
  (e: 'profile', profileId: string): void
}>()

const propertyOpen = ref(false)
const filesFor = ref('')

const entity = computed(() => findEntity(props.draft, props.selected))
const isRoot = computed(() => props.selected === rootId(props.draft))
const shape = computed(() =>
  (entity.value ? profileShape(props.draft, entity.value, props.profileRules ?? null) : undefined))
// What the profile still offers this entity, once its rows are added.
const suggested = computed(() => (shape.value?.optional ?? [])
  .filter((rule) => !entity.value?.properties[rule.valueName]))
// Issues no row shows, such as a type the profile expects; the header owns the unreachable file.
const loose = computed(() => props.issues.filter((issue) => {
  if (issue.entityId !== props.selected || issue.key.startsWith('orphan:')) return false
  const property = issue.property
  if (!property) return true
  return !entity.value?.properties[property] && !(isRoot.value && ROOT_FORM_PROPERTIES.includes(property))
}))

// A property owned by a picker is added by picking a value, never as an empty
// row nothing could fill or remove.
function addProperty(picked: { key: string; kind: DraftValueKind }) {
  if (!entity.value) return
  if (pickerFor(picked.key) === 'data') {
    filesFor.value = picked.key
    return
  }
  const rule = suggested.value.find((candidate) => candidate.valueName === picked.key)
  if (rule && props.profileRules) {
    emit('update', seedRules(props.draft, props.profileRules, entity.value.id, [rule]))
    return
  }
  emit('update', addValue(props.draft, entity.value.id, picked.key, defaultValue(picked.kind)))
}

// One click on what the profile still offers, each field with its own fields.
function addOptional() {
  if (!entity.value || !props.profileRules) return
  emit('update', seedRules(props.draft, props.profileRules, entity.value.id, suggested.value))
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

    <div v-if="loose.length" class="border-t border-border px-5 py-2.5"><IssueMark :issues="loose" /></div>

    <RootForm
      v-if="isRoot"
      :draft="draft"
      :vocab="vocab"
      :issues="issues"
      :profiles="profiles"
      :profile-id="profileId"
      :shape="shape"
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
      :shape="shape"
      @update="(next) => emit('update', next)"
      @select="(id) => emit('select', id)"
    />

    <div class="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
      <Button variant="outline" size="sm" @click="propertyOpen = true">
        <Plus class="h-3.5 w-3.5" /> Add property
      </Button>
      <Button v-if="suggested.length" variant="outline" size="sm" @click="addOptional">
        <Plus class="h-3.5 w-3.5" /> Add all optional fields
      </Button>
      <AddPropertyDialog
        v-if="propertyOpen"
        :open="propertyOpen"
        :entity="entity"
        :vocab="vocab"
        :suggestions="suggested"
        :profile-name="profileRules?.name"
        @update:open="(value) => (propertyOpen = value)"
        @pick="addProperty"
      />
      <AddFilesDialog
        v-if="filesFor"
        open
        :draft="draft"
        :target="{ entityId: entity.id, property: filesFor }"
        :group-id="draft.groupId"
        @update:open="(value) => { if (!value) filesFor = '' }"
        @update="(next) => emit('update', next)"
      />
    </div>

  </section>

  <EmptyState v-else title="Pick something on the left to edit it" />
</template>
