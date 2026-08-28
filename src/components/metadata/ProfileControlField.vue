<script setup lang="ts">
import { computed } from 'vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import Button from '@/components/ui/Button.vue'
import { Plus, X } from '@lucide/vue'
import { isInvalidReferenceUri, isRecord, REFERENCE_URI_MESSAGE } from '@/lib/profiles/uri'
import { entityTypeLabel } from '@/lib/profiles/entityTypes'
import { primaryEntityInput } from '@/lib/profiles/sources'
import type { ProfileControl, ProfileViolation } from '@/lib/profiles/types'

// Shared renderer for one profile control: label + required star + the right
// input (textarea / select / checkbox / plain input, incl. a depth-1 entity
// reference URI input) + description + example placeholder + violations. A
// `multiple` select / select-object renders as a checkbox list holding a string
// array (of option values / option `@id`s). Shared with the ProfileReviewStep
// preview so the two never drift. `disabled` renders a read-only preview.
const props = defineProps<{
  control: ProfileControl
  modelValue: unknown
  violations?: ProfileViolation[]
  disabled?: boolean
  // Crate-local pick options (the dialog's data references) for an entity
  // control whose policy resolves to the crate picker; each `{ value: @id,
  // label }`. Ignored for every other control / entity input.
  crateOptions?: Array<{ value: string; label: string }>
}>()

// Which entity input this control renders (Phase 0 bridge until the combined
// reuse-or-create control lands): controls that allow `new` render their own
// sub-form and never reach the entity branch here.
const entityInput = computed(() => primaryEntityInput(props.control.entitySources))

const emit = defineEmits<{ (e: 'update:modelValue', value: unknown): void }>()

const displayValue = computed(() => {
  const value = props.modelValue
  if (Array.isArray(value)) return value.join(', ')
  if (value === undefined || value === null) return ''
  return String(value)
})

const selectOptions = computed(() => (props.control.enumOptions ?? []).map((option) => ({ value: option, label: option })))

// select-object: a pick-list over raw JSON-LD option objects. Label from
// `name` → `@id` → positional fallback; the stored value is the option's `@id`
// (emitted as a flattened contextual entity + `{"@id"}` ref). Options without an
// `@id` cannot be referenced, so they are dropped; an empty result renders a
// muted note instead of the Select.
const objectSelectOptions = computed(() =>
  (props.control.valueOptions ?? [])
    .map((option, index) => {
      if (!isRecord(option)) return undefined
      const id = typeof option['@id'] === 'string' ? option['@id'].trim() : ''
      if (!id) return undefined
      const name = typeof option.name === 'string' && option.name.trim() ? option.name.trim() : id
      return { value: id, label: name || `Option ${index + 1}` }
    })
    .filter((option): option is { value: string; label: string } => Boolean(option)),
)

// Multi-valued select / select-object: the chosen values as a string array. A
// comma-joined string (a schema default that predates the array shape) is split
// once, mirroring normalizeValue's array handling; the checkbox list then edits
// a real array.
const selectedValues = computed<string[]>(() => {
  const value = props.modelValue
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((entry) => entry.trim()).filter(Boolean)
  }
  return []
})

const multiSelectOptions = computed(() =>
  props.control.control === 'select-object' ? objectSelectOptions.value : selectOptions.value,
)

function toggleOption(option: string, checked: boolean) {
  const current = selectedValues.value
  update(checked ? [...current, option] : current.filter((entry) => entry !== option))
}

// Target-aware placeholder for an entity-reference URI input: an ORCID example
// for a Person target, a ROR for an Organization, a DOI for a CreativeWork, else
// a generic absolute URI. Replaces the old hard-coded ORCID for every type.
const entityPlaceholder = computed(() => {
  const names = (props.control.entityTypes ?? []).map(entityTypeLabel)
  if (names.includes('Person')) return 'Reference URI, e.g. https://orcid.org/0000-0002-1825-0097'
  if (names.includes('Organization')) return 'Reference URI, e.g. https://ror.org/03yrm5c26'
  if (names.includes('CreativeWork') || names.includes('ScholarlyArticle')) return 'Reference URI, e.g. https://doi.org/10.1234/example'
  return 'Reference URI, e.g. https://…'
})

const crateEntityOptions = computed(() => props.crateOptions ?? [])

// An external-URI multiple entity control edits a real string array of
// reference URIs; each row emits the whole array back (the parent stores it
// verbatim), mirroring the nested repeatable list. Per-row URI
// errors are shown inline; the dialog derives the matching submit-gating violations
// via the same uri.ts predicate so display and gating agree.
const referenceList = computed<string[]>(() => (Array.isArray(props.modelValue) ? props.modelValue.map(String) : []))
function addReference() {
  update([...referenceList.value, ''])
}
function updateReference(index: number, value: string) {
  const list = [...referenceList.value]
  list[index] = value
  update(list)
}
function removeReference(index: number) {
  const list = [...referenceList.value]
  list.splice(index, 1)
  update(list)
}
function referenceError(value: string): boolean {
  return isInvalidReferenceUri(value)
}

// A valid-shape placeholder from the control's first schema example ("e.g. …").
const examplePlaceholder = computed<string | undefined>(() => {
  const example = props.control.schema.examples?.[0]
  if (example === undefined || example === null || example === '') return undefined
  return `e.g. ${String(example)}`
})

const inputPlaceholder = computed<string | undefined>(() => {
  if (props.control.control === 'entity') return entityPlaceholder.value
  return examplePlaceholder.value ?? (props.control.control === 'tags' ? 'Comma-separated values' : undefined)
})

const inputType = computed(() => {
  const control = props.control.control
  if (control === 'integer' || control === 'number') return 'number'
  if (control === 'datetime-local') return 'datetime-local'
  if (control === 'tags' || control === 'entity') return 'text'
  return control
})

// True multi-value rendering for scalar kinds: repeatable rows editing a real
// string array. Selects/tags/entity handle `multiple` themselves; everything
// else multi-valued lands here instead of a single native input.
const SCALAR_MULTI_CONTROLS = new Set(['text', 'textarea', 'url', 'email', 'date', 'datetime-local', 'number', 'integer'])
const isScalarMulti = computed(() => props.control.multiple && SCALAR_MULTI_CONTROLS.has(props.control.control))
const scalarRows = computed<string[]>(() => {
  const value = props.modelValue
  if (Array.isArray(value)) return value.map(String)
  // Legacy comma-joined defaults predate the array shape; split once.
  if (typeof value === 'string' && value.trim()) return value.split(',').map((entry) => entry.trim()).filter(Boolean)
  return []
})
function addScalarRow() {
  update([...scalarRows.value, ''])
}
function updateScalarRow(index: number, value: string) {
  const rows = [...scalarRows.value]
  rows[index] = value
  update(rows)
}
function removeScalarRow(index: number) {
  const rows = [...scalarRows.value]
  rows.splice(index, 1)
  update(rows)
}

// Authored constraints as native input attributes (pattern/minlength/maxlength/
// min/max/step) so the browser enforces what validate.ts checks. For a
// multi-valued control the scalar constraints live on the array's items schema.
const constraintAttrs = computed<Record<string, string | number>>(() => {
  const schema = props.control.schema
  const target = schema.type === 'array' ? (schema.items ?? {}) : schema
  const attrs: Record<string, string | number> = {}
  if (target.pattern) attrs.pattern = target.pattern
  if (target.minLength !== undefined) attrs.minlength = target.minLength
  if (target.maxLength !== undefined) attrs.maxlength = target.maxLength
  if (target.minimum !== undefined) attrs.min = target.minimum
  if (target.maximum !== undefined) attrs.max = target.maximum
  if (target.multipleOf !== undefined) attrs.step = target.multipleOf
  return attrs
})

// One hint line naming every authored constraint, so limits are visible before
// a violation fires. Controls whose input carries no placeholder (selects,
// checkboxes, crate picks) also get the example here.
const constraintHint = computed<string | undefined>(() => {
  const schema = props.control.schema
  const target = schema.type === 'array' ? (schema.items ?? {}) : schema
  const parts: string[] = []
  if (target.minLength !== undefined && target.maxLength !== undefined) parts.push(`${target.minLength}–${target.maxLength} characters`)
  else if (target.minLength !== undefined) parts.push(`at least ${target.minLength} characters`)
  else if (target.maxLength !== undefined) parts.push(`at most ${target.maxLength} characters`)
  if (target.minimum !== undefined) parts.push(`minimum ${target.minimum}`)
  if (target.maximum !== undefined) parts.push(`maximum ${target.maximum}`)
  if (target.multipleOf !== undefined) parts.push(`in steps of ${target.multipleOf}`)
  if (target.pattern) parts.push(`must match ${target.pattern}`)
  const minItems = schema.minItems ?? props.control.minItems
  const maxItems = schema.maxItems ?? props.control.maxItems
  if (minItems !== undefined && maxItems !== undefined) parts.push(`${minItems}–${maxItems} entries`)
  else if (minItems !== undefined) parts.push(`at least ${minItems} ${minItems === 1 ? 'entry' : 'entries'}`)
  else if (maxItems !== undefined) parts.push(`at most ${maxItems} ${maxItems === 1 ? 'entry' : 'entries'}`)
  const placeholderCapable = !['select', 'select-object', 'checkbox'].includes(props.control.control)
  const example = props.control.schema.examples?.[0]
  if (!placeholderCapable && example !== undefined && example !== null && example !== '') {
    parts.push(`example: ${String(example)}`)
  }
  return parts.length ? `${parts.join(' · ')}.` : undefined
})

const showDescription = computed(() => Boolean(props.control.description) && props.control.control !== 'checkbox')

// Strongest violation severity, mirrored onto the input's border/ring so the
// box itself is flagged, not just the text below it.
const invalidState = computed<'error' | 'warning' | undefined>(() => {
  if (props.disabled) return undefined
  const violations = props.violations ?? []
  if (violations.some((violation) => violation.severity === 'error')) return 'error'
  if (violations.length) return 'warning'
  return undefined
})

// Checkbox lists and switch rows draw their own bordered box; tint it the same way.
const invalidBoxClass = computed(() => {
  if (invalidState.value === 'error') return 'border-destructive'
  if (invalidState.value === 'warning') return 'border-amber-500/70'
  return undefined
})

function update(value: unknown) {
  if (props.disabled) return
  emit('update:modelValue', value)
}
</script>

<template>
  <div>
    <label class="text-xs font-medium text-foreground">
      {{ control.label }} <span v-if="control.required" class="text-destructive">*</span>
    </label>
    <!-- Multi-valued scalar kinds: repeatable rows over a real string array. -->
    <template v-if="isScalarMulti">
      <div v-for="(row, index) in scalarRows" :key="index" class="mt-1 flex items-start gap-2">
        <Textarea
          v-if="control.control === 'textarea'"
          :model-value="row"
          class="flex-1"
          rows="2"
          :disabled="disabled"
          :invalid="invalidState"
          :placeholder="examplePlaceholder"
          @update:model-value="(value: string) => updateScalarRow(index, value)"
        />
        <Input
          v-else
          :model-value="row"
          :type="inputType"
          class="flex-1"
          :disabled="disabled"
          :invalid="invalidState"
          :placeholder="examplePlaceholder"
          v-bind="constraintAttrs"
          @update:model-value="(value: string | number) => updateScalarRow(index, String(value))"
        />
        <Button variant="ghost" size="icon" :aria-label="`Remove ${control.label} value`" :disabled="disabled" @click="removeScalarRow(index)">
          <X />
        </Button>
      </div>
      <p v-if="!scalarRows.length" class="mt-1 text-[11px] text-muted-foreground">No values yet.</p>
      <Button variant="outline" size="sm" class="mt-1" :disabled="disabled" @click="addScalarRow">
        <Plus class="size-3.5" /> Add value
      </Button>
    </template>
    <Textarea
      v-else-if="control.control === 'textarea'"
      :model-value="displayValue"
      class="mt-1"
      rows="3"
      :disabled="disabled"
      :invalid="invalidState"
      :placeholder="examplePlaceholder"
      v-bind="constraintAttrs"
      @update:model-value="(value: string) => update(value)"
    />
    <!-- A `multiple` select / select-object is a checkbox list over the same
         options; the model value is the array of chosen values / option @ids. -->
    <template v-else-if="(control.control === 'select' || control.control === 'select-object') && control.multiple">
      <div v-if="multiSelectOptions.length" class="mt-1 space-y-1 rounded-md border border-border bg-card px-3 py-2" :class="invalidBoxClass">
        <label v-for="option in multiSelectOptions" :key="option.value" class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            class="h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
            :checked="selectedValues.includes(option.value)"
            :disabled="disabled"
            @change="toggleOption(option.value, ($event.target as HTMLInputElement).checked)"
          />
          <span class="truncate">{{ option.label }}</span>
        </label>
      </div>
      <p v-else class="mt-1 text-[11px] text-muted-foreground">No usable options.</p>
    </template>
    <Select
      v-else-if="control.control === 'select'"
      :model-value="displayValue"
      :options="selectOptions"
      class="mt-1"
      :disabled="disabled"
      :invalid="invalidState"
      placeholder="Choose an option"
      @update:model-value="(value: string) => update(value)"
    />
    <template v-else-if="control.control === 'select-object'">
      <Select
        v-if="objectSelectOptions.length"
        :model-value="displayValue"
        :options="objectSelectOptions"
        class="mt-1"
        :disabled="disabled"
        :invalid="invalidState"
        placeholder="Choose an option"
        @update:model-value="(value: string) => update(value)"
      />
      <p v-else class="mt-1 text-[11px] text-muted-foreground">No usable options.</p>
    </template>
    <label v-else-if="control.control === 'checkbox'" class="mt-1 flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm" :class="invalidBoxClass">
      <span>{{ control.description || 'Enabled' }}</span>
      <Switch :checked="Boolean(modelValue)" :disabled="disabled" @update:checked="(value: boolean) => update(value)" />
    </label>
    <!-- Entity references. Controls that allow describing a new entity render a
         sub-form and never reach this renderer; here a
         reference is a crate pick or an absolute URI (external, or a depth-1
         nested reference whose policy allows `new`). URI-format errors show
         inline; the dialog computes the matching gating violations from the same
         predicate. -->
    <template v-else-if="control.control === 'entity'">
      <!-- crate: choose from the crate's data references. -->
      <template v-if="entityInput === 'existing-crate' && crateEntityOptions.length">
        <div v-if="control.multiple" class="mt-1 space-y-1 rounded-md border border-border bg-card px-3 py-2" :class="invalidBoxClass">
          <label v-for="option in crateEntityOptions" :key="option.value" class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              class="h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
              :checked="selectedValues.includes(option.value)"
              :disabled="disabled"
              @change="toggleOption(option.value, ($event.target as HTMLInputElement).checked)"
            />
            <span class="truncate">{{ option.label }}</span>
          </label>
        </div>
        <Select
          v-else
          :model-value="displayValue"
          :options="crateEntityOptions"
          class="mt-1"
          :disabled="disabled"
          :invalid="invalidState"
          placeholder="Choose a data reference"
          @update:model-value="(value: string) => update(value)"
        />
      </template>
      <p v-else-if="entityInput === 'existing-crate'" class="mt-1 text-[11px] text-muted-foreground">Add a data reference below, then pick it here.</p>
      <!-- external (multiple): a repeatable list of reference URIs. -->
      <div v-else-if="control.multiple">
        <div class="flex justify-end">
          <Button variant="outline" size="sm" :disabled="disabled" @click="addReference">
            <Plus class="size-3.5" /> Add reference
          </Button>
        </div>
        <div v-for="(reference, index) in referenceList" :key="index" class="mt-1">
          <div class="flex items-center gap-2">
            <Input
              :model-value="reference"
              :placeholder="entityPlaceholder"
              class="flex-1"
              :disabled="disabled"
              :invalid="referenceError(reference) ? 'error' : undefined"
              @update:model-value="(value: string | number) => updateReference(index, String(value))"
            />
            <Button variant="ghost" size="icon" :aria-label="`Remove ${control.label} reference`" :disabled="disabled" @click="removeReference(index)">
              <X />
            </Button>
          </div>
          <p v-if="referenceError(reference)" class="mt-1 text-[11px] text-destructive">{{ REFERENCE_URI_MESSAGE }}</p>
        </div>
      </div>
      <!-- external / depth-1 nested reference (single): one absolute URI. -->
      <Input
        v-else
        :model-value="displayValue"
        type="text"
        class="mt-1"
        :disabled="disabled"
        :invalid="invalidState"
        :placeholder="entityPlaceholder"
        @update:model-value="(value: string | number) => update(value)"
      />
    </template>
    <Input
      v-else
      :model-value="displayValue"
      :type="inputType"
      class="mt-1"
      :disabled="disabled"
      :invalid="invalidState"
      :placeholder="inputPlaceholder"
      v-bind="constraintAttrs"
      @update:model-value="(value: string | number) => update(value)"
    />
    <p v-if="showDescription" class="mt-1 text-[11px] text-muted-foreground">{{ control.description }}</p>
    <p v-if="constraintHint" class="mt-1 text-[11px] text-muted-foreground">{{ constraintHint }}</p>
    <template v-for="violation in violations ?? []" :key="violation.ruleId + violation.pointer">
      <p class="mt-1 text-[11px]" :class="violation.severity === 'error' ? 'text-destructive' : 'text-amber-800 dark:text-amber-300'">
        {{ violation.message }}
      </p>
      <p v-if="violation.hint" class="text-[11px] text-muted-foreground">{{ violation.hint }}</p>
    </template>
  </div>
</template>
