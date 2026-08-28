<script setup lang="ts">
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import QuotaBar from '@/components/ui/QuotaBar.vue'
import { statusVariant } from './node-display'
import { backendQuota } from '@/lib/storage'
import { formatBytes } from '@/lib/utils'
import type { InfoResponse } from '@/lib/api'
import Notice from '@/components/ui/Notice.vue'

const props = defineProps<{ info: InfoResponse }>()

interface Fact {
  label: string
  value: string
  // Optional hover tooltip; falls back to the value when omitted.
  title?: string
}

const portal = computed(() => props.info.portal)

// Three honest portal states. `installed: false` is the only case where the
// node itself verifiably reports that no portal is present. A missing portal
// block means the status was not reported at all: a remote node is probed
// directly and its /info is not augmented by the connected portal node, so
// the browser cannot know its portal status. That must read as "unknown",
// never "not installed".
const portalValue = computed(() => {
  const p = portal.value
  if (!p) return 'unknown'
  if (!p.installed) return 'not installed'
  return p.version || 'unknown version'
})

const portalTitle = computed(() =>
  portal.value ? portalValue.value : 'Portal status not reported for this node',
)

const facts = computed<Fact[]>(() => [
  { label: 'API version', value: props.info.api_version || '-' },
  { label: 'Portal', value: portalValue.value, title: portalTitle.value },
  { label: 'Portal source', value: portal.value?.source || '-' },
  { label: 'Connections', value: String(connectionCount.value ?? '-') },
])

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

// Every registered write backend, each with its capacity reading. Absent on
// nodes that predate configurable storage, so the block is presence-gated.
const backends = computed(() =>
  (props.info.services.blob?.backends ?? []).map((backend) => ({
    ...backend,
    quota: backendQuota(backend),
  })),
)
</script>

<template>
  <div class="space-y-4">
    <dl class="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      <div v-for="fact in facts" :key="fact.label">
        <dt class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ fact.label }}</dt>
        <dd class="mt-0.5 truncate font-mono text-xs tabular-nums text-foreground/90" :title="fact.title ?? fact.value">{{ fact.value }}</dd>
      </div>
    </dl>

    <div>
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Interfaces</h2>
      <ul class="mt-1.5 space-y-1.5">
        <li
          v-for="iface in interfaces"
          :key="iface.label"
          class="flex items-center gap-2 rounded-md border border-border/70 bg-background/60 px-2.5 py-1.5"
        >
          <span class="w-10 shrink-0 text-xs font-medium text-foreground">{{ iface.label }}</span>
          <Badge size="sm" :variant="statusVariant(iface.status)" class="shrink-0 uppercase">{{ iface.status || 'unknown' }}</Badge>
          <span class="min-w-0 flex-1 truncate text-right font-mono text-[11px] text-muted-foreground" :title="iface.url || iface.bind || ''">
            {{ iface.url || iface.bind || '-' }}
          </span>
        </li>
      </ul>
    </div>

    <div v-if="services.length">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Services</h2>
      <div class="mt-1.5 flex flex-wrap gap-2">
        <span
          v-for="service in services"
          :key="service.name"
          class="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background/60 px-2 py-1 text-xs text-foreground"
        >
          {{ service.name }}
          <Badge size="sm" :variant="statusVariant(service.status)" class="uppercase">{{ service.status }}</Badge>
        </span>
      </div>
    </div>

    <div v-if="backends.length">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Storage backends</h2>
      <ul class="mt-1.5 space-y-1.5">
        <li
          v-for="backend in backends"
          :key="backend.name"
          class="rounded-md border border-border/70 bg-background/60 px-2.5 py-1.5"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-medium text-foreground">{{ backend.name }}</span>
            <Badge size="sm" variant="secondary" class="uppercase">{{ backend.backend }}</Badge>
            <Badge v-if="backend.default" size="sm" variant="royal" class="uppercase">default</Badge>
            <Badge v-if="backend.class" size="sm" variant="outline">class {{ backend.class }}</Badge>
            <Badge size="sm"
              v-if="backend.allow_tenants"
              variant="accent"
              class="uppercase"
              title="Groups can send their uploads to this storage class"
            >
              available to groups
            </Badge>
            <span class="flex-1" />
            <Badge size="sm" :variant="statusVariant(backend.status)" class="uppercase">{{ backend.status }}</Badge>
          </div>
          <div class="mt-1">
            <QuotaBar
              v-if="backend.quota.enforced"
              :used="backend.quota.usedBytes ?? 0"
              :quota="backend.quota.quotaBytes"
              compact
              label="Stored"
            />
            <p
              v-else-if="backend.quota.quotaBytes != null"
              class="text-[11px] text-muted-foreground"
              title="This node does not report how much is stored here, so nothing is rejected for going over."
            >
              Limit {{ formatBytes(backend.quota.quotaBytes) }} · set by the operator, not enforced yet
            </p>
          </div>
        </li>
      </ul>
    </div>

    <div v-if="info.warnings.length">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Warnings</h2>
      <Notice tone="warning" class="mt-1.5" :lines="info.warnings" />
    </div>
  </div>
</template>
