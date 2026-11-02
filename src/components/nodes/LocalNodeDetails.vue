<script setup lang="ts">
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import DetailList from '@/components/ui/DetailList.vue'
import InfoHint from '@/components/ui/InfoHint.vue'
import QuotaBar from '@/components/ui/QuotaBar.vue'
import { readableWarning, statusProblem, warningPeer } from './node-display'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { CircleCheck, Database, ExternalLink, HardDrive, Network, Tag, TriangleAlert, Users } from '@lucide/vue'
import { backendQuota } from '@/lib/storage'
import { formatBytes } from '@/lib/utils'
import type { InfoResponse } from '@/lib/api'
import Notice from '@/components/ui/Notice.vue'

/**
 * `publicApi` and `publicS3` are the addresses the node published in the realm; they come before the
 * ones it reports itself. A device (`device`) listens on this computer only, so its addresses are
 * local and `realmApi` names where tools reach the realm.
 */
const props = defineProps<{
  info: InfoResponse
  publicApi?: string | null
  publicS3?: string | null
  device?: boolean
  realmApi?: string | null
}>()

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

const details = computed(() => [
  { label: 'API version', value: props.info.api_version || '-', mono: true },
  { label: 'Portal', value: portalValue.value },
  ...(portal.value?.source ? [{ label: 'Portal source', value: portal.value.source }] : []),
  { label: 'Connections', value: String(connectionCount.value ?? '-') },
])

const connectionCount = computed(() => {
  const connections = props.info.connections
  if (typeof connections === 'number') return connections
  if (Array.isArray(connections)) return connections.length
  if (connections && typeof connections === 'object') return Object.keys(connections).length
  return undefined
})

// A published address first, then the node's own, then its listen address.
const address = (published: string | null | undefined, own: { url?: string | null; bind?: string | null }) =>
  published || own.url || own.bind || ''
const restUrl = computed(() => address(props.publicApi, props.info.services.interfaces.rest))
// The node serves OAI-PMH under its REST base (aruna api/src/routes/oai.rs), never under a listen
// address; no one harvests a device.
const oaiUrl = computed(() => {
  const base = props.publicApi || props.info.services.interfaces.rest.url
  return base ? `${base.replace(/\/+$/, '')}/oai` : ''
})

const interfaces = computed(() => [
  { label: 'REST', status: props.info.services.interfaces.rest.status, url: restUrl.value },
  { label: 'S3', status: props.info.services.interfaces.s3.status, url: address(props.publicS3, props.info.services.interfaces.s3) },
  ...(props.device
    ? props.realmApi ? [{ label: 'Realm API', status: 'available', url: props.realmApi }] : []
    : [{ label: 'OAI-PMH', status: props.info.services.interfaces.rest.status, url: oaiUrl.value, oai: true }]),
])


const SERVICE = { network: { label: 'Network', icon: Network }, blob: { label: 'Blob storage', icon: HardDrive }, database: { label: 'Database', icon: Database } }
const services = computed(() =>
  (['network', 'blob', 'database'] as const)
    .map((name) => ({ name, ...SERVICE[name], status: props.info.services[name]?.status }))
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

// Peer ids in warnings read as node names; the raw text stays behind a hint.
// Devices are often offline: the Devices card counts them, so no warning names one.
const { displayName, nodeById } = useRealmNodes()
const warnings = computed(() =>
  props.info.warnings.filter((text) => nodeById(warningPeer(text))?.kind !== 'user').map((text) => readableWarning(text, displayName)),
)
const META = 'flex flex-wrap items-center gap-x-5 gap-y-1 type-secondary [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1.5 [&_svg]:size-3.5'
</script>

<template>
  <div class="space-y-4">
    <DetailList :items="details" class="sm:grid-cols-4" />

    <div>
      <h2 class="flex items-center gap-1.5 font-display text-sm font-semibold text-aruna-navy">
        {{ device ? 'Local addresses' : 'Interfaces' }}
        <InfoHint :label="device ? 'Tools on this computer can connect here.' : 'OAI-PMH lets other services collect the metadata of public datasets.'" />
      </h2>
      <ul class="mt-1.5 space-y-1.5">
        <li
          v-for="iface in interfaces"
          :key="iface.label"
          class="flex items-center gap-2 rounded-md border border-border/70 bg-background/60 px-2.5 py-1.5"
        >
          <span class="min-w-16 shrink-0 whitespace-nowrap text-xs font-medium text-foreground">{{ iface.label }}</span>
          <!-- One state word per interface, as for the services; a problem reads in red. -->
          <span :class="['shrink-0 text-xs', statusProblem(iface.status) ? 'text-destructive' : 'text-foreground']">{{ (iface.status || 'unknown').replace(/_/g, ' ') }}</span>
          <span class="min-w-0 flex-1 truncate text-right font-mono text-xs text-muted-foreground" :title="iface.url">
            {{ iface.url || '-' }}
          </span>
          <template v-if="'oai' in iface && iface.url">
            <CopyButton :value="iface.url" label="Copy OAI-PMH base URL" />
            <Button variant="outline" size="sm" class="h-7 shrink-0" as-child>
              <a :href="`${iface.url}?verb=Identify`" target="_blank" rel="noopener"><ExternalLink class="size-3.5" /> Identify</a>
            </Button>
          </template>
        </li>
      </ul>
    </div>

    <div v-if="services.length">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Services</h2>
      <p :class="['mt-1.5', META]">
        <span v-for="service in services" :key="service.name">
          <component :is="service.icon" aria-hidden="true" />{{ service.label }}
          <!-- One state word per service; a problem reads in red. -->
          <span :class="statusProblem(service.status) ? 'text-destructive' : 'text-foreground'">{{ service.status!.replace(/_/g, ' ') }}</span>
        </span>
      </p>
    </div>

    <div v-if="backends.length">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Storage backends</h2>
      <ul class="mt-1.5 space-y-1.5">
        <li
          v-for="backend in backends"
          :key="backend.name"
          class="rounded-md border border-border/70 bg-background/60 px-2.5 py-1.5"
        >
          <div :class="META">
            <span class="font-medium text-foreground">{{ backend.name }}</span>
            <span><HardDrive aria-hidden="true" />{{ backend.backend === 's3' ? 'S3' : backend.backend.charAt(0).toUpperCase() + backend.backend.slice(1) }}</span>
            <span v-if="backend.default"><CircleCheck aria-hidden="true" />Default</span>
            <span v-if="backend.class"><Tag aria-hidden="true" />Class {{ backend.class }}</span>
            <span v-if="backend.allow_tenants" title="Groups can send their uploads to this storage class"><Users aria-hidden="true" />Available to groups</span>
            <span class="flex-1" />
            <!-- A working backend says nothing; a backend with a problem says it in one word. -->
            <span
              v-if="statusProblem(backend.status)"
              class="text-xs"
              :class="statusProblem(backend.status)!.failed ? 'text-destructive' : 'text-amber-700 dark:text-amber-300'"
            >{{ statusProblem(backend.status)!.word }}</span>
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
              class="text-xs text-muted-foreground"
              title="This node does not report how much is stored here, so nothing is rejected for going over."
            >
              Limit {{ formatBytes(backend.quota.quotaBytes) }} · set by the operator, not enforced yet
            </p>
          </div>
        </li>
      </ul>
    </div>

    <div v-if="warnings.length">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Warnings</h2>
      <Notice tone="warning" class="mt-1.5">
        <p v-for="(warning, index) in warnings" :key="index" class="flex items-center gap-1.5">
          <TriangleAlert class="size-3.5 shrink-0" aria-hidden="true" />{{ warning.text }}
          <InfoHint v-if="warning.raw" :label="warning.raw" name="Full warning" />
        </p>
      </Notice>
    </div>
  </div>
</template>
