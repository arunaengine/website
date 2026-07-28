<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import ProfileControlField from '@/components/metadata/ProfileControlField.vue'
import { computed, reactive } from 'vue'
import { ChevronDown, ChevronRight, Link2, Plus, X } from '@lucide/vue'
import { isInvalidReferenceUri, REFERENCE_URI_MESSAGE } from '@/lib/profiles/uri'
import { entityTypeLabel } from '@/lib/profiles/entityTypes'
import { entrySourcePolicy, type EntityEntry } from '@/lib/profiles/entityEntries'
import {
  countEntryErrors,
  entriesOf,
  entityTypeLabelFor,
  nestsSubForm,
  newEntityEntry,
  newRefEntry,
  removedEntry,
  subControlsFor,
  updatedEntries,
  type EntryViolationNode,
} from '@/lib/profiles/entityTree'
import type { ProfileControl, ProfileEntityRule, ProfileViolation } from '@/lib/profiles/types'

// The combined reuse-or-create editor for one entity-valued dataset field
// (plan Phase 4): one ordered entry list where each entry either describes a
// new instance (sub-form) or reuses an existing entity (reference input and/or
// crate picker, per the rule's entitySources policy). Single-valued rules hold
// exactly one entry with a source toggle; multi-valued rules mix freely.
// Entity fields inside a sub-form whose target type has an entity rule render
// this component RECURSIVELY (up to MAX_ENTITY_DEPTH); nested ops are folded
// into a single `update(index, property, newEntries)` emit, so only the
// top-level owner (NewDatasetDialog) holds entry state.

const props = defineProps<{
  // The entity-ref control on the parent form (carries label/required/multiple
  // and the entitySources policy).
  control: ProfileControl
  // Sub-form controls generated from the target entity rule's property rules.
  subControls: ProfileControl[]
  // The combined entry list (described-new + reuse entries).
  entries: EntityEntry[]
  // Per-entry violation nodes (outer index = entry): own sub-form scalar /
  // reference-format violations plus nested trees keyed by sub-control property.
  entryViolations: EntryViolationNode[]
  // Presence violations (required/recommended) raised on the entity control itself.
  presenceViolations: ProfileViolation[]
  typeLabel: string
  // Crate-local pick options (the dialog's current data references).
  crateOptions: Array<{ value: string; label: string }>
  // All profile entity rules, so nested sub-controls resolve at every depth.
  entityRules: ProfileEntityRule[]
  // The depth of the sub-forms this instance renders (1 = top level).
  depth: number
}>()

const emit = defineEmits<{
  (e: 'addNew'): void
  (e: 'addExisting'): void
  (e: 'remove', index: number): void
  // Convert a single-valued field's entry to the other source.
  (e: 'switchSource', index: number, source: 'new' | 'existing'): void
  (e: 'update', index: number, property: string, value: unknown): void
  (e: 'updateRef', index: number, value: string): void
  // Author-chosen @id override for a described-new entry (see normalizedCustomId).
  (e: 'updateCustomId', index: number, value: string): void
}>()

const policy = computed(() => entrySourcePolicy(props.control.entitySources))

// Collapse state keyed by a stable per-entry uid (not the array index, which
// shifts on remove); cards default to open (undefined === open).
const openState = reactive<Record<number, boolean>>({})
const isOpen = (uid: number) => openState[uid] !== false
const toggle = (uid: number) => (openState[uid] = !isOpen(uid))

const atCapacity = computed(() => !props.control.multiple && props.entries.length >= 1)

function summary(entry: EntityEntry, index: number): string {
  if (entry.source === 'new') {
    const name = entry.instance?.name
    const text = typeof name === 'string' ? name.trim() : ''
    return text || `${props.typeLabel} ${index + 1}`
  }
  return (entry.ref ?? '').trim() || `Existing ${props.typeLabel}`
}

function violationsFor(index: number, property: string): ProfileViolation[] {
  return (props.entryViolations[index]?.own ?? []).filter((violation) => violation.fieldId === property)
}

// Nested errors count too, so a collapsed card still shows its error dot.
function entryHasError(index: number): boolean {
  const node = props.entryViolations[index]
  if (!node) return false
  return node.own.some((violation) => violation.severity === 'error') || countEntryErrors(Object.values(node.nested).flat()) > 0
}

// Reuse-entry violations carry the control's own property as fieldId.
function refViolationsFor(index: number): ProfileViolation[] {
  return props.entryViolations[index]?.own ?? []
}

function nestedNodes(index: number, property: string): EntryViolationNode[] {
  return props.entryViolations[index]?.nested[property] ?? []
}

// The crate option a reuse entry currently resolves to ('' when it is a URI or
// stale), so the picker reflects picks without claiming URIs.
function crateValueOf(entry: EntityEntry): string {
  const ref = (entry.ref ?? '').trim()
  return props.crateOptions.some((option) => option.value === ref) ? ref : ''
}

// D5: a FLAT entity reference (target without an entity rule, or at the depth
// cap) with multiple:true is a repeatable list of absolute-URI inputs, each
// emitted as a `{"@id"}` reference. The list lives on the instance value keyed
// by the sub-control property; we edit it by emitting the whole array back
// through `update`. Single flat references stay a plain ProfileControlField
// URI input.
function refList(entry: EntityEntry, property: string): string[] {
  const raw = entry.instance?.[property]
  return Array.isArray(raw) ? raw.map((value) => String(value)) : []
}
function addRef(index: number, property: string) {
  emit('update', index, property, [...refList(props.entries[index] ?? { __uid: -1, source: 'new' }, property), ''])
}
function updateRef(index: number, property: string, refIndex: number, value: string) {
  const list = refList(props.entries[index] ?? { __uid: -1, source: 'new' }, property)
  list[refIndex] = value
  emit('update', index, property, list)
}
function removeRef(index: number, property: string, refIndex: number) {
  const list = refList(props.entries[index] ?? { __uid: -1, source: 'new' }, property)
  list.splice(refIndex, 1)
  emit('update', index, property, list)
}
// Inline per-row URI error. Shares the predicate + message with
// NewDatasetDialog's gating violations (via uri.ts, L7) so display and gating agree.
function rowRefError(value: string): boolean {
  return isInvalidReferenceUri(value)
}

// Nested sub-form ops: each computes the entry's NEW nested entry list and
// folds it into one `update(index, property, list)` emit, so every level above
// applies the same immutable rebuild and only the dialog owns state.
function nestedEntries(index: number, property: string): EntityEntry[] {
  return entriesOf(props.entries[index]?.instance?.[property])
}
function setNested(index: number, property: string, list: EntityEntry[]) {
  emit('update', index, property, list)
}
function nestedAdd(index: number, field: ProfileControl, source: 'new' | 'existing') {
  const created = source === 'new' ? newEntityEntry(field, props.entityRules, props.depth + 1) : newRefEntry()
  setNested(index, field.property, [...nestedEntries(index, field.property), created])
}
function nestedRemove(index: number, field: ProfileControl, nestedIndex: number) {
  setNested(index, field.property, removedEntry(nestedEntries(index, field.property), nestedIndex))
}
// The replaced entry's values are dropped deliberately (a fresh start per
// source keeps the emission unambiguous) — mirrors the top-level switch.
function nestedSwitch(index: number, field: ProfileControl, nestedIndex: number, source: 'new' | 'existing') {
  const list = nestedEntries(index, field.property)
  const current = list[nestedIndex]
  if (!current || current.source === source) return
  const fresh = source === 'new' ? newEntityEntry(field, props.entityRules, props.depth + 1) : newRefEntry()
  setNested(index, field.property, updatedEntries(list, nestedIndex, () => fresh))
}
function nestedValue(index: number, field: ProfileControl, nestedIndex: number, property: string, value: unknown) {
  setNested(index, field.property, updatedEntries(nestedEntries(index, field.property), nestedIndex, (entry) =>
    entry.source === 'new' ? { ...entry, instance: { ...(entry.instance ?? {}), [property]: value } } : undefined,
  ))
}
function nestedRef(index: number, field: ProfileControl, nestedIndex: number, value: string) {
  setNested(index, field.property, updatedEntries(nestedEntries(index, field.property), nestedIndex, (entry) =>
    entry.source === 'existing' ? { ...entry, ref: value } : undefined,
  ))
}
function nestedCustomId(index: number, field: ProfileControl, nestedIndex: number, value: string) {
  setNested(index, field.property, updatedEntries(nestedEntries(index, field.property), nestedIndex, (entry) =>
    entry.source === 'new' ? { ...entry, customId: value } : undefined,
  ))
}

// Target-aware placeholder for a reference URI input (ORCID for a Person, ROR
// for an Organization, DOI for a CreativeWork, else a generic absolute URI).
function refPlaceholder(field: ProfileControl): string {
  const names = (field.entityTypes ?? []).map(entityTypeLabel)
  if (names.includes('Person')) return 'Reference URI, e.g. https://orcid.org/0000-0002-1825-0097'
  if (names.includes('Organization')) return 'Reference URI, e.g. https://ror.org/03yrm5c26'
  if (names.includes('CreativeWork') || names.includes('ScholarlyArticle')) return 'Reference URI, e.g. https://doi.org/10.1234/example'
  return 'Reference URI, e.g. https://…'
}

// Empty-state hint that reflects the derived obligation of the entity control.
function emptyStateText(): string {
  if (props.control.required) return `No ${props.typeLabel} added yet, at least one is required.`
  if (props.control.obligation === 'SHOULD') return `No ${props.typeLabel} added yet, at least one is recommended.`
  return `No ${props.typeLabel} added yet.`
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-3">
      <div>
        <label class="text-xs font-medium text-foreground">
          {{ control.label }} <span v-if="control.required" class="text-destructive">*</span>
        </label>
        <p v-if="control.description" class="text-[11px] text-muted-foreground">{{ control.description }}</p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <Badge variant="secondary">{{ entries.length }} {{ entries.length === 1 ? 'entry' : 'entries' }}</Badge>
        <Button v-if="policy.allowNew" variant="outline" size="sm" :disabled="atCapacity" @click="emit('addNew')">
          <Plus class="size-3.5" /> Add new
        </Button>
        <Button v-if="policy.allowExisting" variant="outline" size="sm" :disabled="atCapacity" @click="emit('addExisting')">
          <Link2 class="size-3.5" /> Use existing
        </Button>
      </div>
    </div>

    <!-- Honest validation scope: reuse references are never re-validated
         against the target shape (plan 5.4). -->
    <p v-if="policy.allowExisting && policy.allowNew" class="mt-1 text-[11px] text-muted-foreground">
      Existing entries are referenced only; the {{ typeLabel }} rules apply to entries you describe here.
    </p>

    <!-- L1: with zero entries the empty-state line below already states the
         obligation, so suppress the redundant presence violation here. -->
    <template v-if="entries.length">
      <p
        v-for="violation in presenceViolations"
        :key="violation.ruleId + violation.pointer"
        class="mt-1 text-[11px]"
        :class="violation.severity === 'error' ? 'text-destructive' : 'text-amber-800 dark:text-amber-300'"
      >
        {{ violation.message }}
      </p>
    </template>

    <p v-if="!entries.length" class="mt-2 text-[11px]" :class="control.required ? 'text-destructive' : 'text-muted-foreground'">
      {{ emptyStateText() }}
    </p>

    <div v-for="(entry, index) in entries" :key="entry.__uid" class="mt-2 rounded-md border border-border bg-card">
      <div class="flex items-center justify-between gap-2 px-3 py-2">
        <button
          v-if="entry.source === 'new'"
          type="button"
          class="flex min-w-0 items-center gap-2 text-left text-xs font-medium text-foreground"
          @click="toggle(entry.__uid)"
        >
          <component :is="isOpen(entry.__uid) ? ChevronDown : ChevronRight" class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span class="truncate">{{ summary(entry, index) }}</span>
          <span v-if="entryHasError(index)" class="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" aria-label="Has errors" />
        </button>
        <span v-else class="flex min-w-0 items-center gap-2 text-xs font-medium text-foreground">
          <Link2 class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span class="truncate">{{ summary(entry, index) }}</span>
          <Badge variant="secondary" class="shrink-0 text-[10px]">existing</Badge>
          <span v-if="entryHasError(index)" class="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" aria-label="Has errors" />
        </span>
        <div class="flex shrink-0 items-center gap-1">
          <!-- Single-valued fields keep one entry; the toggle switches how it is
               fulfilled (describe new vs reuse existing). -->
          <div v-if="!control.multiple && policy.allowNew && policy.allowExisting" class="flex items-center rounded-md border border-border p-0.5" role="group" :aria-label="`${control.label} source`">
            <Button
              :variant="entry.source === 'new' ? 'secondary' : 'ghost'"
              size="sm"
              class="h-6 px-2 text-[11px]"
              @click="entry.source !== 'new' && emit('switchSource', index, 'new')"
            >
              Add new
            </Button>
            <Button
              :variant="entry.source === 'existing' ? 'secondary' : 'ghost'"
              size="sm"
              class="h-6 px-2 text-[11px]"
              @click="entry.source !== 'existing' && emit('switchSource', index, 'existing')"
            >
              Use existing
            </Button>
          </div>
          <Button variant="ghost" size="icon" :aria-label="`Remove ${typeLabel}`" @click="emit('remove', index)">
            <X />
          </Button>
        </div>
      </div>

      <!-- Reuse entry: reference input and/or crate picker per the policy. -->
      <div v-if="entry.source === 'existing'" class="space-y-2 border-t border-border p-3">
        <template v-if="policy.allowExternal">
          <Input
            :model-value="entry.ref ?? ''"
            :placeholder="refPlaceholder(control)"
            :invalid="refViolationsFor(index).some((violation) => violation.severity === 'error') ? 'error' : undefined"
            :aria-label="`${control.label} reference URI`"
            @update:model-value="(value: string | number) => emit('updateRef', index, String(value))"
          />
        </template>
        <template v-if="policy.allowCrate">
          <Select
            v-if="crateOptions.length"
            :model-value="crateValueOf(entry)"
            :options="crateOptions"
            :placeholder="policy.allowExternal ? 'Or pick a data reference' : 'Choose a data reference'"
            :aria-label="`${control.label} data reference`"
            @update:model-value="(value: string) => emit('updateRef', index, value)"
          />
          <p v-else-if="!policy.allowExternal" class="text-[11px] text-muted-foreground">Add a data reference below, then pick it here.</p>
        </template>
        <p v-if="!policy.allowNew" class="text-[11px] text-muted-foreground">
          Checked as a reference only, not against the {{ typeLabel }} rules.
        </p>
        <template v-for="violation in refViolationsFor(index)" :key="violation.ruleId + violation.pointer">
          <p class="text-[11px]" :class="violation.severity === 'error' ? 'text-destructive' : 'text-amber-800 dark:text-amber-300'">
            {{ violation.message }}
          </p>
        </template>
      </div>

      <!-- Described-new entry: the target shape's sub-form. Entity fields whose
           target type has an entity rule recurse into this component (up to
           MAX_ENTITY_DEPTH); at the cap or without a rule they stay flat URI
           references — a single one a plain URI input via ProfileControlField, a
           multiple one (D5) a repeatable add/remove list of URI inputs, each
           emitted as a {"@id"} ref. -->
      <div v-else-if="isOpen(entry.__uid)" class="grid gap-3 border-t border-border p-3 sm:grid-cols-2">
        <template v-for="field in subControls" :key="field.property">
          <div v-if="field.control === 'entity' && nestsSubForm(field, depth)" class="rounded-md border-l-2 border-border pl-3 sm:col-span-2">
            <DatasetEntityInstances
              :control="field"
              :sub-controls="subControlsFor(field, entityRules)"
              :entries="nestedEntries(index, field.property)"
              :entry-violations="nestedNodes(index, field.property)"
              :presence-violations="violationsFor(index, field.property)"
              :type-label="entityTypeLabelFor(field)"
              :crate-options="crateOptions"
              :entity-rules="entityRules"
              :depth="depth + 1"
              @add-new="nestedAdd(index, field, 'new')"
              @add-existing="nestedAdd(index, field, 'existing')"
              @remove="(nestedIndex: number) => nestedRemove(index, field, nestedIndex)"
              @switch-source="(nestedIndex: number, source: 'new' | 'existing') => nestedSwitch(index, field, nestedIndex, source)"
              @update="(nestedIndex: number, property: string, value: unknown) => nestedValue(index, field, nestedIndex, property, value)"
              @update-ref="(nestedIndex: number, value: string) => nestedRef(index, field, nestedIndex, value)"
              @update-custom-id="(nestedIndex: number, value: string) => nestedCustomId(index, field, nestedIndex, value)"
            />
          </div>
          <div v-else-if="field.control === 'entity' && field.multiple" class="sm:col-span-2">
            <div class="flex items-center justify-between gap-3">
              <label class="text-xs font-medium text-foreground">
                {{ field.label }} <span v-if="field.required" class="text-destructive">*</span>
              </label>
              <Button variant="outline" size="sm" @click="addRef(index, field.property)">
                <Plus class="size-3.5" /> Add reference
              </Button>
            </div>
            <p v-if="field.description" class="text-[11px] text-muted-foreground">{{ field.description }}</p>
            <!-- Presence (required/recommended) violations for the whole list. Per-row
                 URI errors (ruleId 'format.uri') are shown inline under each input. -->
            <template v-for="violation in violationsFor(index, field.property).filter((item) => item.ruleId !== 'format.uri')" :key="violation.ruleId + violation.pointer">
              <p class="mt-1 text-[11px]" :class="violation.severity === 'error' ? 'text-destructive' : 'text-amber-800 dark:text-amber-300'">
                {{ violation.message }}
              </p>
            </template>
            <div v-for="(ref, refIndex) in refList(entry, field.property)" :key="refIndex" class="mt-1">
              <div class="flex items-center gap-2">
                <Input
                  :model-value="ref"
                  :placeholder="refPlaceholder(field)"
                  class="flex-1"
                  :invalid="rowRefError(ref) ? 'error' : undefined"
                  @update:model-value="(value: string | number) => updateRef(index, field.property, refIndex, String(value))"
                />
                <Button variant="ghost" size="icon" :aria-label="`Remove ${field.label} reference`" @click="removeRef(index, field.property, refIndex)">
                  <X />
                </Button>
              </div>
              <p v-if="rowRefError(ref)" class="mt-1 text-[11px] text-destructive">{{ REFERENCE_URI_MESSAGE }}</p>
            </div>
          </div>
          <!-- The `identifier` field decides the emitted entity's @id: an absolute
               URI value becomes the @id, otherwise a local #id is minted (emit.ts
               buildEntityInstance). Surface that rule so it is no longer invisible. -->
          <div v-else-if="field.property === 'identifier'">
            <ProfileControlField
              :control="field"
              :model-value="entry.instance?.[field.property]"
              :violations="violationsFor(index, field.property)"
              @update:model-value="(value: unknown) => emit('update', index, field.property, value)"
            />
            <p class="mt-1 text-[11px] text-muted-foreground">If this is an absolute URI (e.g. an ORCID), it becomes the entity's @id in the crate; otherwise a local #id is generated.</p>
          </div>
          <ProfileControlField
            v-else
            :control="field"
            :model-value="entry.instance?.[field.property]"
            :violations="violationsFor(index, field.property)"
            :class="field.control === 'textarea' || field.control === 'tags' ? 'sm:col-span-2' : ''"
            @update:model-value="(value: unknown) => emit('update', index, field.property, value)"
          />
        </template>
        <!-- Optional explicit @id: overrides both the identifier-derived and the
             synthetic id. Absolute URIs are used as-is; anything else becomes a
             crate-local #id. -->
        <div class="sm:col-span-2">
          <label class="text-[11px] font-medium text-muted-foreground">Identifier (@id), optional</label>
          <Input
            :model-value="entry.customId ?? ''"
            class="mt-0.5 font-mono"
            placeholder="e.g. https://orcid.org/0000-…, or #my-local-id (blank = generated)"
            :aria-label="`${typeLabel} @id override`"
            @update:model-value="(value: string | number) => emit('updateCustomId', index, String(value))"
          />
        </div>
      </div>
    </div>
  </div>
</template>
