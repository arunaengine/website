<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuSub from '@/components/ui/DropdownMenuSub.vue'
import DropdownMenuSubTrigger from '@/components/ui/DropdownMenuSubTrigger.vue'
import DropdownMenuSubContent from '@/components/ui/DropdownMenuSubContent.vue'
import Notice from '@/components/ui/Notice.vue'
import ValueInput from './ValueInput.vue'
import ReferenceValue from './ReferenceValue.vue'
import LinkEntityDialog from './LinkEntityDialog.vue'
import AddEntityDialog from './AddEntityDialog.vue'
import AddFilesDialog from './AddFilesDialog.vue'
import IssueMark from './IssueMark.vue'
import RuleBadge from './RuleBadge.vue'
import { ROW_ACTIONS, ROW_GRID, ROW_LABEL, ROW_VALUE, ruleEmphasis } from './grid'
import {
  addValue,
  allowedKinds,
  changeKind,
  defaultValue,
  displayName,
  isExternalReference,
  promoteValue,
  propertyLabel,
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
import { orphanAfterUnlink, setReference, unlinkReference } from '@/lib/crate/references'
import { DATA_PICKER_LABEL, pickerFor } from '@/lib/crate/pickers'
import type { ProfilePropertyRule } from '@/lib/profiles/types'
import type { VocabIndex } from '@/lib/profiles/vocabulary'
import { Info, MoreHorizontal, Plus } from '@lucide/vue'

const props = defineProps<{
  draft: CrateDraft
  entity: DraftEntity
  property: string
  vocab: VocabIndex | null
  issues?: LiveIssue[]
  /** Root form field: one input is shown even before the property exists. */
  always?: boolean
  /** "More details" promotes a literal value into a linked entity of this type. */
  promoteTo?: string
  /** The picked profile's rule for this property, shown as its badge and hint. */
  rule?: ProfilePropertyRule | null
}>()
const emit = defineEmits<{
  (e: 'update', draft: CrateDraft): void
  (e: 'select', entityId: string): void
}>()

const linkFor = ref(-1)
const createFor = ref(-1)
const filesOpen = ref(false)
// An unlink waiting for an answer about the data entity it would strand.
const stranding = ref<{ index: number; dropRow: boolean; entity: DraftEntity } | null>(null)

const hint = computed(() => props.rule?.description ?? '')
const enumOptions = computed(() => (props.rule?.enumOptions ?? []).map((value) => ({ value, label: value })))

const picker = computed(() => pickerFor(props.property))
const target = computed(() => ({ entityId: props.entity.id, property: props.property }))
const term = computed(() => propertyTerm(props.vocab, props.property))
const label = computed(() => propertyLabel(props.vocab, props.property, props.rule))
// The whole name for a truncated one, with the key when the name differs.
const fullName = computed(() => (label.value === props.property ? label.value : `${label.value} (${props.property})`))
const kinds = computed(() => allowedKinds(props.vocab, props.property))
const range = computed(() => term.value?.targets ?? [])
const presets = computed(() => VALUE_PRESETS[props.property])
const stored = computed(() => props.entity.properties[props.property] ?? [])
// The blank row an always-shown field offers before anything is typed.
const blank = computed<DraftValue>(() => defaultValue(kinds.value.find((kind) => kind !== 'reference') ?? 'text'))
const values = computed(() => (stored.value.length || !props.always ? stored.value : [blank.value]))

// The badge sits inside the first field while it is empty; a select keeps
// its arrow clear of it.
function badged(value: DraftValue, index: number): boolean {
  return index === 0 && !value.value.trim()
}

function selectLike(value: DraftValue): boolean {
  if (props.rule?.kind === 'enum' || value.kind === 'boolean') return true
  return Boolean(presets.value) && (value.kind === 'text' || value.kind === 'url' || value.kind === 'reference')
}

function emphasis(value: DraftValue, index: number): string {
  return ruleEmphasis(props.rule, badged(value, index))
}

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
  if (!props.promoteTo || !value.value.trim()) return false
  return value.kind !== 'reference' || isExternalReference(props.draft, value)
}

function addEntry(kind: DraftValueKind) {
  if (kind === 'reference' && picker.value === 'data') {
    filesOpen.value = true
    return
  }
  emit('update', addValue(props.draft, props.entity.id, props.property, defaultValue(kind)))
}

// Unlinking clears the value; Remove entry takes the row. Either way a data
// entity nothing else reaches is one the node refuses, so it is offered too.
function unlink(index: number, dropRow: boolean) {
  const entity = orphanAfterUnlink(props.draft, props.entity.id, props.property, index)
  if (entity) {
    stranding.value = { index, dropRow, entity }
    return
  }
  emit('update', unlinkReference(props.draft, props.entity.id, props.property, index, { dropRow }))
}

function resolveStranding(removeTarget: boolean) {
  const pending = stranding.value
  stranding.value = null
  if (!pending) return
  emit('update', unlinkReference(props.draft, props.entity.id, props.property, pending.index, {
    dropRow: pending.dropRow,
    removeTarget,
  }))
}

// Removing the last value takes the property with it.
function removeEntry(index: number) {
  const value = values.value[index]
  if (value?.kind === 'reference' && value.value.trim()) {
    unlink(index, true)
    return
  }
  emit('update', removeValue(props.draft, props.entity.id, props.property, index))
}

function retype(index: number, kind: DraftValueKind) {
  emit('update', changeKind(props.draft, props.entity.id, props.property, index, kind))
}

// One picker owns some properties; every other reference offers Create and Link.
function openLink(index: number) {
  if (picker.value === 'data') filesOpen.value = true
  else linkFor.value = index
}

function openCreate(index: number) {
  if (picker.value === 'data') filesOpen.value = true
  else createFor.value = index
}

function clearOrUnlink(index: number) {
  if (values.value[index]?.kind === 'reference') unlink(index, false)
  else set(index, '')
}

function link(id: string) {
  const index = linkFor.value
  linkFor.value = -1
  if (index >= 0) emit('update', setReference(props.draft, props.entity.id, props.property, index, id))
}

function created(next: CrateDraft, entityId: string) {
  const index = createFor.value
  createFor.value = -1
  if (index < 0) return
  emit('update', setReference(next, props.entity.id, props.property, index, entityId))
}
</script>

<template>
  <div :class="ROW_GRID">
    <div :class="ROW_LABEL">
      <span class="truncate" :title="fullName">{{ label }}</span>
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

    <div class="space-y-2" :class="ROW_VALUE">
      <p v-if="hint" class="text-[11px] text-muted-foreground">{{ hint }}</p>
      <div v-for="(value, index) in values" :key="index" class="flex items-start gap-1">
        <div class="relative min-w-0 flex-1 @container">
          <ValueInput
            v-if="value.kind === 'reference' && !value.value.trim() && presets"
            :model-value="value"
            :label="label"
            :presets="presets"
            :class="emphasis(value, index)"
            @update:model-value="(next) => set(index, next.value)"
          />
          <ReferenceValue
            v-else-if="value.kind === 'reference'"
            :draft="draft"
            :value="value.value"
            :label="label"
            :add-label="picker === 'data' ? DATA_PICKER_LABEL : undefined"
            @select="(id) => emit('select', id)"
            @create="openCreate(index)"
            @link="openLink(index)"
          />
          <Select
            v-else-if="rule?.kind === 'enum'"
            :model-value="enumOptions.some((option) => option.value === value.value) ? value.value : ''"
            :options="enumOptions"
            :aria-label="label"
            :placeholder="value.value || `Choose ${label.toLowerCase()}`"
            :class="emphasis(value, index)"
            @update:model-value="(next) => set(index, next)"
          />
          <ValueInput
            v-else
            :model-value="value"
            :label="label"
            :presets="presets"
            :class="emphasis(value, index)"
            @update:model-value="(next) => set(index, next.value)"
          />
          <RuleBadge v-if="badged(value, index)" :rule="rule" :inset="selectLike(value)" />
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

        <DropdownMenu v-if="stored.length">
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
            <DropdownMenuItem @select="clearOrUnlink(index)">
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

      <div v-if="stored.length">
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

    <Notice v-if="stranding" tone="warning" class="col-span-full">
      Nothing else in this dataset holds {{ displayName(stranding.entity) }}. The node refuses a file
      it cannot reach from the dataset.
      <span class="mt-1 flex gap-2">
        <Button variant="destructive" size="sm" @click="resolveStranding(true)">
          Remove {{ displayName(stranding.entity) }} too
        </Button>
        <Button variant="outline" size="sm" @click="resolveStranding(false)">Keep it</Button>
      </span>
    </Notice>

    <AddFilesDialog
      v-if="filesOpen"
      open
      :draft="draft"
      :target="target"
      :group-id="draft.groupId"
      @update:open="(value) => (filesOpen = value)"
      @update="(next) => emit('update', next)"
    />
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
