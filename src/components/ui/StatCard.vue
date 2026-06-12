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
        'surface flex flex-col gap-1.5 p-4 transition-colors hover:border-primary/40',
        accent && 'ring-1 ring-primary/20',
        $props.class,
      )
    "
  >
    <div class="flex items-center justify-between">
      <span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">{{ label }}</span>
      <component :is="icon" v-if="icon" class="h-4 w-4 text-muted-foreground/80" />
    </div>
    <div class="font-display text-2xl font-semibold text-aruna-navy">
      {{ value }}
    </div>
    <div v-if="hint" class="text-xs text-muted-foreground">{{ hint }}</div>
  </div>
</template>
