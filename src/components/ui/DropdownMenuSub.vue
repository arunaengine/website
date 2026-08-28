<script setup lang="ts">
import { DropdownMenuSub, type DropdownMenuSubProps, useForwardPropsEmits } from 'radix-vue'

const props = defineProps<DropdownMenuSubProps>()
const emits = defineEmits<{ (e: 'update:open', value: boolean): void }>()
const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <DropdownMenuSub v-bind="forwarded"><slot /></DropdownMenuSub>
</template>
