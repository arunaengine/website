<script setup lang="ts">
import {
  DropdownMenuPortal,
  DropdownMenuSubContent,
  type DropdownMenuSubContentProps,
  useForwardProps,
} from 'radix-vue'
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<DropdownMenuSubContentProps & { class?: string }>()
const forwarded = useForwardProps(props)
const classes = computed(() =>
  cn(
    'z-50 min-w-[9rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg',
    props.class,
  ),
)
</script>

<template>
  <DropdownMenuPortal>
    <DropdownMenuSubContent v-bind="forwarded" :class="classes"><slot /></DropdownMenuSubContent>
  </DropdownMenuPortal>
</template>
