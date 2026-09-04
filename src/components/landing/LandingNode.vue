<script setup lang="ts">
// One Aruna node as the landing page draws it: a small card with a label, a
// status dot, a tag and one line of detail. The graphs place and animate it.
import Badge from '@/components/ui/Badge.vue'
import { cn } from '@/lib/utils'
import { Server } from '@lucide/vue'

const props = defineProps<{
  id: string
  label: string
  tag: string
  meta: string
  /** Shows the "Running job" and "Result stored" states the graph animates. */
  states?: boolean
  class?: string
}>()
</script>

<template>
  <div
    :data-node="props.id"
    :class="cn('landing-node rounded-xl border border-border/80 bg-card px-3.5 py-3 shadow-sm', props.class)"
  >
    <div class="flex min-h-[18px] items-center gap-2">
      <Server class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span class="min-w-0 whitespace-nowrap text-[13px] font-medium leading-tight text-foreground">{{ props.label }}</span>
      <span class="node-dot ml-auto h-2 w-2 shrink-0 rounded-full" aria-hidden="true" />
    </div>
    <div class="mt-2 flex items-center gap-2">
      <Badge size="sm" class="uppercase tracking-wide">{{ props.tag }}</Badge>
    </div>
    <div class="hash mt-1 text-[11px] text-muted-foreground">{{ props.meta }}</div>
    <div v-if="$slots.default || props.states" class="relative mt-2 flex min-h-[22px] items-center">
      <slot />
      <template v-if="props.states">
        <Badge variant="accent" size="sm" class="st-running absolute left-0 top-0">Running job</Badge>
        <Badge variant="success" size="sm" class="st-done absolute left-0 top-0">Result stored</Badge>
      </template>
    </div>
  </div>
</template>
