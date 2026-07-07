<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import ProfileControlField from '@/components/metadata/ProfileControlField.vue'
import { reactive } from 'vue'
import { ChevronDown, ChevronRight, Plus, X } from '@lucide/vue'
import { isInvalidReferenceUri, REFERENCE_URI_MESSAGE } from '@/lib/profiles/uri'
import { entityTypeLabel } from '@/lib/profiles/entityTypes'
import type { ProfileControl, ProfileViolation } from '@/lib/profiles/types'

const props = defineProps<{
  // The entity-ref control on the parent form (carries label/required/multiple).
  control: ProfileControl
  // Sub-form controls generated from the target entity rule's property rules.
  subControls: ProfileControl[]
  // One record of scalar/URI values per instance, keyed by sub-control property.
  // Each carries a stable `__uid` used only for keying (never emitted).
  instances: Array<Record<string, unknown>>
  // Per-instance scalar violations (outer index = instance).
  instanceViolations: ProfileViolation[][]
  // Presence violations (required/recommended) raised on the entity control itself.
  presenceViolations: ProfileViolation[]
  typeLabel: string
}>()

const emit = defineEmits<{
  (e: 'add'): void
  (e: 'remove', index: number): void
  (e: 'update', index: number, property: string, value: unknown): void
}>()

// Collapse state keyed by a stable per-instance uid (not the array index, which
// shifts on remove); cards default to open (undefined === open).
const openState = reactive<Record<number, boolean>>({})
const uidOf = (instance: Record<string, unknown>): number => (typeof instance.__uid === 'number' ? instance.__uid : -1)
const isOpen = (uid: number) => openState[uid] !== false
const toggle = (uid: number) => (openState[uid] = !isOpen(uid))

const atCapacity = () => !props.control.multiple && props.instances.length >= 1

function summary(instance: Record<string, unknown>, index: number): string {
  const name = instance.name
  const text = typeof name === 'string' ? name.trim() : ''
  return text || `${props.typeLabel} ${index + 1}`
}

function violationsFor(index: number, property: string): ProfileViolation[] {
  return (props.instanceViolations[index] ?? []).filter((violation) => violation.fieldId === property)
}

function instanceHasError(index: number): boolean {
  return (props.instanceViolations[index] ?? []).some((violation) => violation.severity === 'error')
}

// D5: a nested entity reference with multiple:true is a repeatable list of
// absolute-URI inputs, each emitted as a `{"@id"}` reference. The list lives on
// the instance value keyed by the sub-control property; we edit it by emitting the
// whole array back through `update` (the parent stores it verbatim). Single
// references stay a plain ProfileControlField URI input.
function refList(instance: Record<string, unknown>, property: string): string[] {
  const raw = instance[property]
  return Array.isArray(raw) ? raw.map((entry) => String(entry)) : []
}
function addRef(index: number, property: string) {
  emit('update', index, property, [...refList(props.instances[index] ?? {}, property), ''])
}
function updateRef(index: number, property: string, refIndex: number, value: string) {
  const list = refList(props.instances[index] ?? {}, property)
  list[refIndex] = value
  emit('update', index, property, list)
}
function removeRef(index: number, property: string, refIndex: number) {
  const list = refList(props.instances[index] ?? {}, property)
  list.splice(refIndex, 1)
  emit('update', index, property, list)
}
// Inline per-row URI error. Shares the predicate + message with
// NewDatasetDialog.referenceUriViolations (via uri.ts, L7), which produces the
// matching submit-gating violations, so display and gating agree.
function refError(value: string): boolean {
  return isInvalidReferenceUri(value)
}

// Target-aware placeholder for a nested reference URI input (ORCID for a Person,
// ROR for an Organization, DOI for a CreativeWork, else a generic absolute URI),
// mirroring ProfileControlField's single-reference placeholder.
function refPlaceholder(field: ProfileControl): string {
  const names = (field.entityTypes ?? []).map(entityTypeLabel)
  if (names.includes('Person')) return 'Reference URI, e.g. https://orcid.org/0000-0002-1825-0097'
  if (names.includes('Organization')) return 'Reference URI, e.g. https://ror.org/03yrm5c26'
  if (names.includes('CreativeWork') || names.includes('ScholarlyArticle')) return 'Reference URI, e.g. https://doi.org/10.1234/example'
  return 'Reference URI, e.g. https://…'
}

// Empty-state hint that reflects the derived obligation of the entity control.
function emptyStateText(): string {
  if (props.control.required) return `No ${props.typeLabel} added yet — at least one is required.`
  if (props.control.obligation === 'SHOULD') return `No ${props.typeLabel} added yet — at least one is recommended.`
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
        <Badge variant="secondary">{{ instances.length }} {{ instances.length === 1 ? 'entry' : 'entries' }}</Badge>
        <Button variant="outline" size="sm" :disabled="atCapacity()" @click="emit('add')">
          <Plus class="size-3.5" /> Add {{ typeLabel }}
        </Button>
      </div>
    </div>

    <!-- L1: with zero instances the empty-state line below already states the
         obligation, so suppress the redundant presence violation here. -->
    <template v-if="instances.length">
      <p
        v-for="violation in presenceViolations"
        :key="violation.constraint + violation.pointer"
        class="mt-1 text-[11px]"
        :title="violation.ruleId"
        :class="violation.severity === 'error' ? 'text-destructive' : 'text-amber-800 dark:text-amber-300'"
      >
        {{ violation.message }}
      </p>
    </template>

    <p v-if="!instances.length" class="mt-2 text-[11px]" :class="control.required ? 'text-destructive' : 'text-muted-foreground'">
      {{ emptyStateText() }}
    </p>

    <div v-for="(instance, index) in instances" :key="uidOf(instance)" class="mt-2 rounded-md border border-border bg-card">
      <div class="flex items-center justify-between gap-2 px-3 py-2">
        <button type="button" class="flex min-w-0 items-center gap-2 text-left text-xs font-medium text-foreground" @click="toggle(uidOf(instance))">
          <component :is="isOpen(uidOf(instance)) ? ChevronDown : ChevronRight" class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span class="truncate">{{ summary(instance, index) }}</span>
          <span v-if="instanceHasError(index)" class="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" aria-label="Has errors" />
        </button>
        <Button variant="ghost" size="icon" :aria-label="`Remove ${typeLabel}`" @click="emit('remove', index)">
          <X />
        </Button>
      </div>
      <!-- Nested entity references are capped at depth 1. A single reference is a
           plain URI input via ProfileControlField; a multiple reference (D5) is a
           repeatable add/remove list of URI inputs, each emitted as a {"@id"} ref. -->
      <div v-if="isOpen(uidOf(instance))" class="grid gap-3 border-t border-border p-3 sm:grid-cols-2">
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
                 URI errors (constraint 'format.uri') are shown inline under each input. -->
            <template v-for="violation in violationsFor(index, field.property).filter((item) => item.constraint !== 'format.uri')" :key="violation.constraint + violation.pointer">
              <p class="mt-1 text-[11px]" :title="violation.ruleId" :class="violation.severity === 'error' ? 'text-destructive' : 'text-amber-800 dark:text-amber-300'">
                {{ violation.message }}
              </p>
            </template>
            <div v-for="(ref, refIndex) in refList(instance, field.property)" :key="refIndex" class="mt-1">
              <div class="flex items-center gap-2">
                <Input
                  :model-value="ref"
                  :placeholder="refPlaceholder(field)"
                  class="flex-1"
                  :invalid="refError(ref) ? 'error' : undefined"
                  @update:model-value="(value: string | number) => updateRef(index, field.property, refIndex, String(value))"
                />
                <Button variant="ghost" size="icon" :aria-label="`Remove ${field.label} reference`" @click="removeRef(index, field.property, refIndex)">
                  <X />
                </Button>
              </div>
              <p v-if="refError(ref)" class="mt-1 text-[11px] text-destructive">{{ REFERENCE_URI_MESSAGE }}</p>
            </div>
          </div>
          <!-- The `identifier` field decides the emitted entity's @id: an absolute
               URI value becomes the @id, otherwise a local #id is minted (emit.ts
               buildEntityInstance). Surface that rule so it is no longer invisible. -->
          <div v-else-if="field.property === 'identifier'">
            <ProfileControlField
              :control="field"
              :model-value="instance[field.property]"
              :violations="violationsFor(index, field.property)"
              @update:model-value="(value: unknown) => emit('update', index, field.property, value)"
            />
            <p class="mt-1 text-[11px] text-muted-foreground">If this is an absolute URI (e.g. an ORCID), it becomes the entity's @id in the crate; otherwise a local #id is generated.</p>
          </div>
          <ProfileControlField
            v-else
            :control="field"
            :model-value="instance[field.property]"
            :violations="violationsFor(index, field.property)"
            :class="field.control === 'textarea' || field.control === 'tags' ? 'sm:col-span-2' : ''"
            @update:model-value="(value: unknown) => emit('update', index, field.property, value)"
          />
        </template>
      </div>
    </div>
  </div>
</template>
