<script setup lang="ts">
import { computed } from 'vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Select from '@/components/ui/Select.vue'
import type { DraftValue } from '@/lib/crate/editor'

const props = defineProps<{ modelValue: DraftValue; label: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: DraftValue): void }>()

const LONG_TEXT = 100
const BOOLEAN_OPTIONS = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
]

// Text grows into a textarea once it stops fitting on one line.
const multiline = computed(() =>
  props.modelValue.kind === 'longtext'
  || (props.modelValue.kind === 'text' && props.modelValue.value.length > LONG_TEXT))

const inputType = computed(() => {
  if (props.modelValue.kind === 'number') return 'number'
  if (props.modelValue.kind === 'date') return 'date'
  if (props.modelValue.kind === 'datetime') return 'datetime-local'
  return 'text'
})

function update(value: string | number) {
  emit('update:modelValue', { ...props.modelValue, value: String(value) })
}
</script>

<template>
  <Select
    v-if="modelValue.kind === 'boolean'"
    :model-value="modelValue.value === 'true' ? 'true' : 'false'"
    :options="BOOLEAN_OPTIONS"
    :aria-label="label"
    @update:model-value="update"
  />
  <Textarea
    v-else-if="multiline"
    :model-value="modelValue.value"
    rows="3"
    :aria-label="label"
    @update:model-value="update"
  />
  <Input
    v-else
    :model-value="modelValue.value"
    :type="inputType"
    :aria-label="label"
    :placeholder="modelValue.kind === 'url' ? 'https://example.org' : undefined"
    @update:model-value="update"
  />
</template>
