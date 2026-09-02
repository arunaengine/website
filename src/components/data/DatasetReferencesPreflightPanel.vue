<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, ChevronDown, TriangleAlert } from '@lucide/vue'
import CompactList from '@/components/ui/CompactList.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import type { BacklinkPreflightResponse, BacklinkPreflightTargetResult } from '@/lib/backlinks'
import { relativeTime } from '@/lib/utils'

const props = withDefaults(defineProps<{
  preflight: BacklinkPreflightResponse | null
  busy: boolean
  error: string | null
  selection?: boolean
}>(), {
  selection: false,
})

const nodesShown = ref(false)

const freshness = computed(() => props.preflight?.coverage.node_freshness ?? [])
const failedNodes = computed(() => props.preflight?.nodes_failed ?? 0)

// Everything that makes the answer less than a full realm sweep, minus the
// per-node signals the summary line reports on their own.
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
  () =>
    incomplete.value ||
    Boolean(failedNodes.value) ||
    freshness.value.some((entry) => entry.index_state !== 'current'),
)

const referencesReported = computed(() =>
  props.preflight?.targets.some(
    (target) => target.visible_references.length > 0 || target.hidden_references_exist,
  ) ?? false,
)

const targets = computed(() => props.preflight?.targets ?? [])

const referenceRows = computed(() =>
  targets.value.flatMap((target) =>
    target.visible_references.map((reference) => ({
      key: `${target.content_w3id}\n${reference.document_id}`,
      text: reference.title,
      detail: target.content_w3id,
      to: { name: 'dataset', params: { id: reference.document_id } },
    })),
  ),
)

const hiddenReferences = computed(() =>
  targets.value.some((target) => target.hidden_references_exist),
)

function contentRows(matching: (target: BacklinkPreflightTargetResult) => boolean) {
  return targets.value
    .filter(matching)
    .map((target) => ({ key: target.content_w3id, text: target.content_w3id }))
}

const lastLocationRows = computed(() =>
  contentRows((target) => target.would_remove_last_resolvable_aruna_location),
)

const unknownImpactRows = computed(() =>
  contentRows(
    (target) => !target.would_remove_last_resolvable_aruna_location && !target.location_impact_complete,
  ),
)

function displayValue(value: string): string {
  return value.replaceAll('_', ' ')
}

function nodeWord(count: number): string {
  return count === 1 ? 'node' : 'nodes'
}

const currentNodes = computed(
  () => freshness.value.filter((entry) => entry.index_state === 'current').length,
)

const coverageOk = computed(() => freshness.value.length > 0 && !partial.value)

const coverageSummary = computed(() => {
  const reported = freshness.value.length
  const clauses = [
    reported
      ? `Index current on ${currentNodes.value} of ${reported} ${nodeWord(reported)}`
      : 'Index freshness was not reported',
  ]
  if (failedNodes.value) {
    clauses.push(`${failedNodes.value} ${nodeWord(failedNodes.value)} did not answer`)
  }
  if (incomplete.value) clauses.push('coverage is partial')
  return clauses.join(', ')
})

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

const excludedForms = computed(() =>
  (props.preflight?.coverage.excluded_forms ?? [])
    .map((excluded) => `${displayValue(excluded.form)} (${excluded.reason})`)
    .join(', '),
)
</script>

<template>
  <section aria-label="Dataset references" class="space-y-2 rounded-md border border-border px-3 py-2 text-xs">
    <h4 class="font-medium text-foreground">Dataset references</h4>
    <Spinner
      v-if="busy"
      show-label
      :label="selection ? 'Checking dataset references for the selection…' : 'Checking dataset references…'"
    />
    <Notice v-else-if="error" tone="warning">
      <p class="font-medium">
        {{ selection ? 'Dataset-reference lookup failed for part or all of the selection.' : 'Dataset-reference lookup failed.' }}
      </p>
      <p>
        {{ selection
          ? 'Reference and last-resolvable-location impact are unknown for those keys.'
          : 'Reference and last-resolvable-location impact are unknown.' }}
      </p>
      <p class="mt-1 break-all font-mono text-[10px]">{{ error }}</p>
    </Notice>
    <template v-else-if="preflight">
      <Notice v-if="partial" tone="warning" class="font-medium">
        Dataset-reference coverage is partial. References or remaining locations may be missing.
      </Notice>
      <p v-if="!referencesReported" class="text-muted-foreground">
        No visible or restricted dataset references were reported for the covered forms.
      </p>
      <CompactList v-if="referenceRows.length" label="dataset reference" :items="referenceRows" />
      <p v-if="hiddenReferences" class="font-medium text-amber-800 dark:text-amber-300">
        Other restricted datasets reference this content
      </p>
      <Notice v-if="lastLocationRows.length" tone="warning" class="space-y-1">
        <p class="font-medium">
          This operation would remove this content's last resolvable Aruna location.
        </p>
        <CompactList label="content" :items="lastLocationRows" />
      </Notice>
      <Notice v-if="unknownImpactRows.length" tone="warning" class="space-y-1">
        <p class="font-medium">
          The last-resolvable-location impact is unknown for this content.
        </p>
        <CompactList label="content" :items="unknownImpactRows" />
      </Notice>
      <div class="space-y-1">
        <p
          class="flex flex-wrap items-center gap-1"
          :class="coverageOk ? 'text-muted-foreground' : 'text-amber-800 dark:text-amber-300'"
        >
          <Check v-if="coverageOk" class="size-3.5 shrink-0" aria-hidden="true" />
          <TriangleAlert v-else class="size-3.5 shrink-0" aria-hidden="true" />
          <span>{{ coverageSummary }}</span>
          <DocsLink icon topic="data-and-deletion" section="What the reference check covers" class="ml-0.5" />
        </p>
        <button
          type="button"
          class="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline"
          :aria-expanded="nodesShown"
          @click="nodesShown = !nodesShown"
        >
          <ChevronDown class="h-3 w-3 transition-transform" :class="nodesShown ? 'rotate-180' : ''" aria-hidden="true" />
          {{ nodesShown ? 'Hide the nodes' : 'Show the nodes' }}
        </button>
        <div v-if="nodesShown" class="space-y-1 text-muted-foreground">
          <ul v-if="nodeRows.length" class="space-y-1">
            <li v-for="row in nodeRows" :key="row.nodeId" class="flex flex-wrap items-center gap-1">
              <Check v-if="row.current" class="size-3.5 shrink-0" aria-hidden="true" />
              <TriangleAlert v-else class="size-3.5 shrink-0 text-amber-800 dark:text-amber-300" aria-hidden="true" />
              <NodeLabel :node-id="row.nodeId" size="sm" />
              <span v-if="!row.current" class="text-amber-800 dark:text-amber-300">{{ row.state }}</span>
              <span v-if="row.asOf">as of {{ row.asOf }}</span>
            </li>
          </ul>
          <p v-else>No node reported its index state.</p>
          <p>Scope: {{ displayValue(preflight.coverage.queried_scope) }}</p>
          <p>Forms: {{ preflight.coverage.queried_forms.map(displayValue).join(', ') }}</p>
          <p v-if="excludedForms">Not queried: {{ excludedForms }}</p>
        </div>
      </div>
    </template>
    <Notice v-else tone="warning" class="font-medium">
      Dataset-reference coverage and last-resolvable-location impact are unknown.
    </Notice>
  </section>
</template>
