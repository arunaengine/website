<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuSub from '@/components/ui/DropdownMenuSub.vue'
import DropdownMenuSubTrigger from '@/components/ui/DropdownMenuSubTrigger.vue'
import DropdownMenuSubContent from '@/components/ui/DropdownMenuSubContent.vue'
import ValueInput from './ValueInput.vue'
import ReferenceValue from './ReferenceValue.vue'
import LinkEntityDialog from './LinkEntityDialog.vue'
import AddEntityDialog from './AddEntityDialog.vue'
import IssueMark from './IssueMark.vue'
import { ROW_ACTIONS, ROW_GRID, ROW_LABEL } from './grid'
import {
  addValue,
  allowedKinds,
  changeKind,
  defaultValue,
  displayName,
  promoteValue,
  propertyTerm,
  removeValue,
  setProperty,
  updateValue,
  VALUE_KIND_LABELS,
  VALUE_PRESETS,
  type CrateDraft,
  type DraftEntity,
  type DraftValue,
  type DraftValueKind,
  type LiveIssue,
} from '@/lib/crate/editor'
import type { VocabIndex } from '@/lib/profiles/vocabulary'
import { Info, MoreHorizontal, Plus } from '@lucide/vue'

const props = defineProps<{
  draft: CrateDraft
  entity: DraftEntity
  property: string
  vocab: VocabIndex | null
  issues?: LiveIssue[]
  /** The root's parts list is maintained by the files dialog, not by hand. */
  locked?: boolean
  /** Root form field: one input is shown even before the property exists. */
  always?: boolean
  /** "More details" promotes a literal value into a linked entity of this type. */
  promoteTo?: string
}>()
const emit = defineEmits<{
  (e: 'update', draft: CrateDraft): void
  (e: 'select', entityId: string): void
}>()

const linkFor = ref(-1)
const createFor = ref(-1)

const term = computed(() => propertyTerm(props.vocab, props.property))
const label = computed(() => term.value?.label ?? props.property)
const kinds = computed(() => allowedKinds(props.vocab, props.property))
const range = computed(() => term.value?.targets ?? [])
const presets = computed(() => VALUE_PRESETS[props.property])
const stored = computed(() => props.entity.properties[props.property] ?? [])
// The blank row an always-shown field offers before anything is typed.
const blank = computed<DraftValue>(() => defaultValue(kinds.value.find((kind) => kind !== 'reference') ?? 'text'))
const values = computed(() => (stored.value.length || !props.always ? stored.value : [blank.value]))

function set(index: number, value: string) {
  if (!stored.value.length) {
    emit('update', setProperty(props.draft, props.entity.id, props.property, value.trim() ? [{ ...blank.value, value }] : []))
    return
  }
  emit('update', updateValue(props.draft, props.entity.id, props.property, index, value))
}

function promote(index: number) {
  if (!props.promoteTo) return
  const promoted = promoteValue(props.draft, props.entity.id, props.property, index, props.promoteTo)
  if (!promoted) return
  emit('update', promoted.draft)
  emit('select', promoted.entity.id)
}

function promotable(value: DraftValue): boolean {
  return Boolean(props.promoteTo) && value.kind !== 'reference' && Boolean(value.value.trim())
}

function addEntry(kind: DraftValueKind) {
  emit('update', addValue(props.draft, props.entity.id, props.property, defaultValue(kind)))
}

// Removing the last value takes the property with it.
function removeEntry(index: number) {
  emit('update', removeValue(props.draft, props.entity.id, props.property, index))
}

function retype(index: number, kind: DraftValueKind) {
  emit('update', changeKind(props.draft, props.entity.id, props.property, index, kind))
}

function link(id: string) {
  const index = linkFor.value
  linkFor.value = -1
  if (index >= 0) set(index, id)
}

function created(next: CrateDraft, entityId: string) {
  const index = createFor.value
  createFor.value = -1
  if (index < 0) return
  emit('update', updateValue(next, props.entity.id, props.property, index, entityId))
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

    <div class="min-w-0 space-y-2">
      <div v-for="(value, index) in values" :key="index" class="flex items-start gap-1">
        <div class="relative min-w-0 flex-1">
          <ReferenceValue
            v-if="value.kind === 'reference'"
            :draft="draft"
            :value="value.value"
            :label="label"
            :locked="locked"
            @select="(id) => emit('select', id)"
            @create="createFor = index"
            @link="linkFor = index"
          />
          <ValueInput
            v-else
            :model-value="value"
            :label="label"
            :presets="presets"
            @update:model-value="(next) => set(index, next.value)"
          />
        </div>

        <Button
          v-if="promotable(value)"
          variant="ghost"
          size="sm"
          class="mt-0.5 h-8 shrink-0 px-2 text-xs text-primary"
          :aria-label="`More details about this ${label.toLowerCase()}`"
          @click="promote(index)"
        >
          More details
        </Button>

        <DropdownMenu v-if="!locked && stored.length">
          <DropdownMenuTrigger as-child>
            <Button
              variant="ghost"
              size="icon-sm"
              class="mt-0.5 h-8 w-8 shrink-0"
              :aria-label="`Actions for ${label} ${index + 1}`"
            >
              <MoreHorizontal class="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @select="set(index, '')">
              {{ value.kind === 'reference' ? 'Unlink' : 'Clear' }}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Change type</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  v-for="kind in kinds"
                  :key="kind"
                  :disabled="value.kind === kind"
                  @select="retype(index, kind)"
                >
                  {{ VALUE_KIND_LABELS[kind] }}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem @select="removeEntry(index)">Remove entry</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div v-if="!locked && stored.length">
        <Button v-if="kinds.length === 1" variant="ghost" size="sm" class="h-7 px-2 text-xs" @click="addEntry(kinds[0])">
          <Plus class="h-3.5 w-3.5" /> Add entry
        </Button>
        <DropdownMenu v-else>
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="sm" class="h-7 px-2 text-xs">
              <Plus class="h-3.5 w-3.5" /> Add entry
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem v-for="kind in kinds" :key="kind" @select="addEntry(kind)">
              {{ VALUE_KIND_LABELS[kind] }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <div :class="ROW_ACTIONS">
      <IssueMark :issues="issues ?? []" />
    </div>

    <LinkEntityDialog
      v-if="linkFor >= 0"
      open
      :draft="draft"
      :vocab="vocab"
      :range="range"
      @update:open="(value) => { if (!value) linkFor = -1 }"
      @pick="link"
    />
    <AddEntityDialog
      v-if="createFor >= 0"
      open
      :draft="draft"
      :vocab="vocab"
      :range="range"
      :linked-from="{ entity: displayName(entity), property: label }"
      @update:open="(value) => { if (!value) createFor = -1 }"
      @created="(entry) => created(entry.draft, entry.entity.id)"
    />
  </div>
</template>
