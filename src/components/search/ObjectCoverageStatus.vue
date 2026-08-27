<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import { AlertTriangle, Check, ChevronDown } from '@lucide/vue'
import { OBJECT_SEARCH_MODE_LABELS } from '@/composables/useUnifiedSearch'
import { relativeTime } from '@/lib/utils'
import type { ObjectSearchCoverage } from '@/lib/api'

// One chip carries the answer; the numbers behind it stay one click away.
const props = defineProps<{
  coverage: ObjectSearchCoverage | null
  status: 'Complete' | 'Partial' | 'Unavailable'
  compact?: boolean
}>()

const open = ref(false)
const detailsId = useId()

const variant = computed(() =>
  props.status === 'Complete' ? 'success' : props.status === 'Partial' ? 'warn' : 'destructive',
)

interface CoverageRow {
  label: string
  value: string
  title?: string
}

const rows = computed<CoverageRow[]>(() => {
  const coverage = props.coverage
  if (!coverage) return []
  const freshness = coverage.index_freshness
  const list: CoverageRow[] = [
    { label: 'Mode', value: OBJECT_SEARCH_MODE_LABELS[coverage.mode] },
    { label: 'Scope', value: coverage.scope === 'realm' ? 'Realm' : 'This node' },
    { label: 'Freshness source', value: freshness.source.replaceAll('_', ' ') },
    { label: 'As of', value: relativeTime(freshness.as_of), title: freshness.as_of },
  ]
  if (freshness.oldest_observed_at) {
    list.push({
      label: 'Oldest partition',
      value: relativeTime(freshness.oldest_observed_at),
      title: freshness.oldest_observed_at,
    })
  }
  list.push({ label: 'Nodes queried', value: String(coverage.nodes_queried) })
  list.push({ label: 'Nodes failed', value: String(coverage.nodes_failed) })
  if (coverage.truncated) list.push({ label: 'Truncated', value: 'Yes, load more for the full set' })
  if (coverage.omitted_partitions) {
    list.push({ label: 'Omitted partitions', value: String(coverage.omitted_partitions) })
  }
  if (coverage.failed_partitions.length) {
    list.push({ label: 'Failed partitions', value: coverage.failed_partitions.join(', ') })
  }
  return list
})
</script>

<template>
  <div :class="compact ? 'text-[10px]' : 'text-xs'">
    <div class="flex flex-wrap items-center gap-2">
      <button
        v-if="rows.length"
        type="button"
        class="inline-flex items-center gap-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :aria-expanded="open"
        :aria-controls="detailsId"
        @click="open = !open"
      >
        <Badge :variant="variant" class="gap-1 px-1.5 py-0 uppercase" :class="compact ? 'text-[9px]' : 'text-[10px]'">
          <Check v-if="status === 'Complete'" class="h-3 w-3" aria-hidden="true" />
          <AlertTriangle v-else class="h-3 w-3" aria-hidden="true" />
          {{ status }}
        </Badge>
        <ChevronDown
          class="h-3 w-3 shrink-0 text-muted-foreground transition-transform"
          :class="open ? 'rotate-180' : ''"
          aria-hidden="true"
        />
        <span class="sr-only">Coverage details</span>
      </button>
      <Badge v-else :variant="variant" class="gap-1 px-1.5 py-0 uppercase" :class="compact ? 'text-[9px]' : 'text-[10px]'">
        <AlertTriangle class="h-3 w-3" aria-hidden="true" />
        {{ status }}
      </Badge>
      <slot />
    </div>
    <dl v-if="open" :id="detailsId" class="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
      <template v-for="row in rows" :key="row.label">
        <dt class="text-muted-foreground">{{ row.label }}</dt>
        <dd class="break-all font-medium" :title="row.title">{{ row.value }}</dd>
      </template>
    </dl>
  </div>
</template>
