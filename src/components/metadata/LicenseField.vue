<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const PRESETS = [
  { value: 'https://creativecommons.org/licenses/by/4.0/', label: 'CC BY 4.0' },
  { value: 'https://creativecommons.org/licenses/by-sa/4.0/', label: 'CC BY-SA 4.0' },
  { value: 'https://creativecommons.org/publicdomain/zero/1.0/', label: 'CC0 1.0' },
  { value: 'https://spdx.org/licenses/MIT', label: 'MIT' },
  { value: 'https://spdx.org/licenses/Apache-2.0', label: 'Apache 2.0' },
]
const PRESET_URLS = new Set(PRESETS.map((preset) => preset.value))
const options = [{ value: '', label: 'No license' }, ...PRESETS, { value: 'other', label: 'Other' }]

// A license outside the presets keeps the URL input open.
const custom = ref(false)
watch(() => props.modelValue, (value) => {
  if (value && !PRESET_URLS.has(value)) custom.value = true
}, { immediate: true })

const selected = computed(() => {
  if (custom.value) return 'other'
  return PRESET_URLS.has(props.modelValue) ? props.modelValue : ''
})

function choose(value: string) {
  custom.value = value === 'other'
  emit('update:modelValue', value === 'other' ? '' : value)
}
</script>

<template>
  <div>
    <label class="text-xs font-medium text-foreground">License</label>
    <Select :model-value="selected" :options="options" class="mt-1" aria-label="License" @update:model-value="choose" />
    <Input
      v-if="custom"
      :model-value="modelValue"
      type="url"
      class="mt-1.5"
      aria-label="License URL"
      placeholder="https://example.org/license"
      @update:model-value="(value: string | number) => emit('update:modelValue', String(value))"
    />
  </div>
</template>
