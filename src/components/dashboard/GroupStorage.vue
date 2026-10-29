<script setup lang="ts">
// One group's storage: the bar against its quota, if it has one, then used, share and referenced.
import QuotaBar from '@/components/ui/QuotaBar.vue'
import type { GroupUsageEntry } from '@/composables/useMyGroupsUsage'
import { formatBytes } from '@/lib/utils'

const props = defineProps<{ entry: GroupUsageEntry }>()

function quotaPercent(): number {
  const quota = props.entry.quota?.quota_bytes
  if (quota == null || quota <= 0) return 0
  return Math.round(((props.entry.usedBytes ?? 0) / quota) * 100)
}
</script>

<template>
  <div>
    <QuotaBar
      :used="entry.usedBytes ?? 0"
      :quota="entry.quota?.quota_bytes ?? null"
      :ceiling="entry.quota?.ceiling_bytes"
      :referenced="entry.referencedBytes ?? 0"
      :warn="entry.quota?.warning"
      :show-labels="false"
    />
    <div class="mt-1.5 flex flex-wrap items-baseline gap-x-3 text-[11px] tabular-nums">
      <span v-if="entry.quota?.quota_bytes != null">
        <span class="font-medium text-foreground">{{ formatBytes(entry.usedBytes ?? 0) }}</span>
        <span class="text-muted-foreground"> of {{ formatBytes(entry.quota.quota_bytes) }}</span>
      </span>
      <span v-else>
        <span class="font-medium text-foreground">{{ formatBytes(entry.usedBytes ?? 0) }}</span>
        <span class="text-muted-foreground"> stored, no quota</span>
      </span>
      <span v-if="entry.quota?.quota_bytes != null" class="text-muted-foreground">{{ quotaPercent() }}%</span>
      <span v-if="entry.referencedBytes" class="text-muted-foreground">
        <span class="font-medium text-foreground">{{ formatBytes(entry.referencedBytes) }}</span> referenced
      </span>
    </div>
  </div>
</template>
