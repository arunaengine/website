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
import type { ProfileControl, ProfileViolation } from '@/lib/profiles/types'

// The combined reuse-or-create editor for one entity-valued dataset field
// (plan Phase 4): one ordered entry list where each entry either describes a
// new instance (sub-form) or reuses an existing entity (reference input and/or
// crate picker, per the rule's entitySources policy). Single-valued rules hold
// exactly one entry with a source toggle; multi-valued rules mix freely.

const props = defineProps<{
  // The entity-ref control on the parent form (carries label/required/multiple
  // and the entitySources policy).
  control: ProfileControl
  // Sub-form controls generated from the target entity rule's property rules.
  subControls: ProfileControl[]
  // The combined entry list (described-new + reuse entries).
  entries: EntityEntry[]
  // Per-entry violations (outer index = entry): sub-form scalar violations for
  // described-new entries, reference-format violations for reuse entries.
  entryViolations: ProfileViolation[][]
  // Presence violations (required/recommended) raised on the entity control itself.
  presenceViolations: ProfileViolation[]
  typeLabel: string
  // Crate-local pick options (the dialog's current data references).
  crateOptions: Array<{ value: string; label: string }>
}>()

const emit = defineEmits<{
  (e: 'addNew'): void
  (e: 'addExisting'): void
  (e: 'remove', index: number): void
  // Convert a single-valued field's entry to the other source.
  (e: 'switchSource', index: number, source: 'new' | 'existing'): void
  (e: 'update', index: number, property: string, value: unknown): void
  (e: 'updateRef', index: number, value: string): void
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
  return (props.entryViolations[index] ?? []).filter((violation) => violation.fieldId === property)
}

function entryHasError(index: number): boolean {
  return (props.entryViolations[index] ?? []).some((violation) => violation.severity === 'error')
}

// Reuse-entry violations carry the control's own property as fieldId.
function refViolationsFor(index: number): ProfileViolation[] {
  return props.entryViolations[index] ?? []
}

// The crate option a reuse entry currently resolves to ('' when it is a URI or
// stale), so the picker reflects picks without claiming URIs.
function crateValueOf(entry: EntityEntry): string {
  const ref = (entry.ref ?? '').trim()
  return props.crateOptions.some((option) => option.value === ref) ? ref : ''
}

// D5: a nested entity reference with multiple:true is a repeatable list of
// absolute-URI inputs, each emitted as a `{"@id"}` reference. The list lives on
// the instance value keyed by the sub-control property; we edit it by emitting
// the whole array back through `update`. Single references stay a plain
// ProfileControlField URI input.
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

      <!-- Described-new entry: the target shape's sub-form. Nested entity
           references are capped at depth 1: a single reference is a plain URI
           input via ProfileControlField; a multiple reference (D5) is a
           repeatable add/remove list of URI inputs, each emitted as a {"@id"} ref. -->
      <div v-else-if="isOpen(entry.__uid)" class="grid gap-3 border-t border-border p-3 sm:grid-cols-2">
        <template v-for="field in subControls" :key="field.property">
          <div v-if="field.control === 'entity' && field.multiple" class="sm:col-span-2">
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
      </div>
    </div>
  </div>
</template>
