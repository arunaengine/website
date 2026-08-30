<script setup lang="ts">
import { computed } from 'vue'
import { Bot, CircleUserRound, Server, Sparkles } from '@lucide/vue'
import { cn } from '@/lib/utils'
import type { ProviderChoice } from './providerKinds'

const props = defineProps<{ choice: ProviderChoice; class?: string }>()

const ICONS = {
  anthropic: Sparkles,
  openai: Bot,
  compatible: Server,
  chatgpt: CircleUserRound,
} as const
const icon = computed(() => ICONS[props.choice])
</script>

<template>
  <span
    :class="cn(
      'grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-muted/40 text-primary',
      props.class,
    )"
  >
    <component :is="icon" class="size-4" aria-hidden="true" />
  </span>
</template>
