<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import DetailList, { type Detail } from '@/components/ui/DetailList.vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import IconTile from '@/components/ui/IconTile.vue'
import ListPager from '@/components/ui/ListPager.vue'
import Notice from '@/components/ui/Notice.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import ObjectIcon from '@/components/data/ObjectIcon.vue'
import { useAruna } from '@/composables/useAruna'
import { usePagedList } from '@/composables/usePagedList'
import { usePortalFeatures } from '@/composables/usePortalFeatures'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useUserDirectory } from '@/composables/useUserDirectory'
import { useS3 } from '@/composables/useS3'
import { featureEnabled } from '@/lib/config'
import { drsDownloadHref, drsObjectHref, isDrsReference } from '@/lib/tes'
import { parseDataIdentity } from '@/lib/crate/dataIdentity'
import { isArunaUserId } from '@/lib/identifiers'
import { groupFiles, sharedFolder, type FileGroup } from '@/lib/fileGroups'
import { sourceHost, type RunCrateFileRef, type RunCrateModel } from '@/lib/runCrate'
import { formatBytes, formatDateTime, formatResourceGb, isHttpUrl, shortUserId, truncateMiddle } from '@/lib/utils'
import { ChevronRight, Download, ExternalLink as ExternalLinkIcon, Files, Folder, LogIn, Terminal } from '@lucide/vue'

// `documentId`: the record's id, named with its API address; `published`: when the record was made.
const props = defineProps<{ run: RunCrateModel; documentId?: string; published?: string }>()

const { apiBaseUrl } = useAruna()
const userDir = useUserDirectory()
const s3 = useS3()
const tesEnabled = computed(() => featureEnabled('tes'))
const { shown } = usePortalFeatures()
const { displayName, isLocalNode, nodes: realmNodes } = useRealmNodes()

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
const ranItems = computed(() => {
  const run = props.run
  const items: Detail[] = []
  const tool = [instrumentLabel.value, run.instrument?.version && !run.instrument.version.startsWith('sha256:') ? run.instrument.version : '']
    .filter(Boolean)
    .join(' ')
  if (tool) items.push({ key: 'tool', label: 'Tool', value: tool })
  if (run.site) items.push({ key: 'where', label: 'Where', value: run.site.nodeId ?? '' })
  if (containerLabel.value) items.push({ key: 'image', label: 'Image', value: containerLabel.value, mono: true })
  const memory = Number(run.ramBytes)
  const resources = [run.cpuCores ? `${run.cpuCores}\u00a0CPU` : '', Number.isFinite(memory) && memory > 0 ? `${formatResourceGb(memory / 1e9)} memory` : '']
    .filter(Boolean)
    .join(', ')
  if (resources) items.push({ key: 'resources', label: 'Resources', value: resources })
  if (agentLabel.value) items.push({ key: 'agent', label: 'Started by', value: agentLabel.value })
  if (props.published) items.push({ key: 'published', label: 'Published', value: formatDateTime(props.published) })
  if (run.workspaceBucket) items.push({ key: 'workspace', label: 'Workspace', value: run.workspaceBucket, mono: true })
  if (props.documentId) {
    items.push({ key: 'record', label: 'Record id', value: props.documentId, mono: true })
    items.push({ key: 'api', label: 'API', value: `${apiBaseUrl.value.replace(/\/+$/, '')}/metadata/${props.documentId}`, mono: true })
  }
  return items
})
// Long digests and ids read shortened in the middle; the copy button and hover keep them whole.
const shortDigest = (value: string) => value.replace(/sha256:([0-9a-f]{64})/i, (_, hex: string) => `sha256:${hex.slice(0, 4)}…${hex.slice(-5)}`)
const executor = (kind: string) => kind.charAt(0).toUpperCase() + kind.slice(1)
const startedAt = computed(() => {
  const ms = props.run.startTime ? Date.parse(props.run.startTime) : NaN
  return Number.isFinite(ms) ? formatDateTime(ms) : props.run.startTime ?? ''
})

// Same link forms TaskDetailPanel resolves for TES outputs, plus any
// workspace-relative refs mapped through the crate's recorded bucket.
type ResolvedLink =
  | { kind: 's3'; bucketId: string; prefix: string; nodeId?: string }
  | { kind: 'drs'; object: string; download: string }
  | { kind: 'plain' }

function s3Link(bucketId: string, key: string, nodeId?: string): ResolvedLink {
  // Slash-less parent prefix, matching DataManagerView.navigateTo.
  const prefix = key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : ''
  return { kind: 's3', bucketId, prefix, ...(nodeId && !isLocalNode(nodeId) ? { nodeId } : {}) }
}

function resolveRef(ref: RunCrateFileRef): ResolvedLink {
  const url = ref.contentUrl ?? ref.id
  const identity = parseDataIdentity(ref, s3.endpoint.value)
  const parsed = identity.s3
  if (parsed) return s3Link(parsed.bucket, parsed.key, identity.arn?.nodeId)
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

const folderRoute = (link: { bucketId: string; prefix: string; nodeId?: string }, run?: string) => ({
  name: 'bucket',
  params: { bucketId: link.bucketId },
  query: { ...(link.prefix ? { prefix: link.prefix } : {}), ...(link.nodeId ? { node: link.nodeId } : {}), ...(run ? { run } : {}) },
})
// The summed size, such as "3.8 GiB"; a size only when every file names one.
function bytesOf(files: RunCrateFileRef[]): string {
  const sizes = files.map((file) => (file.contentSize?.trim() ? Number(file.contentSize) : NaN))
  return files.length && sizes.every((size) => Number.isFinite(size) && size >= 0) ? formatBytes(sizes.reduce((a, b) => a + b, 0)) : ''
}
// A database or a folder of files counts as one input.
const inputSummary = computed(() => {
  const count = groupFiles(props.run.inputs, s3.endpoint.value).length
  return count ? `${count} ${count === 1 ? 'input' : 'inputs'}` : ''
})
// The kinds of the files by their extensions, such as "GBFF, FAA, JSON".
function kindsOf(files: RunCrateFileRef[]): string {
  const kinds = files.map((file) => /\.([a-z0-9]+)(?:\.gz)?$/i.exec(file.name)?.[1]?.toUpperCase()).filter((kind): kind is string => Boolean(kind))
  return [...new Set(kinds)].slice(0, 8).join(', ')
}

// The folder all files of a card lie in, for its summary; null when they are spread out.
function placeOf(files: RunCrateFileRef[]) {
  const found = files.map((file) => parseDataIdentity(file, s3.endpoint.value))
  const first = found[0]
  if (!first?.s3) return null
  const node = first.arn?.nodeId ?? ''
  if (found.some((one) => one.s3?.bucket !== first.s3?.bucket || (one.arn?.nodeId ?? '') !== node)) return null
  const link = s3Link(first.s3.bucket, sharedFolder(found.map((one) => one.s3?.key ?? '')), node || undefined)
  return link.kind === 's3' ? link : null
}

// The device's name by the shared rule (its realm display name first), if the realm lists one.
function deviceName(nodeId: string): string {
  return realmNodes.value.find((node) => node.nodeId === nodeId)?.given ?? ''
}

function fileNote(row: FileRow, inPlace: boolean): string {
  if (row.device) return `from ${deviceName(row.device) || 'a device'}`
  const group = groupFiles([row], s3.endpoint.value)[0]
  if (group?.database || group?.release) return partNote(group, false)
  const legacy = [row.version ? `release ${row.version}` : '', row.identifier ? `DOI ${row.identifier}` : ''].filter(Boolean).join(', ')
  if (legacy) return legacy
  return group?.bucket && !inPlace ? [group.bucket, group.nodeId ? `on ${displayName(group.nodeId)}` : ''].filter(Boolean).join(' ') : ''
}

type CardKey = 'inputs' | 'results'
// One row per database or crowded folder, open until closed. Each card keeps its own state,
// as inputs and results in one bucket share a group key.
const collapsed = ref<Record<CardKey, Set<string>>>({ inputs: new Set(), results: new Set() })
function toggle(card: CardKey, key: string) {
  const next = new Set(collapsed.value[card])
  if (!next.delete(key)) next.add(key)
  collapsed.value = { ...collapsed.value, [card]: next }
}

type ListRow = { kind: 'file'; key: string; row: FileRow; label: string; nested: boolean } | { kind: 'group'; key: string; group: FileGroup }

// A file reads by its name without the path; a grouped file by its path below the shared folder.
// The stored file's own name ("genome.fasta") says more than the input's name ("genome").
function fileLabel(file: RunCrateFileRef, group?: FileGroup): string {
  const key = parseDataIdentity(file, s3.endpoint.value).s3?.key
  if (group && key?.startsWith(group.folder)) return key.slice(group.folder.length)
  const stored = key?.split('/').filter(Boolean).pop()
  return stored || (file.name.split('/').filter(Boolean).pop() ?? file.name)
}

// One folder of files is listed flat, as the summary already names the folder.
function listRows(files: RunCrateFileRef[], card: CardKey): ListRow[] {
  const groups = groupFiles(files, s3.endpoint.value)
  const flat = groups.length === 1 && !groups[0]!.database && !groups[0]!.release
  return groups.flatMap((group): ListRow[] => {
    const only = group.files.length === 1 ? group.files[0] : undefined
    if (only) return [{ kind: 'file', key: group.key, row: toRow(only), label: fileLabel(only), nested: false }]
    const files = flat || !collapsed.value[card].has(group.key)
      ? group.files.map((file) => ({ kind: 'file' as const, key: `${group.key}:${file.id}`, row: toRow(file), label: fileLabel(file, group), nested: !flat }))
      : []
    return flat ? files : [{ kind: 'group', key: group.key, group }, ...files]
  })
}
const inputPager = reactive(usePagedList(computed(() => listRows(props.run.inputs, 'inputs'))))
const resultPager = reactive(usePagedList(computed(() => listRows(props.run.outputs, 'results'))))
// Inputs and results share one card layout: a summary row, then the paged file list.
const cards = computed(() => [
  { key: 'inputs' as const, title: 'Inputs', icon: LogIn, tone: 'muted' as const, files: props.run.inputs, empty: 'No declared inputs.', pager: inputPager, runId: undefined },
  { key: 'results' as const, title: 'Results', icon: Files, tone: 'aqua' as const, files: props.run.outputs, empty: 'No results were captured.', pager: resultPager, runId: props.run.runId },
].map((card) => ({ ...card, bytes: bytesOf(card.files), kinds: kindsOf(card.files), place: placeOf(card.files) })))

function groupTitle(group: FileGroup): string {
  const name = group.database?.name ?? group.release?.name
  return name ?? `${group.files.length} files in ${group.bucket ?? ''}/${group.folder}`
}

function partNote(group: FileGroup, count: boolean): string {
  const version = group.release?.version ?? group.database?.version
  const name = group.database && !count ? group.database.name : ''
  return [name, version ? `release ${version}` : '', count ? `${group.files.length} files` : ''].filter(Boolean).join(', ')
}

function groupNote(group: FileGroup): string {
  if (group.database || group.release) return partNote(group, true)
  return group.nodeId ? `on ${displayName(group.nodeId)}` : ''
}

// DOI links read as "DOI 10.5281/...", other links by their address.
function groupLinks(group: FileGroup): { href: string; label: string }[] {
  const links = [...new Set([...(group.database?.links ?? []), ...(group.release?.links ?? [])])].filter(isHttpUrl)
  return links.map((href) => {
    const doi = /^https?:\/\/(?:dx\.)?doi\.org\/(.+)$/i.exec(href)
    return { href, label: doi ? `DOI ${doi[1]}` : href.replace(/^https?:\/\//, '') }
  })
}

// A size only when every file of the group names one.
function groupSize(group: FileGroup): string {
  return group.bytes.complete ? formatBytes(group.bytes.total) : ''
}
</script>

<template>
  <div class="space-y-6" aria-label="Run record">
    <Notice v-if="run.error" tone="error">{{ run.error }}</Notice>
    <div class="grid gap-6 lg:grid-cols-2 lg:items-start">
      <section v-for="card in cards" :key="card.key" class="flex min-w-0 flex-col" :aria-labelledby="`run-${card.key}-heading`">
        <SectionHeading :id="`run-${card.key}-heading`" :title="card.title" :icon="card.icon">
          <template v-if="card.key === 'inputs' && inputSummary" #actions>
            <span class="text-xs tabular-nums text-muted-foreground">{{ inputSummary }}</span>
          </template>
        </SectionHeading>
        <div class="surface overflow-hidden">
          <p v-if="!card.files.length" class="px-5 py-4 text-sm text-muted-foreground">{{ card.empty }}</p>
          <template v-else>
            <div class="flex items-start gap-3 px-5 py-4">
              <IconTile :icon="Folder" :tone="card.tone" size="sm" />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-foreground">
                  {{ card.files.length }} {{ card.files.length === 1 ? 'file' : 'files' }}
                  <span v-if="card.bytes" class="ml-2 text-xs font-normal tabular-nums text-muted-foreground">{{ card.bytes }}</span>
                </p>
                <RouterLink v-if="card.place" :to="folderRoute(card.place, card.runId)" class="break-all font-mono text-xs text-primary hover:underline">{{ card.place.bucketId }}/{{ card.place.prefix ? `${card.place.prefix}/` : '' }}</RouterLink>
                <p v-if="card.kinds" class="mt-0.5 text-xs text-muted-foreground">{{ card.kinds }}</p>
              </div>
            </div>
            <ul class="divide-y divide-border-subtle border-t border-border-subtle">
              <li v-for="entry in card.pager.shown" :key="entry.key">
                <div v-if="entry.kind === 'group'" class="px-5 py-2">
                  <button type="button" class="flex w-full items-center gap-2 text-left text-sm font-medium text-foreground hover:text-primary" :aria-expanded="!collapsed[card.key].has(entry.key)" @click="toggle(card.key, entry.key)">
                    <ChevronRight class="h-3.5 w-3.5 shrink-0 transition-transform" :class="collapsed[card.key].has(entry.key) ? '' : 'rotate-90'" aria-hidden="true" />
                    <span class="min-w-0 flex-1 break-words">{{ groupTitle(entry.group) }}</span>
                    <span class="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">{{ groupSize(entry.group) }}</span>
                  </button>
                  <span v-if="groupNote(entry.group) || groupLinks(entry.group).length" class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-5.5 text-xs text-muted-foreground">
                    <span v-if="groupNote(entry.group)">{{ groupNote(entry.group) }}</span>
                    <ExternalLink v-for="link in groupLinks(entry.group)" :key="link.href" :href="link.href" :label="link.label" />
                  </span>
                </div>
                <component
                  :is="entry.row.link.kind === 's3' ? RouterLink : 'div'"
                  v-else
                  v-bind="entry.row.link.kind === 's3' ? { to: folderRoute(entry.row.link) } : {}"
                  class="flex items-start gap-2 px-5 py-2 text-sm"
                  :class="[entry.nested ? 'pl-10' : '', entry.row.link.kind === 's3' ? 'hover:bg-muted/40' : '']"
                  :title="entry.row.id"
                >
                  <ObjectIcon :name="entry.label" class="mt-0.5 h-4 w-4" />
                  <span class="min-w-0 flex-1">
                    <span class="block break-words text-foreground">{{ entry.label }}</span>
                    <span v-if="!entry.nested && fileNote(entry.row, Boolean(card.place))" class="mt-0.5 block text-xs text-muted-foreground">{{ fileNote(entry.row, Boolean(card.place)) }}</span>
                    <span v-if="entry.row.servedBy" class="mt-0.5 block text-xs text-muted-foreground" :title="entry.row.servedBy">Read from {{ sourceHost(entry.row.servedBy) }}</span>
                    <span v-if="entry.row.link.kind === 'drs'" class="mt-0.5 flex items-center gap-2 text-xs">
                      <a class="inline-flex items-center gap-1 text-primary hover:underline" :href="entry.row.link.object" target="_blank" rel="noopener noreferrer">Open the object <ExternalLinkIcon class="h-3 w-3" /></a>
                      <a class="inline-flex items-center gap-1 text-primary hover:underline" :href="entry.row.link.download" target="_blank" rel="noopener noreferrer" :aria-label="`Download ${entry.row.name}`"><Download class="h-3 w-3" /> Download</a>
                    </span>
                  </span>
                  <span class="shrink-0 text-xs tabular-nums text-muted-foreground">{{ entry.row.size }}</span>
                </component>
              </li>
            </ul>
            <ListPager v-if="card.pager.paged" v-model:page="card.pager.page" v-model:page-size="card.pager.pageSize" :total="card.pager.total" class="border-t border-border-subtle" />
          </template>
        </div>
      </section>
    </div>

    <section aria-labelledby="run-ran-heading">
      <SectionHeading id="run-ran-heading" title="What ran" :icon="Terminal">
        <template v-if="tesEnabled && run.runId && shown('compute')" #actions>
          <Button variant="outline" size="sm" as-child>
            <RouterLink :to="{ name: 'task', params: { taskId: run.runId } }"><ExternalLinkIcon class="h-4 w-4" /> Open the run</RouterLink>
          </Button>
        </template>
      </SectionHeading>
      <div class="surface space-y-5 p-5">
        <DetailList :items="ranItems">
          <template #tool="{ item }">
            <ExternalLink v-if="run.instrument?.identifier && isHttpUrl(run.instrument.identifier)" :href="run.instrument.identifier" :label="item.value" />
            <template v-else>{{ item.value }}</template>
          </template>
          <template #where>
            <RouterLink v-if="run.site?.nodeId" :to="{ name: 'node', params: { nodeId: run.site.nodeId } }" class="text-primary hover:underline">{{ displayName(run.site.nodeId) }}</RouterLink>
            <span v-if="run.site?.kind" class="block text-xs text-muted-foreground">{{ executor(run.site.kind) }}</span>
            <span v-if="run.site?.reason" class="block text-xs text-muted-foreground">{{ run.site.reason }}</span>
          </template>
          <template #image="{ item }">
            <a v-if="run.container?.url" :href="run.container.url" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-primary hover:underline">{{ item.value }} <ExternalLinkIcon class="h-3 w-3 shrink-0" /></a>
            <span v-else class="inline-flex max-w-full items-center gap-1" :title="item.value"><span class="truncate">{{ shortDigest(item.value) }}</span><CopyButton :value="item.value" label="Copy the image" /></span>
          </template>
          <template #agent>
            <span :title="run.agent?.identifier || run.agent?.id">
              <RouterLink v-if="agentLink.kind === 'user'" class="text-primary hover:underline" :to="{ name: 'user', params: { id: agentLink.id } }">{{ agentLabel }}</RouterLink>
              <ExternalLink v-else-if="agentLink.kind === 'external'" :href="agentLink.href" :label="agentLabel" />
              <template v-else>{{ agentLabel }}</template>
            </span>
            <span v-if="startedAt" class="block text-xs tabular-nums text-muted-foreground">{{ startedAt }}</span>
          </template>
          <template #workspace="{ item }">
            <RouterLink class="text-primary hover:underline" :to="{ name: 'bucket', params: { bucketId: item.value } }">{{ item.value }}</RouterLink>
          </template>
          <template #record="{ item }">
            <span class="inline-flex max-w-full items-center gap-1"><span class="truncate" :title="item.value">{{ truncateMiddle(item.value, 8, 6) }}</span><CopyButton :value="item.value" label="Copy the record id" /></span>
          </template>
          <template #api="{ item }">
            <span class="inline-flex max-w-full items-center gap-1"><span class="truncate" :title="item.value">{{ item.value.replace(documentId ?? '', truncateMiddle(documentId ?? '', 8, 6)) }}</span><CopyButton :value="item.value" label="Copy the API address" /></span>
          </template>
        </DetailList>
        <div v-if="run.command">
          <p class="type-label">Command</p>
          <div class="relative mt-1 whitespace-pre-wrap break-words rounded-md bg-muted px-3 py-2.5 pr-11 font-mono text-[12.5px] leading-5 text-foreground">{{ run.command }}<CopyButton :value="run.command" label="Copy the command" class="absolute right-1.5 top-1.5" /></div>
        </div>
        <p v-if="!ranItems.length && !run.command" class="text-xs text-muted-foreground">No details of the run were recorded.</p>
        <slot />
      </div>
    </section>
  </div>
</template>
