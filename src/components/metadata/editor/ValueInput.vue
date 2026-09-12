<script setup lang="ts">
import { computed, ref } from 'vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Select from '@/components/ui/Select.vue'
import type { DraftValue } from '@/lib/crate/editor'

const props = defineProps<{
  modelValue: DraftValue
  label: string
  /** Well-known values offered as a shortcut beside the free input. */
  presets?: ReadonlyArray<{ value: string; label: string }>
  /** The row's issue state, drawn on the control's border. */
  invalid?: 'error' | 'warning'
}>()
const emit = defineEmits<{ (e: 'update:modelValue', value: DraftValue): void }>()

const LONG_TEXT = 100
const OTHER = 'other'
const BOOLEAN_OPTIONS = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
]

const freeText = ref(false)

// Text grows into a textarea once it stops fitting on one line.
const multiline = computed(() =>
  props.modelValue.kind === 'longtext'
  || (props.modelValue.kind === 'text' && props.modelValue.value.length > LONG_TEXT))

// An empty reference row offers the presets too: picking one links the URL.
const presetting = computed(() =>
  Boolean(props.presets?.length)
  && (props.modelValue.kind === 'text' || props.modelValue.kind === 'url' || props.modelValue.kind === 'reference'))

// The same license is written in more than one way; a preset matches its
// value whatever the scheme, case, trailing slash or .html page.
function presetKey(value: string): string {
  return value.trim().toLowerCase().replace(/^http:/, 'https:').replace(/\.html$/, '').replace(/\/+$/, '')
}

const presetOptions = computed(() => [
  ...(props.presets ?? []).map((preset) => ({ value: preset.value, label: preset.label })),
  { value: OTHER, label: 'Other URL' },
])

const presetChoice = computed(() => {
  const key = presetKey(props.modelValue.value)
  const match = key ? props.presets?.find((preset) => presetKey(preset.value) === key) : undefined
  if (match) return match.value
  return props.modelValue.value || freeText.value ? OTHER : ''
})

const inputType = computed(() => {
  if (props.modelValue.kind === 'number') return 'number'
  if (props.modelValue.kind === 'date') return 'date'
  if (props.modelValue.kind === 'datetime') return 'datetime-local'
  return 'text'
})

function update(value: string | number) {
  emit('update:modelValue', { ...props.modelValue, value: String(value) })
}

function pickPreset(choice: string) {
  freeText.value = choice === OTHER
  if (choice !== OTHER) update(choice)
}
</script>

<template>
  <div v-if="presetting" class="space-y-2">
    <Select
      :model-value="presetChoice"
      :options="presetOptions"
      :placeholder="`Choose ${label.toLowerCase()}`"
      :aria-label="`${label} preset`"
      :invalid="invalid"
      @update:model-value="pickPreset"
    />
    <Input
      v-if="presetChoice === OTHER"
      :model-value="modelValue.value"
      :aria-label="label"
      placeholder="https://example.org/license"
      :invalid="invalid"
      @update:model-value="update"
    />
  </div>
  <Select
    v-else-if="modelValue.kind === 'boolean'"
    :model-value="modelValue.value === 'true' ? 'true' : 'false'"
    :options="BOOLEAN_OPTIONS"
    :aria-label="label"
    :invalid="invalid"
    @update:model-value="update"
  />
  <Textarea
    v-else-if="multiline"
    :model-value="modelValue.value"
    rows="3"
    :aria-label="label"
    :invalid="invalid"
    @update:model-value="update"
  />
  <Input
    v-else
    :model-value="modelValue.value"
    :type="inputType"
    :aria-label="label"
    :placeholder="modelValue.kind === 'url' ? 'https://example.org' : undefined"
    :invalid="invalid"
    @update:model-value="update"
  />
</template>
