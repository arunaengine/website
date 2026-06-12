<script setup lang="ts">
import { DropdownMenuItem, type DropdownMenuItemProps, useForwardProps } from 'radix-vue'
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<DropdownMenuItemProps & { class?: string; inset?: boolean }>()
const forwarded = useForwardProps(props)
const classes = computed(() =>
  cn(
    'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-muted focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
    props.inset && 'pl-8',
    props.class,
  ),
)
</script>

<template>
  <DropdownMenuItem v-bind="forwarded" :class="classes"><slot /></DropdownMenuItem>
</template>
