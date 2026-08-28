<script setup lang="ts">
// What goes into the container and what comes back out, as one pair of panels.
// Each row reads "source ⤷ container path"; the outputs body can be replaced
// through the slot when a caller resolves real files instead of declarations.
import Badge from '@/components/ui/Badge.vue'
import { ArrowDownToLine, ArrowUpFromLine, CornerDownRight } from '@lucide/vue'

interface IoRow {
  label: string
  title?: string
  note?: string
  badge?: string
  path: string
}

withDefaults(
  defineProps<{
    inputs: IoRow[]
    outputs?: IoRow[]
    inputsEmpty?: string
    outputsEmpty?: string
    footnote?: string
  }>(),
  {
    outputs: () => [],
    inputsEmpty: 'No input data.',
    outputsEmpty: 'No declared output files.',
    footnote: '',
  },
)
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-2">
    <section class="surface-muted space-y-2 p-4">
      <div class="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <ArrowDownToLine class="h-3.5 w-3.5 text-primary" /> Into the container
      </div>
      <ul v-if="inputs.length" class="space-y-1.5 font-mono text-[11px]">
        <li v-for="(row, i) in inputs" :key="i">
          <div class="truncate text-foreground" :title="row.title || row.label">
            {{ row.label }}
            <span v-if="row.note" class="font-sans text-muted-foreground">({{ row.note }})</span>
            <Badge v-if="row.badge" variant="outline" size="sm" class="ml-1 font-sans">{{ row.badge }}</Badge>
          </div>
          <div class="flex items-center gap-1 text-muted-foreground">
            <CornerDownRight class="h-3 w-3 shrink-0" /> {{ row.path }}
          </div>
        </li>
      </ul>
      <p v-else class="text-[11px] text-muted-foreground">{{ inputsEmpty }}</p>
    </section>

    <section class="surface-muted space-y-2 p-4">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <ArrowUpFromLine class="h-3.5 w-3.5 text-primary" /> Out of the container
        </div>
        <slot name="outputs-action" />
      </div>
      <slot name="outputs">
        <ul v-if="outputs.length" class="space-y-1.5 font-mono text-[11px]">
          <li v-for="(row, i) in outputs" :key="i">
            <div class="text-foreground">{{ row.label }}</div>
            <div class="flex min-w-0 items-center gap-1 text-muted-foreground">
              <CornerDownRight class="h-3 w-3 shrink-0" />
              <span class="truncate" :title="row.title || row.path">{{ row.path }}</span>
            </div>
          </li>
        </ul>
        <p v-else class="text-[11px] text-muted-foreground">{{ outputsEmpty }}</p>
      </slot>
      <p v-if="footnote" class="text-[11px] text-muted-foreground">{{ footnote }}</p>
    </section>
  </div>
</template>
