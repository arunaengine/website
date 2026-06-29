<script setup lang="ts">
import QuotaBar from '@/components/ui/QuotaBar.vue'
import { CircleCheck, CircleAlert, CircleOff, Loader2 } from '@lucide/vue'
import { computed } from 'vue'
import type { Node } from '@/data/types'

const props = defineProps<{ nodes: Node[]; color?: string; limit?: number }>()

const iconFor = {
  healthy: CircleCheck,
  degraded: CircleAlert,
  offline: CircleOff,
  syncing: Loader2,
} as const

const toneFor = {
  healthy: 'text-emerald-600',
  degraded: 'text-amber-600',
  offline: 'text-rose-500',
  syncing: 'text-primary animate-spin',
} as const

const sorted = computed(() =>
  [...props.nodes].sort((a, b) => {
    const order = { offline: 0, degraded: 1, syncing: 2, healthy: 3 } as const
    return order[a.status] - order[b.status]
  }),
)
</script>

<template>
  <ul class="divide-y divide-border">
    <li
      v-for="n in sorted.slice(0, limit ?? 20)"
      :key="n.id"
      class="flex items-center gap-3 px-5 py-3 text-sm"
    >
      <component :is="iconFor[n.status]" :class="['h-4 w-4 shrink-0', toneFor[n.status]]" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="truncate font-medium text-foreground">{{ n.name }}</span>
          <span class="text-[11px] text-muted-foreground">{{ n.country }}</span>
        </div>
        <div class="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
          {{ n.endpoint }}
        </div>
      </div>
      <div class="w-40 shrink-0">
        <QuotaBar
          :used="n.storageUsedBytes"
          :quota="n.storageQuotaBytes"
          :color="color"
          compact
          :show-labels="true"
          label=""
        />
      </div>
    </li>
    <li
      v-if="!sorted.length"
      class="px-5 py-6 text-center text-xs text-muted-foreground"
    >
      This realm has no nodes yet.
    </li>
  </ul>
</template>
