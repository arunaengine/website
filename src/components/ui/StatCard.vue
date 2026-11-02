<script setup lang="ts">
import { cn } from '@/lib/utils'

defineProps<{
  label: string
  value: string | number
  hint?: string
  icon?: unknown
  class?: string
  accent?: boolean
}>()
</script>

<template>
  <div
    :class="
      cn(
        'surface flex flex-col gap-1.5 p-4',
        accent && 'ring-1 ring-primary/20',
        $props.class,
      )
    "
  >
    <div class="flex items-center justify-between">
      <span class="type-label">{{ label }}</span>
      <component :is="icon" v-if="icon" class="h-4 w-4 text-muted-foreground/80" />
    </div>
    <div class="type-number">
      {{ value }}
    </div>
    <div v-if="hint" class="text-xs text-muted-foreground">{{ hint }}</div>
    <slot />
  </div>
</template>
