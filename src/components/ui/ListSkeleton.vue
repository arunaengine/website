<script setup lang="ts">
// The placeholder for a list that has not answered yet, shaped like the rows
// or cards it stands in for. `bare` drops the surface for hosts that draw
// their own, such as the list shell.
import Skeleton from '@/components/ui/Skeleton.vue'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    rows?: number
    layout?: 'rows' | 'cards'
    /** A toolbar band above the rows, or a section title above the cards. */
    header?: boolean
    bare?: boolean
    label?: string
    class?: string
  }>(),
  { rows: 5, layout: 'rows', header: false, bare: false, label: 'Loading', class: undefined },
)

// Widths vary a little so the placeholder reads as rows, not as a grid.
const WIDTHS = ['w-1/3', 'w-2/5', 'w-1/4', 'w-1/2', 'w-1/3']
</script>

<template>
  <div v-if="layout === 'cards'" :class="cn('space-y-3', props.class)" aria-busy="true">
    <span class="sr-only">{{ label }}</span>
    <div v-if="header" class="flex items-center gap-2">
      <Skeleton class="h-4 w-4 rounded-sm" />
      <Skeleton class="h-4 w-28" />
    </div>
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="card in rows" :key="card" class="surface flex h-36 flex-col gap-3 p-4" data-skeleton-row>
        <Skeleton class="h-4 w-2/3" />
        <Skeleton class="h-3 w-full" />
        <Skeleton class="h-3 w-4/5" />
        <div class="mt-auto flex items-center justify-between">
          <Skeleton class="h-3 w-1/3" />
          <Skeleton class="h-5 w-16 rounded-full" />
        </div>
      </div>
    </div>
  </div>

  <div v-else :class="cn(bare ? '' : 'surface overflow-hidden', props.class)" aria-busy="true">
    <span class="sr-only">{{ label }}</span>
    <div v-if="header" class="flex items-center gap-2 border-b border-border bg-muted/20 px-3 py-2">
      <Skeleton class="h-4 w-4 rounded-sm" />
      <Skeleton class="h-4 w-28" />
      <Skeleton class="ml-auto h-7 w-7" />
    </div>
    <div class="divide-y divide-border">
      <div v-for="row in rows" :key="row" class="flex items-center gap-3 px-5 py-3" data-skeleton-row>
        <Skeleton class="h-2 w-2 shrink-0 rounded-full" />
        <div class="min-w-0 flex-1 space-y-1.5">
          <Skeleton :class="['h-3.5', WIDTHS[(row - 1) % WIDTHS.length]]" />
          <Skeleton class="h-3 w-1/2" />
        </div>
        <Skeleton class="h-5 w-16 shrink-0 rounded-full" />
      </div>
    </div>
  </div>
</template>
