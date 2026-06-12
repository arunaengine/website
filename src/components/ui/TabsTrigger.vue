<script setup lang="ts">
import { TabsTrigger, type TabsTriggerProps, useForwardProps } from 'radix-vue'
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<TabsTriggerProps & { class?: string }>()
const forwarded = useForwardProps(props)
const classes = computed(() =>
  cn(
    'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow disabled:pointer-events-none disabled:opacity-50',
    props.class,
  ),
)
</script>

<template>
  <TabsTrigger v-bind="forwarded" :class="classes"><slot /></TabsTrigger>
</template>
