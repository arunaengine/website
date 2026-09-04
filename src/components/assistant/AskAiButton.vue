<script setup lang="ts">
// Self-gating launcher: opens the assistant with a seeded question the viewer
// can edit or send, never spending a call on click. Hidden until a provider is
// configured, so callers drop it in without their own guard.
import { Sparkles } from '@lucide/vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import type { ButtonVariants } from '@/components/ui/button'
import { assistantAvailable } from '@/composables/assistantState'
import { cn } from '@/lib/utils'

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

// Lazy so the chat module stays out of every host view's chunk.
function ask() {
  void import('@/composables/useAssistantChat').then(({ useAssistantChat }) => useAssistantChat().openWith(props.prompt))
}
</script>

<template>
  <template v-if="assistantAvailable">
    <IconButton
      v-if="iconOnly"
      label="Ask AI about this"
      :variant="variant"
      :size="props.size === 'sm' ? 'icon-sm' : 'icon'"
      :class="props.class"
      @click="ask"
    >
      <Sparkles class="size-3.5" />
    </IconButton>
    <Button
      v-else
      :variant="variant"
      :size="props.size"
      :class="cn('px-3.5', props.class)"
      aria-label="Ask AI about this"
      title="Ask AI about this"
      @click="ask"
    >
      <Sparkles class="size-3.5" />{{ label }}
    </Button>
  </template>
</template>
