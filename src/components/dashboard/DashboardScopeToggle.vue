<script setup lang="ts">
// Switches the dashboard between the caller's own statistics and the realm's.
// The segment labels name what each shows, so the control carries no caption.
import Button from '@/components/ui/Button.vue'
import type { DashboardScope } from '@/composables/useDashboardScope'

const props = defineProps<{ modelValue: DashboardScope }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: DashboardScope): void }>()

const OPTIONS: { value: DashboardScope; label: string }[] = [
  { value: 'personal', label: 'My statistics' },
  { value: 'realm', label: 'Realm statistics' },
]

function select(value: DashboardScope) {
  if (value !== props.modelValue) emit('update:modelValue', value)
}
</script>

<template>
  <div class="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Statistics to show">
    <Button
      v-for="option in OPTIONS"
      :key="option.value"
      size="sm"
      :variant="modelValue === option.value ? 'secondary' : 'ghost'"
      :aria-pressed="modelValue === option.value"
      @click="select(option.value)"
    >
      {{ option.label }}
    </Button>
  </div>
</template>
