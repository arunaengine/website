<script setup lang="ts">
export interface FilterChipOption {
  value: string
  label: string
  count?: number
}

const props = defineProps<{ options: FilterChipOption[]; modelValue: string; ariaLabel?: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

function select(value: string) {
  if (value !== props.modelValue) emit('update:modelValue', value)
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-1" role="group" :aria-label="ariaLabel">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :aria-pressed="option.value === modelValue"
      :class="[
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
        option.value === modelValue
          ? 'border-primary/40 bg-primary/[0.12] text-foreground'
          : 'border-transparent text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground',
      ]"
      @click="select(option.value)"
    >
      {{ option.label }}
      <span v-if="option.count !== undefined" class="tabular-nums opacity-70">{{ option.count }}</span>
    </button>
  </div>
</template>
