<script setup lang="ts">
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import { OBJECT_SEARCH_MODE_LABELS } from '@/composables/useUnifiedSearch'
import { relativeTime } from '@/lib/utils'
import type { ObjectSearchCoverage } from '@/lib/api'

const props = defineProps<{
  open: boolean
  coverage: ObjectSearchCoverage | null
  requestMs: number | null
  error?: string | null
}>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>()

interface StatRow {
  label: string
  value: string
  title?: string
}

interface StatGroup {
  title: string
  rows: StatRow[]
}

const groups = computed<StatGroup[]>(() => {
  const coverage = props.coverage
  const list: StatGroup[] = []
  if (coverage) {
    const freshness = coverage.index_freshness
    list.push({
      title: 'Nodes',
      rows: [
        { label: 'Every node answered', value: coverage.nodes_failed === 0 ? 'Yes' : 'No' },
        { label: 'Nodes queried', value: String(coverage.nodes_queried) },
        { label: 'Nodes failed', value: String(coverage.nodes_failed) },
        {
          label: 'Failed partitions',
          value: coverage.failed_partitions.length ? coverage.failed_partitions.join(', ') : 'None',
        },
        { label: 'Omitted partitions', value: String(coverage.omitted_partitions) },
        {
          label: 'Truncated',
          value: coverage.truncated ? 'Yes, load more for the full set' : 'No',
        },
      ],
    })
    const detail: StatRow[] = [
      { label: 'Mode', value: OBJECT_SEARCH_MODE_LABELS[coverage.mode] },
      { label: 'Scope', value: coverage.scope === 'realm' ? 'Realm' : 'This node' },
      { label: 'Freshness source', value: freshness.source.replaceAll('_', ' ') },
      { label: 'As of', value: relativeTime(freshness.as_of), title: freshness.as_of },
    ]
    if (freshness.oldest_observed_at) {
      detail.push({
        label: 'Oldest observed partition',
        value: relativeTime(freshness.oldest_observed_at),
        title: freshness.oldest_observed_at,
      })
    }
    list.push({ title: 'Coverage', rows: detail })
  }
  if (props.requestMs !== null) {
    list.push({
      title: 'Performance',
      rows: [{ label: 'Request time (measured in app)', value: `${props.requestMs} ms` }],
    })
  }
  return list
})
</script>

<template>
  <Dialog :open="open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-h-[85vh] max-w-lg overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Query coverage</DialogTitle>
        <DialogDescription>What this answer covered, and how long it took.</DialogDescription>
      </DialogHeader>

      <p v-if="error" class="text-xs text-destructive">{{ error }}</p>

      <section v-for="group in groups" :key="group.title" class="space-y-1.5">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ group.title }}</h3>
        <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
          <template v-for="row in group.rows" :key="row.label">
            <dt class="text-muted-foreground">{{ row.label }}</dt>
            <dd class="break-all font-medium" :title="row.title">{{ row.value }}</dd>
          </template>
        </dl>
      </section>

      <DialogFooter>
        <DialogClose as-child><Button type="button" variant="outline">Close</Button></DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
