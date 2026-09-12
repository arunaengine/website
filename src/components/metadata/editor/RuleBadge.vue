<script setup lang="ts">
import { computed } from 'vue'
import type { ProfilePropertyRule } from '@/lib/profiles/types'
import { Asterisk, Sparkles } from '@lucide/vue'

// What the picked profile asks of one empty field, shown inside the field:
// the word while the field is wide enough, its icon alone when it is not.
const props = defineProps<{
  rule?: ProfilePropertyRule | null
  /** Keep clear of a select's arrow. */
  inset?: boolean
}>()

const OBLIGATIONS: Readonly<Record<string, string>> = { MUST: 'Required', SHOULD: 'Recommended' }
const obligation = computed(() => (props.rule ? OBLIGATIONS[props.rule.obligation] ?? '' : ''))
const icon = computed(() => (props.rule?.obligation === 'MUST' ? Asterisk : Sparkles))
</script>

<template>
  <span
    v-if="obligation"
    class="pointer-events-none absolute top-2.5 flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary"
    :class="inset ? 'right-9' : 'right-2'"
    :title="obligation"
  >
    <span class="sr-only @xs:not-sr-only">{{ obligation }}</span>
    <component :is="icon" class="h-3 w-3 @xs:hidden" aria-hidden="true" />
  </span>
</template>
