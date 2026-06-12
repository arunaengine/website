<script setup lang="ts">
import { TabsContent, type TabsContentProps, useForwardProps } from 'radix-vue'
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<TabsContentProps & { class?: string }>()
const forwarded = useForwardProps(props)
const classes = computed(() =>
  cn(
    'mt-3 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    props.class,
  ),
)
</script>

<template>
  <TabsContent v-bind="forwarded" :class="classes"><slot /></TabsContent>
</template>
