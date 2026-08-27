<script setup lang="ts">
// A group picker with nothing to pick is a dead control, so an empty option list
// renders a line pointing at group creation instead. A host with its own create
// affordance supplies it through the `action` slot.
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import { cn } from '@/lib/utils'

interface Option {
  value: string
  label: string
}

const props = defineProps<{
  modelValue?: string
  options: Option[]
  placeholder?: string
  class?: string
  disabled?: boolean
  invalid?: 'error' | 'warning'
  ariaLabel?: string
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  // Lets a dialog host close itself before the link leaves for Groups.
  (e: 'navigate'): void
}>()
</script>

<template>
  <Select
    v-if="options.length"
    :model-value="props.modelValue"
    :options="options"
    :placeholder="placeholder"
    :class="props.class"
    :disabled="disabled"
    :invalid="invalid"
    :aria-label="ariaLabel"
    @update:model-value="(v: string) => emit('update:modelValue', v)"
  />
  <div
    v-else
    :class="
      cn(
        'flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-dashed border-input px-3 py-1.5 text-xs text-muted-foreground',
        props.class,
      )
    "
  >
    <span>No groups yet.</span>
    <slot name="action">
      <Button variant="link" size="sm" class="h-auto p-0 text-xs" as-child>
        <RouterLink :to="{ name: 'groups' }" @click="emit('navigate')">Create one under Groups</RouterLink>
      </Button>
    </slot>
  </div>
</template>
