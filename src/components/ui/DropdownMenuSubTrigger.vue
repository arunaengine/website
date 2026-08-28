<script setup lang="ts">
import { DropdownMenuSubTrigger, type DropdownMenuSubTriggerProps, useForwardProps } from 'radix-vue'
import { computed } from 'vue'
import { ChevronRight } from '@lucide/vue'
import { cn } from '@/lib/utils'

const props = defineProps<DropdownMenuSubTriggerProps & { class?: string }>()
const forwarded = useForwardProps(props)
const classes = computed(() =>
  cn(
    'flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[state=open]:bg-muted focus:bg-muted',
    props.class,
  ),
)
</script>

<template>
  <DropdownMenuSubTrigger v-bind="forwarded" :class="classes">
    <span class="flex-1"><slot /></span>
    <ChevronRight class="h-3.5 w-3.5 opacity-60" />
  </DropdownMenuSubTrigger>
</template>
