<script setup lang="ts">
// A state that needs attention, as an icon and a word in a 22 px pill; never a dot. Running work
// is blue, a warning amber, a failure red, anything else neutral. A fine state is a StatusMark.
import { computed, type Component } from 'vue'
import { CircleAlert, CircleX, LoaderCircle, TriangleAlert } from '@lucide/vue'
import { stateTone, type StateTone } from '@/lib/stateBadge'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{ state: string; tone?: StateTone; icon?: Component; class?: string }>(),
  { tone: undefined, icon: undefined, class: undefined },
)

const tone = computed(() => props.tone ?? stateTone(props.state))
const look = computed<{ icon: Component; color: string; spin?: boolean }>(() => {
  if (tone.value === 'progress') return { icon: LoaderCircle, color: 'text-status-running bg-status-running/10 border-status-running/25', spin: true }
  if (tone.value === 'attention') return { icon: TriangleAlert, color: 'text-status-warn bg-status-warn/10 border-status-warn/25' }
  if (tone.value === 'failed') return { icon: CircleX, color: 'text-status-failed bg-status-failed/10 border-status-failed/25' }
  return { icon: CircleAlert, color: 'text-muted-foreground bg-muted border-border-subtle' }
})
</script>

<template>
  <span :class="cn('inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-xs font-medium', look.color, props.class)">
    <component :is="icon ?? look.icon" class="size-3 shrink-0" :class="!icon && look.spin ? 'motion-safe:animate-spin' : ''" aria-hidden="true" />
    {{ state }}
  </span>
</template>
