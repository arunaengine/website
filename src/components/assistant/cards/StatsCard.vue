<script setup lang="ts">
import StatCard from '@/components/ui/StatCard.vue'
import { Gauge } from '@lucide/vue'

defineProps<{ title: string; items: Array<{ label: string; value: string; hint?: string }> }>()
</script>

<template>
  <div class="text-xs">
    <div class="mb-2 flex items-center gap-2">
      <Gauge class="h-3.5 w-3.5 shrink-0 text-primary" />
      <span class="min-w-0 flex-1 truncate font-medium text-foreground">{{ title }}</span>
    </div>
    <div class="grid gap-2" :class="items.length > 2 ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-2'">
      <StatCard v-for="item in items" :key="item.label" :label="item.label" :value="item.value" :hint="item.hint" class="p-3" />
    </div>
  </div>
</template>
