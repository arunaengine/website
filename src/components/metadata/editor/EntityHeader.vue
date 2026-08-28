<script setup lang="ts">
import { computed, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Popover from '@/components/ui/Popover.vue'
import TypeBrowser from './TypeBrowser.vue'
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
import { Plus, Trash2, X } from '@lucide/vue'

const props = defineProps<{ draft: CrateDraft; entity: DraftEntity; vocab: VocabIndex | null }>()
const emit = defineEmits<{
  (e: 'update', draft: CrateDraft): void
  (e: 'select', entityId: string): void
}>()

const idEditing = ref(false)
const idDraft = ref('')
const typeOpen = ref(false)
const pickerType = ref('')
const confirmRemove = ref(false)

const group = computed(() => entityGroup(props.draft, props.entity))
const badge = computed(() => {
  if (group.value === 'root') return 'Root'
  if (group.value !== 'data') return 'Contextual'
  return props.entity.types.map(typeLabel).includes('File') ? 'File' : 'Dataset'
})
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
  typeOpen.value = false
  pickerType.value = ''
  emit('update', setTypes(props.draft, props.entity.id, [...props.entity.types, type]))
}

function remove() {
  confirmRemove.value = false
  emit('update', removeEntity(props.draft, props.entity.id).draft)
  emit('select', props.draft.entities[0]?.id ?? '')
}
</script>

<template>
  <header class="space-y-3 border-b border-border px-5 py-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 flex-1 space-y-1">
        <div class="flex min-w-0 items-center gap-2">
          <Badge :variant="group === 'root' ? 'default' : group === 'data' ? 'sky' : 'secondary'">
            {{ badge }}
          </Badge>
          <h2 class="min-w-0 truncate font-display text-sm font-semibold text-aruna-navy">
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
        </div>
        <div class="flex items-center gap-2 pl-1">
          <Input
            v-if="idEditing"
            v-model="idDraft"
            class="h-8 font-mono text-xs"
            aria-label="Identifier"
            @keydown.enter="commitId"
            @blur="commitId"
          />
          <template v-else>
            <span class="hash truncate" :title="entity.id">{{ truncateMiddle(entity.id, 18, 10) }}</span>
            <Button
              variant="link"
              size="sm"
              class="h-auto p-0 text-[11px]"
              aria-label="Edit identifier"
              @click="startIdEdit"
            >
              Edit identifier
            </Button>
          </template>
        </div>
      </div>
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
      <div class="relative">
        <Button variant="ghost" size="sm" class="h-6 px-2 text-[11px]" @click="typeOpen = !typeOpen">
          <Plus class="h-3 w-3" /> Add type
        </Button>
        <div
          v-if="typeOpen"
          class="absolute left-0 top-full z-30 mt-1 w-80 rounded-md border border-border bg-popover p-2 shadow-md"
        >
          <TypeBrowser v-model="pickerType" :vocab="vocab" />
          <div class="mt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" @click="typeOpen = false">Cancel</Button>
            <Button size="sm" aria-label="Add this type" :disabled="!pickerType" @click="addType(pickerType)">
              Add
            </Button>
          </div>
        </div>
      </div>
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
