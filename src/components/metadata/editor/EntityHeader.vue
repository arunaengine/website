<script setup lang="ts">
import { computed, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Popover from '@/components/ui/Popover.vue'
import Separator from '@/components/ui/Separator.vue'
import TypeDialog from './TypeDialog.vue'
import {
  displayName,
  entityGroup,
  findEntity,
  propertyTerm,
  referencesTo,
  removeEntity,
  renameEntity,
  setTypes,
  typeLabel,
  type CrateDraft,
  type DraftEntity,
} from '@/lib/crate/editor'
import { truncateMiddle } from '@/lib/utils'
import type { VocabIndex } from '@/lib/profiles/vocabulary'
import { Pencil, Plus, Trash2, X } from '@lucide/vue'

const props = defineProps<{ draft: CrateDraft; entity: DraftEntity; vocab: VocabIndex | null }>()
const emit = defineEmits<{
  (e: 'update', draft: CrateDraft): void
  (e: 'select', entityId: string): void
}>()

const idEditing = ref(false)
const idDraft = ref('')
const typeOpen = ref(false)
const confirmRemove = ref(false)

const group = computed(() => entityGroup(props.draft, props.entity))
const badge = computed(() => {
  if (group.value === 'root') return 'Dataset'
  if (group.value !== 'data') return 'Contextual'
  return props.entity.types.map(typeLabel).includes('File') ? 'File' : 'Dataset'
})
// A new dataset has no id yet: the node mints one when it is created.
const datasetId = computed(() => (group.value === 'root' ? props.draft.documentId ?? '' : ''))
const uses = computed(() => referencesTo(props.draft, props.entity.id).map((use) => ({
  ...use,
  name: displayName(findEntity(props.draft, use.entityId)) || use.entityId,
  label: propertyTerm(props.vocab, use.property)?.label ?? use.property,
})))

function startIdEdit() {
  idDraft.value = props.entity.id
  idEditing.value = true
}

function commitId() {
  idEditing.value = false
  const next = idDraft.value.trim()
  if (!next || next === props.entity.id) return
  emit('update', renameEntity(props.draft, props.entity.id, next))
  emit('select', next)
}

function addType(type: string) {
  emit('update', setTypes(props.draft, props.entity.id, [...props.entity.types, type]))
}

function remove() {
  confirmRemove.value = false
  emit('update', removeEntity(props.draft, props.entity.id).draft)
  emit('select', props.draft.entities[0]?.id ?? '')
}
</script>

<template>
  <header class="space-y-2.5 border-b border-border px-5 py-4">
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Badge :variant="group === 'root' ? 'default' : group === 'data' ? 'sky' : 'secondary'">
        {{ badge }}
      </Badge>
      <h2 class="min-w-0 flex-1 truncate font-display text-sm font-semibold text-aruna-navy">
        {{ displayName(entity) }}
      </h2>
      <Popover v-if="uses.length" align="start">
        <button
          type="button"
          class="chip h-6 shrink-0 hover:text-foreground"
          :aria-label="`Used by ${uses.length}`"
        >
          Used by {{ uses.length }}
        </button>
        <template #content>
          <ul class="space-y-1">
            <li v-for="use in uses" :key="`${use.entityId}:${use.property}:${use.index}`">
              <button
                type="button"
                class="w-full truncate rounded-sm px-1 py-1 text-left text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                @click="emit('select', use.entityId)"
              >
                {{ use.name }} · {{ use.label }}
              </button>
            </li>
          </ul>
        </template>
      </Popover>
      <div class="flex shrink-0 items-center gap-2">
        <slot name="view" />
        <Button
          v-if="group !== 'root'"
          variant="ghost"
          size="icon-sm"
          :aria-label="`Remove ${displayName(entity)}`"
          @click="uses.length ? (confirmRemove = true) : remove()"
        >
          <Trash2 class="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-1.5">
      <template v-if="group !== 'root'">
        <Input
          v-if="idEditing"
          v-model="idDraft"
          class="h-8 w-72 max-w-full font-mono text-xs"
          aria-label="Identifier"
          @keydown.enter="commitId"
          @blur="commitId"
        />
        <template v-else>
          <span class="hash truncate" :title="entity.id">{{ truncateMiddle(entity.id, 18, 10) }}</span>
          <Button variant="ghost" size="icon-sm" aria-label="Edit identifier" @click="startIdEdit">
            <Pencil class="h-3.5 w-3.5" />
          </Button>
        </template>
        <Separator orientation="vertical" class="mx-1 h-4" />
      </template>
      <template v-else-if="datasetId">
        <span class="hash truncate" :title="datasetId">{{ truncateMiddle(datasetId, 12, 8) }}</span>
        <CopyButton :value="datasetId" label="Copy the dataset id" />
        <Separator orientation="vertical" class="mx-1 h-4" />
      </template>

      <span v-for="type in entity.types" :key="type" class="chip h-6">
        {{ typeLabel(type) }}
        <button
          v-if="entity.types.length > 1"
          type="button"
          :aria-label="`Remove the type ${typeLabel(type)}`"
          class="text-muted-foreground hover:text-destructive"
          @click="emit('update', setTypes(draft, entity.id, entity.types.filter((candidate) => candidate !== type)))"
        >
          <X class="h-3 w-3" />
        </button>
      </span>
      <Button variant="ghost" size="sm" class="h-6 px-2 text-[11px]" @click="typeOpen = true">
        <Plus class="h-3 w-3" /> Add type
      </Button>
      <TypeDialog v-if="typeOpen" :open="typeOpen" :vocab="vocab" @update:open="(value) => (typeOpen = value)" @pick="addType" />
    </div>

    <Notice v-if="confirmRemove" tone="warning">
      Removing this also drops {{ uses.length === 1 ? '1 reference' : `${uses.length} references` }} to it.
      <span class="mt-1 flex gap-2">
        <Button variant="outline" size="sm" @click="confirmRemove = false">Keep it</Button>
        <Button variant="destructive" size="sm" @click="remove">Remove anyway</Button>
      </span>
    </Notice>
  </header>
</template>
