<script setup lang="ts">
import { TabsTrigger, type TabsTriggerProps, useForwardProps } from 'radix-vue'
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<TabsTriggerProps & { class?: string }>()
const forwarded = useForwardProps(props)
const classes = computed(() =>
  cn(
    'inline-flex h-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium ring-offset-background transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm dark:data-[state=active]:shadow-none disabled:pointer-events-none disabled:opacity-50',
    props.class,
  ),
)
</script>

<template>
  <TabsTrigger v-bind="forwarded" :class="classes"><slot /></TabsTrigger>
</template>
