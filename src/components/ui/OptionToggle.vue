<script setup lang="ts">
// The portal's switch for a small set of choices: a bordered box holding one
// small button per option, the picked one filled. The option labels name what
// each shows, so the control needs no caption of its own.
import Button from '@/components/ui/Button.vue'
import { cn } from '@/lib/utils'

export interface ToggleOption {
  value: string
  label: string
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
    :class="cn('inline-flex rounded-md border border-border p-0.5', props.class)"
    role="group"
    :aria-label="ariaLabel"
  >
    <Button
      v-for="option in options"
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
