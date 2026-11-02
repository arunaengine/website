<script setup lang="ts">
// Numbers the assistant asked to show: one large value, or a row of labelled
// values, with the scope they were counted in.
import { computed } from 'vue'
import { Gauge } from '@lucide/vue'

const props = defineProps<{ title: string; scope?: string; items: Array<{ label: string; value: string; hint?: string }> }>()

const single = computed(() => (props.items.length === 1 ? props.items[0] : null))
// A lone value whose label only repeats the title needs no label of its own.
const singleLabel = computed(() =>
  single.value && single.value.label.trim().toLowerCase() !== props.title.trim().toLowerCase() ? single.value.label : '')
</script>

<template>
  <div class="surface-inline overflow-hidden text-xs">
    <div class="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5">
      <Gauge class="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span class="min-w-0 flex-1 truncate font-medium text-foreground">{{ title }}</span>
      <span v-if="scope" class="min-w-0 shrink truncate text-muted-foreground">{{ scope }}</span>
    </div>
    <div v-if="single" class="px-3 py-2.5">
      <p v-if="singleLabel" class="type-label">{{ singleLabel }}</p>
      <p class="font-display text-2xl font-semibold tabular-nums text-aruna-navy">{{ single.value }}</p>
      <p v-if="single.hint" class="mt-0.5 text-muted-foreground">{{ single.hint }}</p>
    </div>
    <div v-else class="grid divide-x divide-border/60" :class="items.length > 2 ? 'grid-cols-3' : 'grid-cols-2'">
      <div v-for="item in items" :key="item.label" class="min-w-0 px-3 py-2.5">
        <p class="type-label truncate">{{ item.label }}</p>
        <p class="font-display text-lg font-semibold tabular-nums text-aruna-navy">{{ item.value }}</p>
        <p v-if="item.hint" class="text-muted-foreground">{{ item.hint }}</p>
      </div>
    </div>
  </div>
</template>
