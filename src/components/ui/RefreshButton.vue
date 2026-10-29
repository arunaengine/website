<script setup lang="ts">
// The one refresh affordance in the portal: an outline button whose icon spins
// while the reload runs. `srLabel` makes it icon-only and names it for
// assistive tech; the button stays disabled and `aria-busy` while busy. In a page header it is a
// 36 px icon button with its label in the tooltip.
import { computed, inject } from 'vue'
import { RefreshCw } from '@lucide/vue'
import Button from '@/components/ui/Button.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import { IN_PAGE_HEADER } from '@/components/ui/pageHeader'
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

const inHeader = inject(IN_PAGE_HEADER, false)
const iconLabel = computed(() => props.srLabel ?? props.label)
const compact = computed(() => props.size === 'xs')
const buttonSize = computed<ButtonVariants['size']>(() => {
  if (props.srLabel) return props.size === 'default' ? 'icon' : 'icon-sm'
  return props.size === 'default' ? 'default' : 'sm'
})
const buttonClasses = computed(() =>
  cn(compact.value && (props.srLabel ? 'h-6 w-6' : 'h-6 px-1.5 text-xs'), props.class),
)
</script>

<template>
  <Tooltip v-if="inHeader && !srLabel" :label="label">
    <Button
      :variant="variant"
      size="icon"
      :class="props.class"
      :disabled="disabled || busy"
      :aria-busy="busy"
      :aria-label="iconLabel"
    >
      <RefreshCw :class="['size-4', busy ? 'animate-spin' : '']" />
    </Button>
  </Tooltip>
  <Button
    v-else
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
