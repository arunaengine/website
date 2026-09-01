<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import type { DashboardScope } from '@/composables/useDashboardScope'

const props = defineProps<{ modelValue: DashboardScope }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: DashboardScope): void }>()

function select(value: DashboardScope) {
  if (value !== props.modelValue) emit('update:modelValue', value)
}
</script>

<template>
  <div class="flex items-center gap-2">
    <span class="hidden text-[11px] text-muted-foreground sm:inline">Lead with</span>
    <div class="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Lead with">
      <Button
        size="sm"
        :variant="modelValue === 'personal' ? 'secondary' : 'ghost'"
        :aria-pressed="modelValue === 'personal'"
        @click="select('personal')"
      >My statistics</Button>
      <Button
        size="sm"
        :variant="modelValue === 'realm' ? 'secondary' : 'ghost'"
        :aria-pressed="modelValue === 'realm'"
        @click="select('realm')"
      >Realm statistics</Button>
    </div>
  </div>
</template>
