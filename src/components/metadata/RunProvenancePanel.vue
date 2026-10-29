<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink } from 'vue-router'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import Notice from '@/components/ui/Notice.vue'
import { useAruna } from '@/composables/useAruna'
import { usePortalFeatures } from '@/composables/usePortalFeatures'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useUserDirectory } from '@/composables/useUserDirectory'
import { useS3 } from '@/composables/useS3'
import { featureEnabled } from '@/lib/config'
import { drsDownloadHref, drsObjectHref, isDrsReference } from '@/lib/tes'
import { parseDataIdentity } from '@/lib/crate/dataIdentity'
import { isArunaUserId } from '@/lib/identifiers'
import type { RunCrateFileRef, RunCrateModel } from '@/lib/runCrate'
import { formatBytes, isHttpUrl, shortUserId, truncateMiddle } from '@/lib/utils'
import { Download, ExternalLink as ExternalLinkIcon } from '@lucide/vue'

const props = defineProps<{ run: RunCrateModel }>()

const { apiBaseUrl } = useAruna()
const userDir = useUserDirectory()
const s3 = useS3()
const tesEnabled = computed(() => featureEnabled('tes'))
const { shown } = usePortalFeatures()
const { displayName } = useRealmNodes()

// The agent Person carries a `{ulid}@{realm}` identifier; resolve it to a
// display name through the shared user directory, short id as the fallback.
watch(
  () => props.run.agent?.identifier,
  (id) => {
    if (id) void userDir.resolveUsers([id])
  },
  { immediate: true },
)

const agentLabel = computed(() => {
  const a = props.run.agent
  if (!a) return ''
  if (a.identifier) return userDir.cachedUser(a.identifier)?.name || a.name || shortUserId(a.identifier)
  return a.name || a.id.replace(/^#agent-/, '')
})

// Where "Run by" points: an Aruna `{ulid}@{realm}` id resolves to the
// in-portal user profile (same form AuthorChips links); an http(s) identifier
// (e.g. an ORCID URL) opens externally; otherwise the name stays plain text.
const agentLink = computed(() => {
  const id = props.run.agent?.identifier
  if (isArunaUserId(id)) return { kind: 'user' as const, id }
  if (isHttpUrl(id)) return { kind: 'external' as const, href: id }
  return { kind: 'plain' as const }
})

const instrumentLabel = computed(() => props.run.instrument?.name || props.run.instrument?.identifier || '')
const containerLabel = computed(() => {
  const container = props.run.container
  if (!container) return ''
  if (container.reference) return container.reference
  const repository = [container.registry, container.name].filter(Boolean).join('/')
  if (container.sha256) return `${repository || 'container'}@sha256:${container.sha256}`
  return container.tag ? `${repository}:${container.tag}` : repository
})

// What ran, one row per fact the crate gives; nothing is filled in.
const ranRows = computed(() => {
  const run = props.run
  const rows: { key: string; label: string; value: string; mono?: boolean }[] = []
  const tool = [instrumentLabel.value, run.instrument?.version && !run.instrument.version.startsWith('sha256:') ? run.instrument.version : '']
    .filter(Boolean)
    .join(' ')
  if (tool) rows.push({ key: 'tool', label: 'Tool', value: tool })
  if (containerLabel.value) rows.push({ key: 'image', label: 'Image', value: containerLabel.value, mono: true })
  if (run.command) rows.push({ key: 'command', label: 'Command', value: run.command, mono: true })
  const site = run.site
  if (site) {
    const where = [site.nodeId ? displayName(site.nodeId) : '', site.kind ?? ''].filter(Boolean).join(', ')
    rows.push({ key: 'where', label: 'Where', value: [where, site.reason ?? ''].filter(Boolean).join('. ') })
  }
  const memory = Number(run.ramBytes)
  const resources = [run.cpuCores ? `${run.cpuCores} CPU` : '', Number.isFinite(memory) && memory > 0 ? `${formatBytes(memory)} memory` : '']
    .filter(Boolean)
    .join(', ')
  if (resources) rows.push({ key: 'resources', label: 'Resources', value: resources })
  return rows
})
const startedAt = computed(() => {
  const ms = props.run.startTime ? Date.parse(props.run.startTime) : NaN
  return Number.isFinite(ms) ? new Date(ms).toLocaleString() : props.run.startTime ?? ''
})

// Same link forms TaskDetailPanel resolves for TES outputs, plus any
// workspace-relative refs mapped through the crate's recorded bucket.
type ResolvedLink =
  | { kind: 's3'; bucketId: string; prefix: string }
  | { kind: 'drs'; object: string; download: string }
  | { kind: 'plain' }

function s3Link(bucketId: string, key: string): ResolvedLink {
  // Slash-less parent prefix, matching DataManagerView.navigateTo.
  const prefix = key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : ''
  return { kind: 's3', bucketId, prefix }
}

function resolveRef(ref: RunCrateFileRef): ResolvedLink {
  const url = ref.contentUrl ?? ref.id
  const parsed = parseDataIdentity(ref, s3.endpoint.value).s3
  if (parsed) return s3Link(parsed.bucket, parsed.key)
  if (isDrsReference(url) && !/^drs:\/\//i.test(url)) {
    return { kind: 'drs', object: drsObjectHref(apiBaseUrl.value, url), download: drsDownloadHref(apiBaseUrl.value, url) }
  }
  if (props.run.workspaceBucket && url.startsWith('workspace/')) {
    return s3Link(props.run.workspaceBucket, url.slice('workspace/'.length))
  }
  return { kind: 'plain' }
}

interface FileRow extends RunCrateFileRef {
  link: ResolvedLink
  size: string
}

function toRow(ref: RunCrateFileRef): FileRow {
  const n = Number(ref.contentSize)
  const size = ref.contentSize?.trim() && Number.isFinite(n) ? formatBytes(n) : (ref.contentSize ?? '')
  return { ...ref, link: resolveRef(ref), size }
}

const inputRows = computed(() => props.run.inputs.map(toRow))
const outputRows = computed(() => props.run.outputs.map(toRow))

// One folder all results went to, for the "Saved to" line; null when they are spread out.
const savedTo = computed(() => {
  const links = outputRows.value.map((row) => row.link)
  const first = links[0]
  if (!first || first.kind !== 's3') return null
  return links.every((link) => link.kind === 's3' && link.bucketId === first.bucketId && link.prefix === first.prefix) ? first : null
})

function inputNote(row: FileRow): string {
  return [row.version ? `release ${row.version}` : '', row.identifier ? `DOI ${row.identifier}` : ''].filter(Boolean).join(', ')
}
</script>

<template>
  <div class="space-y-4" aria-label="Run record">
    <Notice v-if="run.error" tone="error">{{ run.error }}</Notice>
    <div class="grid gap-4 lg:grid-cols-2">
      <section v-for="stage in [{ key: 'inputs', label: 'Inputs', rows: inputRows, empty: 'No declared inputs.' }, { key: 'outputs', label: 'Results', rows: outputRows, empty: 'No results were captured.' }]" :key="stage.key" class="surface p-5">
        <h2 class="mb-3 font-display text-sm font-semibold text-aruna-navy">{{ stage.label }}</h2>
        <p v-if="!stage.rows.length" class="text-xs text-muted-foreground">{{ stage.empty }}</p>
        <table v-else class="w-full text-left text-xs">
          <tbody class="divide-y divide-border">
            <tr v-for="row in stage.rows" :key="row.id">
              <td class="py-2 pr-4 font-medium">
                <RouterLink
                  v-if="row.link.kind === 's3'"
                  class="break-all text-primary hover:underline"
                  :to="{ name: 'bucket', params: { bucketId: row.link.bucketId }, query: row.link.prefix ? { prefix: row.link.prefix } : {} }"
                  :title="row.id"
                >{{ row.name }}</RouterLink>
                <span v-else-if="row.link.kind === 'drs'" class="inline-flex items-center gap-1.5">
                  <a class="inline-flex items-center gap-1 break-all text-primary hover:underline" :href="row.link.object" target="_blank" rel="noopener noreferrer">{{ truncateMiddle(row.name, 24, 12) }} <ExternalLinkIcon class="h-3 w-3" /></a>
                  <a class="text-muted-foreground hover:text-foreground" :href="row.link.download" target="_blank" rel="noopener noreferrer" :aria-label="`Download ${row.name}`"><Download class="h-3.5 w-3.5" /></a>
                </span>
                <span v-else class="break-all" :title="row.id">{{ row.name }}</span>
              </td>
              <td v-if="stage.key === 'inputs'" class="py-2 pr-4 text-muted-foreground">{{ inputNote(row) }}</td>
              <td class="whitespace-nowrap py-2 text-right tabular-nums text-muted-foreground">{{ row.size }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="stage.key === 'outputs' && savedTo" class="mt-3 text-xs text-muted-foreground">
          Saved to
          <RouterLink
            class="font-mono text-primary hover:underline"
            :to="{ name: 'bucket', params: { bucketId: savedTo.bucketId }, query: savedTo.prefix ? { prefix: savedTo.prefix } : {} }"
          >{{ savedTo.bucketId }}/{{ savedTo.prefix ? `${savedTo.prefix}/` : '' }}</RouterLink>
        </p>
      </section>
    </div>
    <section class="surface p-5">
      <h2 class="mb-3 font-display text-sm font-semibold text-aruna-navy">What ran</h2>
      <dl class="grid gap-x-8 gap-y-2 text-xs sm:grid-cols-[8rem_1fr]">
        <template v-for="row in ranRows" :key="row.key">
          <dt class="text-muted-foreground">{{ row.label }}</dt>
          <dd :class="row.mono ? 'whitespace-pre-wrap break-all font-mono text-[11px]' : 'text-foreground'">
            <ExternalLink v-if="row.key === 'tool' && run.instrument?.identifier && isHttpUrl(run.instrument.identifier)" :href="run.instrument.identifier" :label="row.value" />
            <a v-else-if="row.key === 'image' && run.container?.url" :href="run.container.url" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-primary hover:underline">{{ row.value }} <ExternalLinkIcon class="h-3 w-3 shrink-0" /></a>
            <template v-else>{{ row.value }}</template>
          </dd>
        </template>
        <template v-if="agentLabel">
          <dt class="text-muted-foreground">Started by</dt>
          <dd :title="run.agent?.identifier || run.agent?.id">
            <RouterLink v-if="agentLink.kind === 'user'" class="text-primary hover:underline" :to="{ name: 'user', params: { id: agentLink.id } }">{{ agentLabel }}</RouterLink>
            <ExternalLink v-else-if="agentLink.kind === 'external'" :href="agentLink.href" :label="agentLabel" />
            <span v-else>{{ agentLabel }}</span><template v-if="startedAt">, {{ startedAt }}</template>
          </dd>
        </template>
        <template v-if="run.workspaceBucket">
          <dt class="text-muted-foreground">Workspace</dt>
          <dd><RouterLink class="font-mono text-primary hover:underline" :to="{ name: 'bucket', params: { bucketId: run.workspaceBucket } }">{{ run.workspaceBucket }}</RouterLink></dd>
        </template>
        <template v-if="tesEnabled && run.runId && shown('compute')">
          <dt class="text-muted-foreground">Run</dt>
          <dd><RouterLink class="text-primary hover:underline" :to="{ name: 'task', params: { taskId: run.runId } }">Open the run</RouterLink></dd>
        </template>
      </dl>
      <p v-if="!ranRows.length && !agentLabel" class="text-xs text-muted-foreground">No details of the run were recorded.</p>
    </section>
  </div>
</template>
