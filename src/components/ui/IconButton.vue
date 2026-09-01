<script setup lang="ts">
// An icon-only button carries one `label`: it names the control for assistive
// technology and shows on hover, so no icon in the portal is unlabelled. A
// blocked one shows its reason in the same place instead.
import { computed } from 'vue'
import Button from './Button.vue'
import Tooltip from './Tooltip.vue'
import type { ButtonVariants } from './button'

const props = withDefaults(
  defineProps<{
    label: string
    variant?: ButtonVariants['variant']
    size?: 'icon' | 'icon-sm'
    disabled?: boolean
    disabledReason?: string | null
    class?: string
    side?: 'top' | 'right' | 'bottom' | 'left'
  }>(),
  {
    variant: 'ghost',
    size: 'icon-sm',
    disabled: false,
    disabledReason: null,
    class: undefined,
    side: undefined,
  },
)

const blocked = computed(() => props.disabled || Boolean(props.disabledReason))
const hover = computed(() =>
  blocked.value && props.disabledReason ? props.disabledReason : props.label,
)
</script>

<template>
  <Tooltip :label="hover" :side="props.side">
    <Button
      :variant="props.variant"
      :size="props.size"
      :class="props.class"
      :disabled="blocked"
      :aria-label="props.label"
      :title="hover"
    >
      <slot />
    </Button>
  </Tooltip>
</template>
