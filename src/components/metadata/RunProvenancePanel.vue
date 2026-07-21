<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import { useAruna } from '@/composables/useAruna'
import { useUserDirectory } from '@/composables/useUserDirectory'
import { useS3 } from '@/composables/useS3'
import { featureEnabled } from '@/lib/config'
import { drsDownloadHref, drsObjectHref, isDrsReference, parseS3Url } from '@/lib/tes'
import type { RunCrateFileRef, RunCrateModel } from '@/lib/runCrate'
import { formatBytes, isHttpUrl, relativeTime, shortUserId, truncateMiddle } from '@/lib/utils'
import { Cpu, Download, ExternalLink as ExternalLinkIcon, FileInput, FileOutput, HardDrive, Play, Terminal } from '@lucide/vue'

const props = defineProps<{ run: RunCrateModel }>()

const { apiBaseUrl } = useAruna()
const userDir = useUserDirectory()
const s3 = useS3()
const tesEnabled = computed(() => featureEnabled('tes'))

const status = computed(() => {
  const s = props.run.actionStatus
  if (s === 'CompletedActionStatus') return { label: 'succeeded', variant: 'success' as const }
  if (s === 'FailedActionStatus') return { label: 'failed', variant: 'destructive' as const }
  return s ? { label: s, variant: 'outline' as const } : null
})

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

// Where "Submitted by" points: an Aruna `{ulid}@{realm}` id resolves to the
// in-portal user profile (same form AuthorChips links); an http(s) identifier
// (e.g. an ORCID URL) opens externally; otherwise the name stays plain text.
const ARUNA_USER_ID = /^[0-9A-HJKMNP-TV-Z]{26}@[A-Za-z0-9_-]{43}$/
const agentLink = computed(() => {
  const id = props.run.agent?.identifier
  if (id && ARUNA_USER_ID.test(id)) return { kind: 'user' as const, id }
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

function parsedMs(iso: string | undefined): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : null
}

// Malformed timestamps render verbatim instead of "NaNs ago".
function timeLabel(iso: string): string {
  return parsedMs(iso) === null ? iso : relativeTime(iso)
}

const duration = computed(() => {
  const start = parsedMs(props.run.startTime)
  const end = parsedMs(props.run.endTime)
  if (start === null || end === null || end < start) return ''
  const sec = Math.round((end - start) / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ${sec % 60}s`
  return `${Math.floor(min / 60)}h ${min % 60}m`
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
  const parsed = parseS3Url(url, s3.endpoint.value)
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

const flow = computed(() => [
  {
    key: 'inputs',
    label: 'Input files',
    icon: FileInput,
    rows: inputRows.value,
    empty: 'No declared inputs.',
  },
  {
    key: 'outputs',
    label: 'Output files',
    icon: FileOutput,
    rows: outputRows.value,
    empty: 'No outputs were captured.',
  },
])
</script>

<template>
  <section class="surface overflow-hidden" aria-label="Run provenance">
    <div class="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3.5 text-sm font-medium text-foreground">
      <Play class="h-4 w-4 text-primary" /> {{ run.actionName || run.name || 'Process run' }}
      <Badge v-if="status" :variant="status.variant" class="text-[10px] uppercase">{{ status.label }}</Badge>
      <RouterLink
        v-if="tesEnabled && run.runId"
        class="ml-auto inline-flex items-center gap-1.5 text-xs font-normal text-primary hover:underline"
        :to="{ name: 'compute-task', params: { taskId: run.runId } }"
      >
        <Cpu class="h-3.5 w-3.5" /> Open compute task
      </RouterLink>
    </div>

    <dl class="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
      <div v-if="run.runId" class="min-w-0">
        <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">Compute task ID</dt>
        <dd class="mt-1 font-mono text-[11px] text-foreground" :title="run.runId">{{ truncateMiddle(run.runId, 18, 10) }}</dd>
      </div>
      <div v-if="agentLabel" class="min-w-0">
        <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">Submitted by</dt>
        <dd class="mt-1 break-all text-sm" :title="run.agent?.identifier || run.agent?.id">
          <RouterLink
            v-if="agentLink.kind === 'user'"
            class="text-primary hover:underline"
            :to="{ name: 'user-profile', params: { id: agentLink.id } }"
          >
            {{ agentLabel }}
          </RouterLink>
          <ExternalLink v-else-if="agentLink.kind === 'external'" :href="agentLink.href" :label="agentLabel" />
          <span v-else class="text-foreground">{{ agentLabel }}</span>
        </dd>
      </div>
      <div v-if="run.workspaceBucket" class="min-w-0">
        <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">Workspace</dt>
        <dd class="mt-1">
          <RouterLink
            class="inline-flex max-w-full items-center gap-1 break-all font-mono text-[11px] text-primary hover:underline"
            :to="{ name: 'bucket', params: { bucketId: run.workspaceBucket } }"
          >
            <HardDrive class="h-3 w-3 shrink-0" /> {{ run.workspaceBucket }}
          </RouterLink>
        </dd>
      </div>
      <div v-if="run.startTime">
        <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">Started</dt>
        <dd class="mt-1 text-sm text-foreground" :title="run.startTime">{{ timeLabel(run.startTime) }}</dd>
      </div>
      <div v-if="run.endTime">
        <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">Finished</dt>
        <dd class="mt-1 text-sm text-foreground" :title="run.endTime">{{ timeLabel(run.endTime) }}</dd>
      </div>
      <div v-if="duration">
        <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">Duration</dt>
        <dd class="mt-1 text-sm text-foreground">{{ duration }}</dd>
      </div>
    </dl>

    <p v-if="run.error" class="mx-5 mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ run.error }}</p>

    <div class="space-y-4 border-t border-border px-5 py-4">
      <template v-for="(stage, i) in flow" :key="stage.key">
        <!-- Executor sits between inputs and outputs, mirroring the data flow. -->
        <div v-if="i === 1" class="rounded-md border border-border bg-muted/30 p-3">
          <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Terminal class="h-3.5 w-3.5" /> Executor
          </div>
          <dl v-if="instrumentLabel || containerLabel || run.command" class="mt-2 space-y-2 text-xs">
            <div v-if="instrumentLabel">
              <dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Software</dt>
              <dd class="mt-0.5 break-all text-foreground"><ExternalLink :href="instrumentLabel" :label="instrumentLabel" /></dd>
            </div>
            <div v-if="containerLabel">
              <dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Container image</dt>
              <dd class="mt-0.5 break-all font-mono text-[11px]">
                <a v-if="run.container?.url" :href="run.container.url" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-primary hover:underline">
                  {{ containerLabel }} <ExternalLinkIcon class="h-3 w-3 shrink-0" />
                </a>
                <span v-else class="text-foreground">{{ containerLabel }}</span>
              </dd>
            </div>
            <div v-if="run.command">
              <dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Command</dt>
              <dd class="mt-0.5 whitespace-pre-wrap break-all font-mono text-[11px] text-foreground">{{ run.command }}</dd>
            </div>
          </dl>
          <p v-else class="mt-2 text-xs text-muted-foreground">No executor details recorded.</p>
        </div>

        <div>
          <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <component :is="stage.icon" class="h-3.5 w-3.5" /> {{ stage.label }}
            <span v-if="stage.rows.length" class="font-normal normal-case">{{ stage.rows.length }}</span>
          </div>
          <p v-if="!stage.rows.length" class="mt-2 text-xs text-muted-foreground">{{ stage.empty }}</p>
          <ul v-else class="mt-2 space-y-1.5">
            <li v-for="row in stage.rows" :key="row.id" class="flex flex-wrap items-center gap-2 text-[11px]">
              <RouterLink
                v-if="row.link.kind === 's3'"
                class="break-all font-mono text-primary hover:underline"
                :to="{ name: 'bucket', params: { bucketId: row.link.bucketId }, query: row.link.prefix ? { prefix: row.link.prefix } : {} }"
                :title="row.id"
              >
                {{ row.name }}
              </RouterLink>
              <template v-else-if="row.link.kind === 'drs'">
                <a class="inline-flex items-center gap-1 break-all font-mono text-primary hover:underline" :href="row.link.object" target="_blank" rel="noopener noreferrer">{{ truncateMiddle(row.name, 24, 12) }} <ExternalLinkIcon class="h-3 w-3" /></a>
                <a class="text-muted-foreground hover:text-foreground" :href="row.link.download" target="_blank" rel="noopener noreferrer" :aria-label="`Download ${row.name}`"><Download class="h-3.5 w-3.5" /></a>
              </template>
              <span v-else class="break-all font-mono text-muted-foreground" :title="row.id">{{ row.name }}</span>
              <span v-if="row.size" class="text-muted-foreground">{{ row.size }}</span>
            </li>
          </ul>
        </div>
      </template>
    </div>
  </section>
</template>
