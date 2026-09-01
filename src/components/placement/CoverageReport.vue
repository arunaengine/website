<script setup lang="ts">
// The gap table of one coverage page. The caveat that this is one node's count
// is stated once by the surface around it, not repeated per block.
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import StatCard from '@/components/ui/StatCard.vue'
import { coverageLimitLabel } from '@/lib/placementPolicies'
import type { CoverageResponse } from '@/lib/placementPolicies'
import { formatNumber, truncateMiddle } from '@/lib/utils'

defineProps<{ report: CoverageResponse }>()

const COPY_STATES: Record<string, string> = {
  registered: 'stored here',
  quarantined: 'held back here',
  absent: 'not here',
  reference_only: 'points elsewhere',
}

function copyLabel(state: string | undefined): string {
  if (!state) return 'not counted for older versions'
  return COPY_STATES[state] ?? state.replaceAll('_', ' ')
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline" size="sm">
        {{ report.scope === 'historical' ? 'Older versions too' : 'Current versions' }}
      </Badge>
      <Badge :variant="report.complete ? 'success' : 'warn'" size="sm">
        {{ report.complete ? 'Whole listing read' : 'One page of a longer listing' }}
      </Badge>
      <Badge v-for="limit in report.limits" :key="limit" variant="warn" size="sm">
        {{ coverageLimitLabel(limit) }}
      </Badge>
    </div>

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <StatCard label="Stored here" :value="formatNumber(report.registered)" />
      <StatCard label="Held back here" :value="formatNumber(report.quarantined)" />
      <StatCard label="Not here" :value="formatNumber(report.absent)" />
      <StatCard label="Points elsewhere" :value="formatNumber(report.reference_only)" />
      <StatCard label="Deleted" :value="formatNumber(report.deleted)" />
    </div>

    <div v-if="report.gaps.length" class="overflow-x-auto rounded-md border border-border">
      <table class="w-full min-w-[620px] text-left text-xs">
        <caption class="caption-top px-3 py-2 text-left text-[11px] text-muted-foreground">
          Objects that do not carry the bucket's rules yet.
        </caption>
        <thead class="border-y border-border bg-muted/40 text-muted-foreground">
          <tr>
            <th class="px-3 py-2 font-medium">Key</th>
            <th class="px-3 py-2 font-medium">Version</th>
            <th class="px-3 py-2 font-medium">Rules</th>
            <th class="px-3 py-2 font-medium">Copy on this node</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr v-for="gap in report.gaps" :key="`${gap.key}:${gap.version_id}`">
            <td class="px-3 py-2 font-mono">{{ gap.key }}</td>
            <td class="px-3 py-2 font-mono" :title="gap.version_id">{{ truncateMiddle(gap.version_id) }}</td>
            <td class="px-3 py-2">
              <Badge :variant="gap.attachment === 'missing' ? 'destructive' : 'warn'" size="sm">
                {{ gap.attachment === 'missing' ? 'none attached' : 'some attached' }}
              </Badge>
            </td>
            <td class="px-3 py-2">{{ copyLabel(gap.copy) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <EmptyState
      v-else
      compact
      title="Every object on this page carries the bucket's rules."
    />

    <details v-if="report.target_policies.length" class="rounded-md border border-border px-3 py-2">
      <summary class="cursor-pointer text-xs font-medium text-foreground">Advanced</summary>
      <div class="mt-2 text-[11px] text-muted-foreground">
        <p>Compared against these policy references, at generation {{ report.generation }}.</p>
        <p
          v-for="policy in report.target_policies"
          :key="`${policy.policy_id}:${policy.digest}`"
          class="mt-1 font-mono"
          :title="`${policy.policy_id}:${policy.digest}`"
        >
          {{ policy.policy_id }} / {{ truncateMiddle(policy.digest, 10, 8) }}
        </p>
      </div>
    </details>
  </div>
</template>
