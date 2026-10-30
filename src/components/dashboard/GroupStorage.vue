<script setup lang="ts">
// One group's storage: used against the quota with its share, or "no quota", and referenced data.
// The bar shows only for a group that has a quota; `compact` is the slim one of tables and lists.
import { HardDrive, Link } from '@lucide/vue'
import QuotaBar from '@/components/ui/QuotaBar.vue'
import type { GroupUsageEntry } from '@/composables/useMyGroupsUsage'
import { formatBytes } from '@/lib/utils'

const props = defineProps<{ entry: GroupUsageEntry; compact?: boolean }>()

function quotaPercent(): number {
  const quota = props.entry.quota?.quota_bytes
  if (quota == null || quota <= 0) return 0
  return Math.round(((props.entry.usedBytes ?? 0) / quota) * 100)
}
</script>

<template>
  <div>
    <p class="flex flex-wrap gap-x-5 gap-y-1 tabular-nums type-secondary">
      <span class="inline-flex items-center gap-1.5">
        <HardDrive class="size-3.5 shrink-0" />
        <b class="font-medium text-foreground">{{ formatBytes(entry.usedBytes ?? 0) }}</b>
        <template v-if="entry.quota?.quota_bytes != null">of {{ formatBytes(entry.quota.quota_bytes) }}, {{ quotaPercent() }}%</template>
        <template v-else>stored, no quota</template>
      </span>
      <span v-if="entry.referencedBytes" class="inline-flex items-center gap-1.5">
        <Link class="size-3.5 shrink-0" /><b class="font-medium text-foreground">{{ formatBytes(entry.referencedBytes) }}</b> referenced
      </span>
    </p>
    <QuotaBar
      v-if="entry.quota?.quota_bytes != null"
      :class="compact ? 'mt-1.5 w-48 max-w-full' : 'mt-2.5'"
      :used="entry.usedBytes ?? 0"
      :quota="entry.quota.quota_bytes"
      :ceiling="entry.quota.ceiling_bytes"
      :referenced="entry.referencedBytes ?? 0"
      :warn="entry.quota.warning"
      :compact="compact"
      :show-labels="false"
    />
  </div>
</template>
