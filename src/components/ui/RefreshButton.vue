<script setup lang="ts">
// The one refresh affordance in the portal: an outline button whose icon spins
// while the reload runs. `srLabel` makes it icon-only and names it for
// assistive tech; the button stays disabled and `aria-busy` while busy.
import { computed } from 'vue'
import { RefreshCw } from '@lucide/vue'
import Button from '@/components/ui/Button.vue'
import type { ButtonVariants } from '@/components/ui/button'

const props = withDefaults(
  defineProps<{
    busy: boolean
    label?: string
    srLabel?: string
    disabled?: boolean
    size?: 'sm' | 'default'
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

const buttonSize = computed<ButtonVariants['size']>(() =>
  props.srLabel ? (props.size === 'sm' ? 'icon-sm' : 'icon') : props.size,
)
</script>

<template>
  <Button
    :variant="variant"
    :size="buttonSize"
    :class="props.class"
    :disabled="disabled || busy"
    :aria-busy="busy"
    :aria-label="srLabel"
  >
    <RefreshCw :class="busy ? 'animate-spin' : ''" />
    <template v-if="!srLabel">{{ label }}</template>
  </Button>
</template>
