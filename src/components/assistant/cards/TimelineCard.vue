<script setup lang="ts">
// Dated events the assistant asked to show in order: a job's history, an
// object's versions, or a sync's activity.
import Badge from '@/components/ui/Badge.vue'
import type { TimelineView } from '@/lib/assistant/types'
import { stateTone, stateVariant, toneDot } from '@/lib/stateBadge'
import { relativeTime } from '@/lib/utils'
import { History } from '@lucide/vue'

defineProps<{ view: TimelineView }>()

function label(state: string): string {
  return state.charAt(0).toUpperCase() + state.slice(1)
}
</script>

<template>
  <div class="surface-inline overflow-hidden text-xs">
    <div class="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5">
      <History class="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span class="min-w-0 flex-1 truncate font-medium text-foreground">{{ view.title }}</span>
      <span class="shrink-0 text-[11px] text-muted-foreground">
        {{ view.events.length }} {{ view.events.length === 1 ? 'event' : 'events' }}
      </span>
    </div>
    <ol class="scrollbar-thin ml-4 max-h-72 space-y-2.5 overflow-auto border-l border-border/60 py-2.5 pl-3.5 pr-3">
      <li v-for="(event, index) in view.events" :key="index" class="relative">
        <span
          class="absolute -left-[1.125rem] top-1 h-2 w-2 rounded-full ring-2 ring-card"
          :class="event.state ? toneDot(stateTone(event.state)) : 'bg-border'"
          aria-hidden="true"
        />
        <div class="flex items-baseline gap-2">
          <span class="min-w-0 flex-1 text-foreground/90">{{ event.label }}</span>
          <Badge v-if="event.state" size="sm" :variant="stateVariant(event.state)">{{ label(event.state) }}</Badge>
          <span class="shrink-0 text-[11px] text-muted-foreground" :title="event.at">{{ relativeTime(event.at) }}</span>
        </div>
        <p v-if="event.detail" class="mt-0.5 leading-relaxed text-muted-foreground">{{ event.detail }}</p>
      </li>
    </ol>
  </div>
</template>
