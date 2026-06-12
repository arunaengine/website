<script setup lang="ts">
import { TabsRoot, type TabsRootProps, useForwardPropsEmits } from 'radix-vue'

const props = defineProps<TabsRootProps & { class?: string }>()
const emits = defineEmits<{ (e: 'update:modelValue', value: string): void }>()
const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <TabsRoot v-bind="forwarded" :class="props.class">
    <slot />
  </TabsRoot>
</template>
