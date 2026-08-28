<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import ValueInput from './ValueInput.vue'
import ReferenceValue from './ReferenceValue.vue'
import LinkEntityPopover from './LinkEntityPopover.vue'
import AddEntityDialog from './AddEntityDialog.vue'
import IssueMark from './IssueMark.vue'
import { ROW_ACTIONS, ROW_GRID, ROW_LABEL } from './grid'
import {
  addValue,
  changeKind,
  defaultValue,
  propertyTerm,
  removeValue,
  setProperty,
  updateValue,
  valueKindsFor,
  VALUE_KIND_LABELS,
  type CrateDraft,
  type DraftEntity,
  type DraftValueKind,
  type LiveIssue,
} from '@/lib/crate/editor'
import type { VocabIndex } from '@/lib/profiles/vocabulary'
import { ExternalLink, Info, Link2, MoreHorizontal, Plus, X } from '@lucide/vue'

const props = defineProps<{
  draft: CrateDraft
  entity: DraftEntity
  property: string
  vocab: VocabIndex | null
  issues?: LiveIssue[]
  /** The root's parts list is maintained by the files dialog, not by hand. */
  locked?: boolean
}>()
const emit = defineEmits<{
  (e: 'update', draft: CrateDraft): void
  (e: 'select', entityId: string): void
}>()

const linkOpen = ref(false)
const urlOpen = ref(false)
const createOpen = ref(false)

const term = computed(() => propertyTerm(props.vocab, props.property))
const label = computed(() => term.value?.label ?? props.property)
const values = computed(() => props.entity.properties[props.property] ?? [])
const kinds = computed(() => valueKindsFor(props.vocab, props.property))
const range = computed(() => term.value?.targets ?? [])
const plain = computed(() => kinds.value.filter((kind) => kind !== 'reference'))

function add(kind: DraftValueKind) {
  emit('update', addValue(props.draft, props.entity.id, props.property, defaultValue(kind)))
}

function link(id: string) {
  linkOpen.value = false
  urlOpen.value = false
  emit('update', addValue(props.draft, props.entity.id, props.property, { kind: 'reference', value: id }))
}

function retype(kind: DraftValueKind) {
  let next = props.draft
  for (let index = 0; index < values.value.length; index += 1) {
    next = changeKind(next, props.entity.id, props.property, index, kind)
  }
  emit('update', next)
}
</script>

<template>
  <div :class="ROW_GRID">
    <div :class="ROW_LABEL">
      <span class="truncate" :title="property">{{ label }}</span>
      <Tooltip v-if="term?.description" :label="term.description">
        <button
          type="button"
          class="shrink-0 text-muted-foreground hover:text-foreground"
          :aria-label="`About ${label}`"
        >
          <Info class="h-3.5 w-3.5" />
        </button>
      </Tooltip>
    </div>

    <div class="min-w-0 space-y-3">
      <div v-for="(value, index) in values" :key="index" class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <ReferenceValue
            v-if="value.kind === 'reference'"
            :draft="draft"
            :value="value.value"
            :label="`${label} reference`"
            :locked="locked"
            @select="(id) => emit('select', id)"
            @update:value="(next) => emit('update', updateValue(draft, entity.id, property, index, next))"
          />
          <ValueInput
            v-else
            :model-value="value"
            :label="label"
            @update:model-value="(next) => emit('update', updateValue(draft, entity.id, property, index, next.value))"
          />
        </div>
        <Button
          v-if="!locked && values.length > 1"
          variant="ghost"
          size="icon-sm"
          class="mt-1 shrink-0"
          :aria-label="`Remove this ${label} value`"
          @click="emit('update', removeValue(draft, entity.id, property, index))"
        >
          <X class="h-3.5 w-3.5" />
        </Button>
      </div>

      <div v-if="!locked" class="flex flex-wrap items-center gap-2">
        <template v-if="kinds.includes('reference')">
          <Button variant="outline" size="sm" @click="createOpen = true">
            <Plus class="h-3.5 w-3.5" /> Add
          </Button>
          <div class="relative">
            <Button variant="outline" size="sm" @click="linkOpen = !linkOpen">
              <Link2 class="h-3.5 w-3.5" /> Choose existing
            </Button>
            <LinkEntityPopover
              v-if="linkOpen"
              :draft="draft"
              :vocab="vocab"
              :range="range"
              @pick="link"
              @close="linkOpen = false"
            />
          </div>
          <div class="relative">
            <Button variant="outline" size="sm" @click="urlOpen = !urlOpen">
              <ExternalLink class="h-3.5 w-3.5" /> External URL
            </Button>
            <LinkEntityPopover
              v-if="urlOpen"
              mode="url"
              :draft="draft"
              :vocab="vocab"
              :range="range"
              @pick="link"
              @close="urlOpen = false"
            />
          </div>
        </template>
        <Button v-if="plain.length === 1" variant="outline" size="sm" @click="add(plain[0])">
          <Plus class="h-3.5 w-3.5" /> Add another
        </Button>
        <DropdownMenu v-else-if="plain.length > 1">
          <DropdownMenuTrigger as-child>
            <Button variant="outline" size="sm"><Plus class="h-3.5 w-3.5" /> Add another</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem v-for="kind in plain" :key="kind" @select="add(kind)">
              {{ VALUE_KIND_LABELS[kind] }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <div :class="ROW_ACTIONS">
      <IssueMark :issues="issues ?? []" />
      <DropdownMenu v-if="!locked">
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="icon-sm" class="h-8 w-8" :aria-label="`Actions for ${label}`">
            <MoreHorizontal class="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            v-for="kind in kinds"
            :key="kind"
            :disabled="values.every((value) => value.kind === kind)"
            @select="retype(kind)"
          >
            Change type to {{ VALUE_KIND_LABELS[kind].toLowerCase() }}
          </DropdownMenuItem>
          <DropdownMenuItem @select="emit('update', setProperty(draft, entity.id, property, []))">
            Remove {{ label }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <AddEntityDialog
      v-if="createOpen"
      :open="createOpen"
      :draft="draft"
      :vocab="vocab"
      :range="range"
      @update:open="(value) => (createOpen = value)"
      @created="(created) => {
        createOpen = false
        emit('update', addValue(created.draft, entity.id, property, { kind: 'reference', value: created.entity.id }))
      }"
    />
  </div>
</template>
