<script setup lang="ts">
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import { statusVariant } from './node-display'
import type { InfoResponse } from '@/lib/api'
import { TriangleAlert } from '@lucide/vue'

const props = defineProps<{ info: InfoResponse }>()

const facts = computed(() => {
  const portal = props.info.portal
  const portalVersion = portal?.installed ? portal.version || 'unknown version' : 'not installed'
  return [
    { label: 'API version', value: props.info.api_version || '—' },
    { label: 'Portal', value: portalVersion },
    { label: 'Portal source', value: portal?.source || '—' },
    { label: 'Connections', value: connectionCount.value ?? '—' },
  ]
})

const connectionCount = computed(() => {
  const connections = props.info.connections
  if (typeof connections === 'number') return connections
  if (Array.isArray(connections)) return connections.length
  if (connections && typeof connections === 'object') return Object.keys(connections).length
  return undefined
})

const interfaces = computed(() => [
  { label: 'REST', ...props.info.services.interfaces.rest },
  { label: 'S3', ...props.info.services.interfaces.s3 },
])

const services = computed(() =>
  (['network', 'blob', 'database'] as const)
    .map((name) => ({ name, status: props.info.services[name]?.status }))
    .filter((service) => service.status),
)
</script>

<template>
  <div class="space-y-4">
    <dl class="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      <div v-for="fact in facts" :key="fact.label">
        <dt class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ fact.label }}</dt>
        <dd class="mt-0.5 truncate font-mono text-xs tabular-nums text-foreground/90" :title="String(fact.value)">{{ fact.value }}</dd>
      </div>
    </dl>

    <div>
      <div class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Interfaces</div>
      <ul class="mt-1.5 space-y-1.5">
        <li
          v-for="iface in interfaces"
          :key="iface.label"
          class="flex items-center gap-2 rounded-md border border-border/70 bg-background/60 px-2.5 py-1.5"
        >
          <span class="w-10 shrink-0 text-xs font-medium text-foreground">{{ iface.label }}</span>
          <Badge :variant="statusVariant(iface.status)" class="shrink-0 text-[10px] uppercase">{{ iface.status || 'unknown' }}</Badge>
          <span class="min-w-0 flex-1 truncate text-right font-mono text-[11px] text-muted-foreground" :title="iface.url || iface.bind || ''">
            {{ iface.url || iface.bind || '—' }}
          </span>
        </li>
      </ul>
    </div>

    <div v-if="services.length">
      <div class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Services</div>
      <div class="mt-1.5 flex flex-wrap gap-2">
        <span
          v-for="service in services"
          :key="service.name"
          class="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background/60 px-2 py-1 text-xs text-foreground"
        >
          {{ service.name }}
          <Badge :variant="statusVariant(service.status)" class="text-[10px] uppercase">{{ service.status }}</Badge>
        </span>
      </div>
    </div>

    <div v-if="info.warnings.length">
      <div class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Warnings</div>
      <ul class="mt-1.5 space-y-1">
        <li
          v-for="(warning, index) in info.warnings"
          :key="index"
          class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300"
        >
          <TriangleAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span class="min-w-0 break-words">{{ warning }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>
