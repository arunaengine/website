<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Loader2 } from '@lucide/vue'
import type { BacklinkPreflightResponse } from '@/lib/backlinks'
import { relativeTime } from '@/lib/utils'

const props = withDefaults(defineProps<{
  preflight: BacklinkPreflightResponse | null
  busy: boolean
  error: string | null
  selection?: boolean
}>(), {
  selection: false,
})

const partial = computed(() => {
  const response = props.preflight
  if (!response) return false
  return Boolean(
    !response.complete ||
      response.truncated ||
      response.nodes_failed ||
      !response.coverage.target_resolution_complete ||
      !response.coverage.path_style_endpoint_coverage_complete ||
      !response.coverage.realm_coverage_complete ||
      response.coverage.node_freshness.some((entry) => entry.index_state !== 'current'),
  )
})

const referencesReported = computed(() =>
  props.preflight?.targets.some(
    (target) => target.visible_references.length > 0 || target.hidden_references_exist,
  ) ?? false,
)

function displayValue(value: string): string {
  return value.replaceAll('_', ' ')
}

function freshnessTime(updatedAtMs: number): string {
  return relativeTime(new Date(updatedAtMs).toISOString())
}
</script>

<template>
  <section aria-label="Dataset references" class="space-y-2 rounded-md border border-border px-3 py-2 text-xs">
    <h4 class="font-medium text-foreground">Dataset references</h4>
    <p v-if="busy" class="flex items-center gap-2 text-muted-foreground">
      <Loader2 class="h-3 w-3 animate-spin" />
      {{ selection ? 'Checking Dataset references for the selected keys…' : 'Checking Dataset references…' }}
    </p>
    <div
      v-else-if="error"
      class="rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-amber-800 dark:text-amber-300"
    >
      <p class="font-medium">
        {{ selection ? 'Dataset-reference lookup failed for part or all of the selection.' : 'Dataset-reference lookup failed.' }}
      </p>
      <p>
        {{ selection
          ? 'Reference and last-resolvable-location impact are unknown for those keys.'
          : 'Reference and last-resolvable-location impact are unknown.' }}
      </p>
      <p class="mt-1 break-all font-mono text-[10px] text-muted-foreground">{{ error }}</p>
    </div>
    <template v-else-if="preflight">
      <p
        v-if="partial"
        class="rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 font-medium text-amber-800 dark:text-amber-300"
      >
        Dataset-reference coverage is partial. References or remaining locations may be missing.
      </p>
      <p v-if="!referencesReported" class="text-muted-foreground">
        No visible or restricted Dataset references were reported for the covered forms.
      </p>
      <div
        v-for="target in preflight.targets"
        :key="target.content_w3id"
        class="space-y-1 rounded-md bg-muted/40 px-2 py-1.5"
      >
        <p class="break-all font-mono text-[10px] text-muted-foreground">{{ target.content_w3id }}</p>
        <ul v-if="target.visible_references.length" class="space-y-1 pl-4">
          <li v-for="reference in target.visible_references" :key="reference.document_id" class="list-disc">
            <RouterLink
              :to="{ name: 'dataset', params: { id: reference.document_id } }"
              class="font-medium text-primary hover:underline"
            >{{ reference.title }}</RouterLink>
          </li>
        </ul>
        <p v-if="target.hidden_references_exist" class="font-medium text-amber-800 dark:text-amber-300">
          Other restricted Datasets reference this content
        </p>
        <p
          v-if="target.would_remove_last_resolvable_aruna_location"
          class="rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 font-medium text-amber-800 dark:text-amber-300"
        >
          This operation would remove this content's last resolvable Aruna location.
        </p>
        <p
          v-else-if="!target.location_impact_complete"
          class="rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 font-medium text-amber-800 dark:text-amber-300"
        >
          The last-resolvable-location impact is unknown for this content.
        </p>
      </div>
      <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
        <dt>Queried scope</dt>
        <dd class="text-right text-foreground">{{ displayValue(preflight.coverage.queried_scope) }}</dd>
        <dt>Queried forms</dt>
        <dd class="text-right text-foreground">{{ preflight.coverage.queried_forms.map(displayValue).join(', ') }}</dd>
        <dt>Completeness</dt>
        <dd class="text-right text-foreground">{{ partial ? 'Partial' : 'Complete' }}</dd>
        <dt>Nodes queried</dt>
        <dd class="text-right font-mono text-foreground">{{ preflight.nodes_queried }}</dd>
        <dt>Nodes failed</dt>
        <dd class="text-right font-mono text-foreground">{{ preflight.nodes_failed }}</dd>
      </dl>
      <div class="space-y-1 text-muted-foreground">
        <p class="font-medium text-foreground">Index freshness</p>
        <ul v-if="preflight.coverage.node_freshness.length" class="space-y-1 pl-4">
          <li v-for="freshness in preflight.coverage.node_freshness" :key="freshness.node_id" class="list-disc break-all">
            {{ freshness.node_id }}: {{ displayValue(freshness.index_state) }}<template v-if="freshness.oldest_status_updated_at_ms !== null">, oldest status {{ freshnessTime(freshness.oldest_status_updated_at_ms) }}</template><template v-else>, timestamp unavailable</template>
          </li>
        </ul>
        <p v-else>Unknown</p>
      </div>
      <div class="space-y-1 text-muted-foreground">
        <p class="font-medium text-foreground">Coverage caveats</p>
        <ul class="space-y-1 pl-4">
          <li v-for="excluded in preflight.coverage.excluded_forms" :key="excluded.form" class="list-disc">
            <code>{{ excluded.form }}</code>: {{ excluded.reason }}
          </li>
        </ul>
      </div>
    </template>
    <p
      v-else
      class="rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 font-medium text-amber-800 dark:text-amber-300"
    >
      Dataset-reference coverage and last-resolvable-location impact are unknown.
    </p>
  </section>
</template>
