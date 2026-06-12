<script setup lang="ts">
import { DropdownMenuRoot, type DropdownMenuRootProps, useForwardPropsEmits } from 'radix-vue'

const props = defineProps<DropdownMenuRootProps>()
const emits = defineEmits<{ (e: 'update:open', v: boolean): void }>()
const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <DropdownMenuRoot v-bind="forwarded"><slot /></DropdownMenuRoot>
</template>
