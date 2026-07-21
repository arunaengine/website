<script setup lang="ts">
import {
  SwitchRoot,
  SwitchThumb,
  type SwitchRootProps,
  useForwardPropsEmits,
} from 'radix-vue'
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<SwitchRootProps & { class?: string }>()
const emits = defineEmits<{ (e: 'update:checked', v: boolean): void }>()
const forwarded = useForwardPropsEmits(props, emits)
const classes = computed(() =>
  cn(
    'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-aruna-royal data-[state=unchecked]:bg-input',
    props.class,
  ),
)
</script>

<template>
  <SwitchRoot v-bind="forwarded" :class="classes">
    <SwitchThumb
      class="pointer-events-none block h-4 w-4 rounded-full bg-white shadow-md ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
    />
  </SwitchRoot>
</template>
