<script setup lang="ts">
// The one notice box in the portal. An error interrupts, the other tones are
// polite status; `lines` renders the follow-up sentences as a list.
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    tone?: 'error' | 'warning' | 'info'
    title?: string
    lines?: readonly string[]
    class?: string
  }>(),
  { tone: 'info', title: undefined, lines: undefined, class: undefined },
)

const TONE_CLASS = {
  error: 'border-destructive/30 bg-destructive/5 text-destructive',
  warning: 'border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300',
  info: 'border-border bg-muted/50 text-muted-foreground',
} as const

const classes = computed(() =>
  cn('rounded-md border px-3 py-2 text-xs leading-relaxed', TONE_CLASS[props.tone], props.class),
)
const listed = computed(() => props.lines?.filter(Boolean) ?? [])
</script>

<template>
  <div :class="classes" :role="tone === 'error' ? 'alert' : 'status'">
    <p v-if="title" class="font-medium">{{ title }}</p>
    <slot />
    <ul v-if="listed.length" :class="title || $slots.default ? 'mt-1 list-disc space-y-0.5 pl-4' : 'list-disc space-y-0.5 pl-4'">
      <li v-for="(line, index) in listed" :key="index">{{ line }}</li>
    </ul>
  </div>
</template>
