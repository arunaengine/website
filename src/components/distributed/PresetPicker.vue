<script setup lang="ts">
// The seven starting points. A preset only fills the fields below; each can change.
import { PRESETS, type PresetId } from '@/lib/distributedMock'
import { cn } from '@/lib/utils'

defineProps<{ modelValue: PresetId }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: PresetId): void }>()
</script>

<template>
  <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="Preset">
    <button
      v-for="preset in PRESETS"
      :key="preset.id"
      type="button"
      role="radio"
      :aria-checked="modelValue === preset.id"
      :class="cn(
        'rounded-lg border p-3 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        modelValue === preset.id ? 'border-primary bg-primary/5' : 'border-border bg-card',
      )"
      @click="emit('update:modelValue', preset.id)"
    >
      <span class="block text-sm font-medium text-foreground">{{ preset.label }}</span>
      <span class="mt-1 block text-xs text-muted-foreground">{{ preset.description }}</span>
    </button>
  </div>
</template>
