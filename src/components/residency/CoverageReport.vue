<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import StatCard from '@/components/ui/StatCard.vue'
import { coverageLimitLabel } from '@/lib/placementPolicies'
import type { CoverageResponse } from '@/lib/placementPolicies'
import { formatNumber, truncateMiddle } from '@/lib/utils'

defineProps<{ report: CoverageResponse }>()
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <Badge variant="outline">{{ report.scope.replaceAll('_', ' ') }} scope</Badge>
      <Badge :variant="report.complete ? 'success' : 'warn'">
        {{ report.complete ? 'responder scan complete' : 'more responder rows' }}
      </Badge>
      <span class="text-[11px] text-muted-foreground">generation {{ report.generation }}</span>
    </div>

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Observed" :value="formatNumber(report.observed)" />
      <StatCard label="Attachment gaps" :value="formatNumber(report.gaps.length)" />
      <StatCard label="Registered" :value="formatNumber(report.registered)" />
      <StatCard label="Quarantined" :value="formatNumber(report.quarantined)" />
      <StatCard label="Absent" :value="formatNumber(report.absent)" />
      <StatCard label="Reference only" :value="formatNumber(report.reference_only)" />
      <StatCard label="Deleted" :value="formatNumber(report.deleted)" />
    </div>

    <div v-if="report.target_policies.length" class="rounded-md border border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
      <div class="font-medium text-foreground">Compared with these residency policy refs</div>
      <div v-for="policy in report.target_policies" :key="`${policy.policy_id}:${policy.digest}`" class="mt-1 font-mono" :title="`${policy.policy_id}:${policy.digest}`">
        {{ policy.policy_id }} / {{ truncateMiddle(policy.digest, 10, 8) }}
      </div>
    </div>

    <div v-if="report.gaps.length" class="overflow-x-auto rounded-md border border-border">
      <table class="w-full min-w-[620px] text-left text-xs">
        <thead class="border-b border-border bg-muted/40 text-muted-foreground">
          <tr>
            <th class="px-3 py-2 font-medium">Key</th>
            <th class="px-3 py-2 font-medium">Version</th>
            <th class="px-3 py-2 font-medium">Attachment</th>
            <th class="px-3 py-2 font-medium">Local copy state</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr v-for="gap in report.gaps" :key="`${gap.key}:${gap.version_id}`">
            <td class="px-3 py-2 font-mono">{{ gap.key }}</td>
            <td class="px-3 py-2 font-mono" :title="gap.version_id">{{ truncateMiddle(gap.version_id) }}</td>
            <td class="px-3 py-2"><Badge :variant="gap.attachment === 'missing' ? 'destructive' : 'warn'">{{ gap.attachment.replaceAll('_', ' ') }}</Badge></td>
            <td class="px-3 py-2">{{ gap.copy?.replaceAll('_', ' ') ?? 'not reported for historical scope' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <EmptyState v-else title="No attachment gaps in this page" description="This does not claim that every realm copy is compliant." />

    <div data-testid="coverage-limits" class="flex flex-wrap items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
      <span class="font-medium">Report caveats:</span>
      <Badge v-for="limit in report.limits" :key="limit" variant="warn">{{ coverageLimitLabel(limit) }}</Badge>
      <span v-if="!report.limits.length">No additional backend caveats were returned; completion is still responder-local.</span>
    </div>
    <p class="text-[11px] text-muted-foreground">
      Complete means this responder's bounded iterator was exhausted. It never means realm-wide convergence.
    </p>
  </div>
</template>
