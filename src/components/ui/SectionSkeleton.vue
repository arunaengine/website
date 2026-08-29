<script setup lang="ts">
// The placeholder for one content section: its header band and a few lines
// of text, sized like the section it stands in for.
import Skeleton from '@/components/ui/Skeleton.vue'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    lines?: number
    /** The header band with an icon and a title. */
    header?: boolean
    /** A row of fact tiles under the lines, as the dataset hero shows. */
    tiles?: number
    label?: string
    class?: string
  }>(),
  { lines: 3, header: true, tiles: 0, label: 'Loading', class: undefined },
)

const WIDTHS = ['w-3/4', 'w-full', 'w-2/3', 'w-5/6', 'w-1/2']
</script>

<template>
  <section :class="cn('surface overflow-hidden', props.class)" aria-busy="true">
    <span class="sr-only">{{ label }}</span>
    <div v-if="header" class="flex items-center gap-2 border-b border-border px-5 py-3.5">
      <Skeleton class="h-4 w-4 rounded-sm" />
      <Skeleton class="h-4 w-32" />
    </div>
    <div class="space-y-2.5 px-5 py-4">
      <Skeleton v-for="line in lines" :key="line" :class="['h-3.5', WIDTHS[(line - 1) % WIDTHS.length]]" />
      <div v-if="tiles" class="grid gap-3 pt-3" :style="{ gridTemplateColumns: `repeat(${tiles}, minmax(0, 1fr))` }">
        <Skeleton v-for="tile in tiles" :key="tile" class="h-16" />
      </div>
    </div>
  </section>
</template>
