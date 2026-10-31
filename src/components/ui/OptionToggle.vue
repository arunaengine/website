<script setup lang="ts">
// The portal's segmented control for a small set of choices: a muted track holding one button
// per option, the picked one on the card background. The option labels name what each shows,
// so the control needs no caption of its own.
import type { Component } from 'vue'
import Button from '@/components/ui/Button.vue'
import { cn } from '@/lib/utils'

export interface ToggleOption {
  value: string
  label: string
  icon?: Component
  /** A quiet count after the label, such as the files in a dataset. */
  count?: number
}

const props = withDefaults(
  defineProps<{ modelValue: string; options: ToggleOption[]; ariaLabel?: string; class?: string }>(),
  { ariaLabel: undefined, class: undefined },
)
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

function select(value: string) {
  if (value !== props.modelValue) emit('update:modelValue', value)
}
</script>

<template>
  <div
    :class="cn('inline-flex gap-0.5 rounded-lg border border-border-subtle bg-muted p-0.5', props.class)"
    role="group"
    :aria-label="ariaLabel"
  >
    <Button
      v-for="option in options"
      :key="option.value"
      type="button"
      size="sm"
      variant="ghost"
      :class="cn('h-[26px]', modelValue === option.value
        ? 'bg-card text-foreground shadow-sm hover:bg-card hover:text-foreground dark:shadow-none'
        : 'text-muted-foreground hover:bg-transparent hover:text-foreground')"
      :aria-pressed="modelValue === option.value"
      @click="select(option.value)"
    >
      <component :is="option.icon" v-if="option.icon" class="h-3.5 w-3.5" />
      {{ option.label }}
      <span v-if="option.count" class="tabular-nums text-muted-foreground">{{ option.count.toLocaleString('en-US') }}</span>
    </Button>
  </div>
</template>
