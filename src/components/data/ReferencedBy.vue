<script setup lang="ts">
// The datasets that reference one file. The lookup's coverage sits behind a
// Complete or Partial badge instead of being printed above the list.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Check, Link2, TriangleAlert } from '@lucide/vue'
import Button from '@/components/ui/Button.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import Popover from '@/components/ui/Popover.vue'
import Spinner from '@/components/ui/Spinner.vue'
import type { BacklinkPreflightResponse, BacklinkPreflightVisibleReference } from '@/lib/backlinks'
import { relativeTime } from '@/lib/utils'

const props = defineProps<{
  preflight: BacklinkPreflightResponse | null
  busy: boolean
  error: string | null
}>()
const emit = defineEmits<{ (e: 'retry'): void }>()

const targets = computed(() => props.preflight?.targets ?? [])

const references = computed(() => {
  const seen = new Set<string>()
  const rows: BacklinkPreflightVisibleReference[] = []
  for (const target of targets.value) {
    for (const reference of target.visible_references) {
      if (seen.has(reference.document_id)) continue
      seen.add(reference.document_id)
      rows.push(reference)
    }
  }
  return rows
})

const hidden = computed(() => targets.value.some((target) => target.hidden_references_exist))

const freshness = computed(() => props.preflight?.coverage.node_freshness ?? [])
const failed = computed(() => props.preflight?.nodes_failed ?? 0)
const answered = computed(() => (props.preflight?.nodes_queried ?? 0) - failed.value)
const behind = computed(() => freshness.value.filter((entry) => entry.index_state !== 'current'))

const incomplete = computed(() => {
  const response = props.preflight
  if (!response) return false
  return Boolean(
    !response.complete ||
      response.truncated ||
      !response.coverage.target_resolution_complete ||
      !response.coverage.path_style_endpoint_coverage_complete ||
      !response.coverage.realm_coverage_complete,
  )
})

const partial = computed(
  () => incomplete.value || failed.value > 0 || behind.value.length > 0 || !freshness.value.length,
)

function nodeWord(count: number): string {
  return count === 1 ? 'node' : 'nodes'
}

function displayValue(value: string): string {
  return value.replaceAll('_', ' ')
}

const reasons = computed(() => {
  const lines: string[] = []
  if (failed.value) lines.push(`${failed.value} ${nodeWord(failed.value)} did not answer`)
  if (behind.value.length) {
    lines.push(`${behind.value.length} ${behind.value.length === 1 ? 'index is' : 'indexes are'} behind`)
  }
  if (!freshness.value.length) lines.push('no node reported its index state')
  if (props.preflight?.truncated) lines.push('the result was cut short')
  if (!lines.length && incomplete.value) lines.push('the lookup did not cover the whole realm')
  return lines
})

const summary = computed(() =>
  partial.value
    ? `References may be missing: ${reasons.value.join(', ')}.`
    : `All ${answered.value} realm ${nodeWord(answered.value)} answered and their indexes are current.`,
)

const countLabel = computed(
  () => `${references.value.length} ${references.value.length === 1 ? 'dataset' : 'datasets'}`,
)

const emptyText = computed(() =>
  partial.value
    ? 'No referencing dataset was found, but the lookup was partial.'
    : 'No dataset references this file.',
)

const checkedForms = computed(() =>
  (props.preflight?.coverage.queried_forms ?? []).map(displayValue).join(', '),
)

const nodeRows = computed(() =>
  freshness.value.map((entry) => ({
    nodeId: entry.node_id,
    current: entry.index_state === 'current',
    state: displayValue(entry.index_state),
    asOf:
      entry.oldest_status_updated_at_ms == null
        ? ''
        : relativeTime(new Date(entry.oldest_status_updated_at_ms).toISOString()),
  })),
)

const BADGE =
  'inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset focus:outline-none focus:ring-2 focus:ring-ring'
const badgeClass = computed(() =>
  partial.value
    ? `${BADGE} bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/20`
    : `${BADGE} bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/20`,
)
</script>

<template>
  <div class="text-xs" aria-live="polite">
    <div class="flex flex-wrap items-center gap-2">
      <Link2 class="h-4 w-4 text-primary" aria-hidden="true" />
      <span class="font-medium text-foreground">Referenced by</span>
      <template v-if="preflight && !busy && !error">
        <span class="text-muted-foreground">{{ countLabel }}</span>
        <Popover>
          <button
            type="button"
            :class="badgeClass"
            :title="partial ? 'The lookup was partial. Show the details' : 'The lookup is complete. Show the details'"
          >
            <TriangleAlert v-if="partial" class="size-3" aria-hidden="true" />
            <Check v-else class="size-3" aria-hidden="true" />
            {{ partial ? 'Partial' : 'Complete' }}
          </button>
          <template #content>
            <div class="space-y-2 text-xs">
              <p class="font-medium" :class="partial ? 'text-amber-800 dark:text-amber-300' : ''">
                {{ partial ? 'Lookup partial' : 'Lookup complete' }}
              </p>
              <p class="text-muted-foreground">{{ summary }}</p>
              <dl class="space-y-1 text-muted-foreground">
                <div class="flex justify-between gap-3">
                  <dt>Scope</dt>
                  <dd class="text-right text-foreground">{{ displayValue(preflight.coverage.queried_scope) }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt>Nodes</dt>
                  <dd class="text-right text-foreground">{{ answered }} answered, {{ failed }} failed</dd>
                </div>
                <div v-if="checkedForms" class="flex justify-between gap-3">
                  <dt>Checked forms</dt>
                  <dd class="text-right text-foreground">{{ checkedForms }}</dd>
                </div>
              </dl>
              <ul v-if="nodeRows.length" class="space-y-1 text-muted-foreground">
                <li v-for="row in nodeRows" :key="row.nodeId" class="flex flex-wrap items-center gap-1">
                  <Check v-if="row.current" class="size-3.5 shrink-0" aria-hidden="true" />
                  <TriangleAlert v-else class="size-3.5 shrink-0 text-amber-800 dark:text-amber-300" aria-hidden="true" />
                  <NodeLabel :node-id="row.nodeId" size="sm" />
                  <span v-if="!row.current" class="text-amber-800 dark:text-amber-300">{{ row.state }}</span>
                  <span v-if="row.asOf">as of {{ row.asOf }}</span>
                </li>
              </ul>
              <p v-for="excluded in preflight.coverage.excluded_forms" :key="excluded.form" class="text-muted-foreground">
                Not checked: {{ displayValue(excluded.form) }}. {{ excluded.reason }}
              </p>
              <DocsLink topic="data-and-deletion" section="What the reference check covers" />
            </div>
          </template>
        </Popover>
      </template>
    </div>

    <Spinner v-if="busy" show-label label="Checking the realm indexes…" class="mt-2" />
    <div v-else-if="error" class="mt-2 flex flex-wrap items-center gap-2 text-destructive">
      <span>{{ error }}</span>
      <Button variant="outline" size="sm" @click="emit('retry')">Retry</Button>
    </div>
    <template v-else-if="preflight">
      <ul v-if="references.length" class="mt-2 divide-y divide-border/60 rounded-md border border-border/60 bg-background">
        <li v-for="reference in references" :key="reference.document_id" class="px-3 py-2">
          <RouterLink
            :to="{ name: 'dataset', params: { id: reference.document_id } }"
            class="font-medium text-primary hover:underline"
          >{{ reference.title }}</RouterLink>
        </li>
      </ul>
      <p v-else class="mt-2 text-muted-foreground">{{ emptyText }}</p>
      <p v-if="hidden" class="mt-2 font-medium text-amber-800 dark:text-amber-300">
        Other restricted datasets reference this file.
      </p>
    </template>
  </div>
</template>
