<script setup lang="ts">
// Self-gating launcher: opens the assistant with a seeded question the viewer
// can edit or send, never spending a call on click. Hidden until a provider is
// configured, so callers drop it in without their own guard.
import { computed } from 'vue'
import { Sparkles } from '@lucide/vue'
import Button from '@/components/ui/Button.vue'
import type { ButtonVariants } from '@/components/ui/button'
import { assistantAvailable } from '@/composables/assistantState'

const props = withDefaults(
  defineProps<{
    prompt: string
    label?: string
    iconOnly?: boolean
    size?: 'sm' | 'default'
    variant?: ButtonVariants['variant']
    class?: string
  }>(),
  {
    label: 'Ask AI',
    iconOnly: false,
    size: 'sm',
    variant: 'outline',
    class: undefined,
  },
)

const buttonSize = computed<ButtonVariants['size']>(() =>
  props.iconOnly ? (props.size === 'sm' ? 'icon-sm' : 'icon') : props.size,
)

// Lazy so the chat module stays out of every host view's chunk.
function ask() {
  void import('@/composables/useAssistantChat').then(({ useAssistantChat }) => useAssistantChat().openWith(props.prompt))
}
</script>

<template>
  <Button
    v-if="assistantAvailable"
    :variant="variant"
    :size="buttonSize"
    :class="props.class"
    aria-label="Ask AI about this"
    title="Ask AI about this"
    @click="ask"
  >
    <Sparkles />
    <template v-if="!iconOnly">{{ label }}</template>
  </Button>
</template>
