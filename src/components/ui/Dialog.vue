<script setup lang="ts">
import { DialogRoot, type DialogRootProps, useForwardPropsEmits } from 'radix-vue'

const props = defineProps<DialogRootProps>()
const emits = defineEmits<{ (e: 'update:open', v: boolean): void }>()
const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <DialogRoot v-bind="forwarded"><slot /></DialogRoot>
</template>
