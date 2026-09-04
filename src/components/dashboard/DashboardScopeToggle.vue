<script setup lang="ts">
// Switches the dashboard between the caller's own statistics and the realm's.
import OptionToggle from '@/components/ui/OptionToggle.vue'
import type { DashboardScope } from '@/composables/useDashboardScope'

defineProps<{ modelValue: DashboardScope }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: DashboardScope): void }>()

const OPTIONS = [
  { value: 'personal', label: 'My statistics' },
  { value: 'realm', label: 'Realm statistics' },
]
</script>

<template>
  <OptionToggle
    :model-value="modelValue"
    :options="OPTIONS"
    aria-label="Statistics to show"
    @update:model-value="(value: string) => emit('update:modelValue', value as DashboardScope)"
  />
</template>
