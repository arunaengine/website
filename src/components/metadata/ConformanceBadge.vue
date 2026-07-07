<script setup lang="ts">
// Non-interactive conformance chip mirroring ProfileChip's shape. It states only
// what was actually evaluated: `unknown`/`checking`/`none` render nothing in
// compact mode so a search card never implies a check that did not happen.
import { computed } from 'vue'
import { BadgeCheck, CircleAlert, TriangleAlert, CircleHelp } from '@lucide/vue'
import type { ConformanceState } from '@/composables/useProfileConformance'

const props = withDefaults(
  defineProps<{ state: ConformanceState; errorCount?: number; warningCount?: number; compact?: boolean }>(),
  { errorCount: 0, warningCount: 0, compact: false },
)

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

const view = computed(() => {
  switch (props.state) {
    case 'conformant':
      return { icon: BadgeCheck, tint: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', label: 'Conformant' }
    case 'errors': {
      const label = props.warningCount
        ? `${plural(props.errorCount, 'error')}, ${plural(props.warningCount, 'warning')}`
        : plural(props.errorCount, 'error')
      return { icon: CircleAlert, tint: 'bg-destructive/10 text-destructive', label }
    }
    case 'warnings':
      return { icon: TriangleAlert, tint: 'bg-amber-500/10 text-amber-800 dark:text-amber-300', label: plural(props.warningCount, 'warning') }
    case 'unknown':
      return { icon: CircleHelp, tint: 'bg-muted text-muted-foreground', label: 'Not checked' }
    case 'checking':
      return { icon: CircleHelp, tint: 'bg-muted text-muted-foreground', label: 'Checking…' }
    default:
      return null
  }
})

// unknown/checking are muted status text — never shown compact (a card must not
// claim or imply a check that didn't run).
const visible = computed(() => Boolean(view.value) && !(props.compact && (props.state === 'unknown' || props.state === 'checking')))
</script>

<template>
  <span
    v-if="visible && view"
    class="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]"
    :class="view.tint"
    :title="compact ? view.label : undefined"
  >
    <component :is="view.icon" class="h-3 w-3" />
    <span v-if="!compact">{{ view.label }}</span>
  </span>
</template>
