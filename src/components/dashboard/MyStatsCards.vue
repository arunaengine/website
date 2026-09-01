<script setup lang="ts">
// Personal tiles: the aggregate over the caller's group memberships. The tile
// markup mirrors StatCard, which has no slot for the quota badge.
import { computed, watch } from 'vue'
import { Bell, Database, Files, FileJson2, FolderOpen, Users } from '@lucide/vue'
import Badge from '@/components/ui/Badge.vue'
import Notice from '@/components/ui/Notice.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useMyGroupsUsage } from '@/composables/useMyGroupsUsage'
import { useNotifications } from '@/composables/useNotifications'
import { QUOTA_STATE_BADGES } from '@/lib/quota'
import { formatCount } from '@/lib/formatCount'
import { formatBytes } from '@/lib/utils'

const { aggregate, membershipKey, load } = useMyGroupsUsage()
const { available: notificationsAvailable, unreadCount } = useNotifications()

function count(value: number | null): string {
  return value == null ? 'Unknown' : formatCount(value)
}

const quotaBadge = computed(() =>
  aggregate.value.worstState ? QUOTA_STATE_BADGES[aggregate.value.worstState] : null,
)

interface Tile {
  key: string
  label: string
  value: string
  hint?: string
  icon: unknown
  badge?: (typeof QUOTA_STATE_BADGES)[keyof typeof QUOTA_STATE_BADGES]
}

const tiles = computed<Tile[]>(() => {
  const totals = aggregate.value
  const rows: Tile[] = [
    { key: 'datasets', label: 'Datasets', value: count(totals.datasets), icon: FileJson2 },
    {
      key: 'storage',
      label: 'Storage used',
      value: totals.usedBytes == null ? 'Unknown' : formatBytes(totals.usedBytes),
      hint: 'Counted against your group quotas',
      icon: Database,
      badge: quotaBadge.value,
    },
    { key: 'buckets', label: 'Buckets', value: count(totals.buckets), icon: FolderOpen },
    { key: 'objects', label: 'Objects', value: count(totals.objects), icon: Files },
    { key: 'groups', label: 'Groups', value: formatCount(totals.groups), icon: Users },
  ]
  if (notificationsAvailable.value) {
    rows.push({ key: 'unread', label: 'Unread notifications', value: formatCount(unreadCount.value), icon: Bell })
  }
  return rows
})

watch(membershipKey, () => void load(), { immediate: true })
</script>

<template>
  <div class="space-y-3.5">
    <div class="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      <template v-if="aggregate.pending">
        <Skeleton v-for="n in 6" :key="n" class="h-[108px]" />
      </template>
      <template v-else>
        <div
          v-for="tile in tiles"
          :key="tile.key"
          class="surface flex flex-col gap-1.5 p-4 transition-colors hover:border-primary/40"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">{{ tile.label }}</span>
            <component :is="tile.icon" class="h-4 w-4 shrink-0 text-muted-foreground/80" />
          </div>
          <div class="flex flex-wrap items-baseline gap-2">
            <span class="font-display text-2xl font-semibold text-aruna-navy">{{ tile.value }}</span>
            <Badge v-if="tile.badge" :variant="tile.badge.variant" size="sm" class="uppercase">
              {{ tile.badge.label }}
            </Badge>
          </div>
          <div v-if="tile.hint" class="text-xs text-muted-foreground">{{ tile.hint }}</div>
        </div>
      </template>
    </div>

    <Notice v-if="aggregate.failed.length" tone="warning">
      Totals stay unknown while the storage of {{ aggregate.failed.join(', ') }} cannot be read.
    </Notice>
  </div>
</template>
