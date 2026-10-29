<script setup lang="ts">
// Switches a list between cards and a table; the caller keeps the choice with useViewMode.
import { LayoutGrid, List } from '@lucide/vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import type { ViewMode } from '@/composables/useViewMode'

defineProps<{ modelValue: ViewMode }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: ViewMode): void }>()

const OPTIONS = [
  { value: 'cards', label: 'Cards', icon: LayoutGrid },
  { value: 'table', label: 'Table', icon: List },
]
</script>

<template>
  <OptionToggle
    :model-value="modelValue"
    :options="OPTIONS"
    aria-label="Show as"
    @update:model-value="(value: string) => emit('update:modelValue', value as ViewMode)"
  />
</template>
