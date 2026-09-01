<script setup lang="ts">
// The one refresh affordance in the portal: an outline button whose icon spins
// while the reload runs. `srLabel` makes it icon-only and names it for
// assistive tech; the button stays disabled and `aria-busy` while busy.
import { computed } from 'vue'
import { RefreshCw } from '@lucide/vue'
import Button from '@/components/ui/Button.vue'
import type { ButtonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    busy: boolean
    label?: string
    srLabel?: string
    disabled?: boolean
    // `xs` is the compact toolbar control: it keeps the icon down to the size
    // of the small glyphs it sits beside.
    size?: 'xs' | 'sm' | 'default'
    variant?: ButtonVariants['variant']
    class?: string
  }>(),
  {
    label: 'Refresh',
    srLabel: undefined,
    disabled: false,
    size: 'sm',
    variant: 'outline',
    class: undefined,
  },
)

const compact = computed(() => props.size === 'xs')
const buttonSize = computed<ButtonVariants['size']>(() => {
  if (props.srLabel) return props.size === 'default' ? 'icon' : 'icon-sm'
  return props.size === 'default' ? 'default' : 'sm'
})
const buttonClasses = computed(() =>
  cn(compact.value && (props.srLabel ? 'h-6 w-6' : 'h-6 px-1.5 text-[10px]'), props.class),
)
</script>

<template>
  <Button
    :variant="variant"
    :size="buttonSize"
    :class="buttonClasses"
    :disabled="disabled || busy"
    :aria-busy="busy"
    :aria-label="srLabel"
  >
    <RefreshCw :class="[compact ? 'size-3' : 'size-4', busy ? 'animate-spin' : '']" />
    <template v-if="!srLabel">{{ label }}</template>
  </Button>
</template>
