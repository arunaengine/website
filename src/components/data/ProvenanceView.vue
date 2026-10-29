<script setup lang="ts">
// Where a file or dataset came from, one link at a time with the user's own access. Nothing is
// read until the user asks; "Show all" follows every link and can be stopped.
import { computed, defineComponent, h, reactive, ref, watch, type PropType, type VNode } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import { ArrowLeft } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { apiErrorMessage } from '@/lib/api'
import {
  drawnChain,
  emptyGraph,
  expand,
  expandAll,
  hasPending,
  startDataset,
  startFile,
  type Box,
  type DrawnNode,
  type Graph,
  type ProvenanceStart,
  type Readers,
} from '@/lib/provenance'

const props = defineProps<{ start: ProvenanceStart }>()

const { getVersionOrigin, getRun, fetchRoCrateRaw, downloadProvenanceCrate, runSparql, sessionEpoch } = useAruna()

const readers: Readers = {
  origin: (version) => getVersionOrigin(version),
  run: (runId) => getRun(runId),
  crate: (documentId) => fetchRoCrateRaw(documentId),
}

const graph = reactive<Graph>(emptyGraph())
const walking = ref(false)
let stopped = false
let generation = 0
// Where it went: runs and datasets that name the same bytes. Only stored files have a content id.
const went = ref<{ runs: string[]; datasets: string[] } | null>(null)
const wentState = ref<'idle' | 'loading' | 'ready' | 'failed'>('idle')

/** Holds while the graph still belongs to the start that is shown now. */
function fenced() {
  const run = generation
  return () => run === generation
}

// A new start or session clears what was read before.
watch(
  () => [props.start, sessionEpoch.value],
  () => {
    generation += 1
    stopped = true
    walking.value = false
    went.value = null
    wentState.value = 'idle'
    Object.assign(graph, emptyGraph())
    if (props.start.kind === 'file') startFile(graph, props.start.id, props.start.name, props.start.origin)
    else startDataset(graph, props.start.title, props.start.documentId, props.start.crate)
  },
  { immediate: true },
)

async function showAll() {
  const current = fenced()
  stopped = false
  walking.value = true
  await expandAll(graph, readers, () => stopped, current)
  if (current()) walking.value = false
}

function stop() {
  stopped = true
  walking.value = false
}

const more = computed(() => hasPending(graph))

// The export is assembled by the node and saved as one file.
const exporting = ref(false)
const exportError = ref<string | null>(null)
const exported = ref(false)
async function exportCrate() {
  exporting.value = true
  exportError.value = null
  exported.value = false
  try {
    const start = props.start.kind === 'file' ? { version: props.start.id } : { dataset: props.start.documentId }
    const blob = await downloadProvenanceCrate(start)
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = 'provenance.zip'
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(anchor.href)
    exported.value = true
  } catch (cause) {
    exportError.value = apiErrorMessage(cause)
  } finally {
    exporting.value = false
  }
}

const contentId = computed(() => (props.start.kind === 'file' ? props.start.origin.content_id ?? null : null))
const documentOf = (iri: string) => /^https:\/\/w3id\.org\/aruna\/([0-9A-HJKMNP-TV-Z]{26})/.exec(iri)?.[1] ?? null

async function findUses() {
  const id = contentId.value
  if (!id) return
  const run = generation
  wentState.value = 'loading'
  try {
    const ask = (property: string) => runSparql(`SELECT DISTINCT ?s WHERE { ?s <http://schema.org/${property}> <${id}> }`, 'distributed-best-effort')
    const [runs, parts] = await Promise.all([ask('object'), ask('hasPart')])
    if (run !== generation) return
    const documents = (rows: { s?: string }[]) => [...new Set(rows.map((row) => documentOf(row.s ?? '')).filter((doc): doc is string => Boolean(doc)))]
    went.value = { runs: documents(runs.rows as { s?: string }[]), datasets: documents(parts.rows as { s?: string }[]) }
    wentState.value = 'ready'
  } catch {
    if (run === generation) wentState.value = 'failed'
  }
}

const BOX = 'rounded-[10px] border border-border px-3 py-2.5 text-xs'
const MUTED = 'border-dashed bg-muted/50'

function boxView(item: Box, repeat = false): VNode {
  const muted = item.kind === 'hidden' || item.kind === 'unversioned' || item.kind === 'silent'
  const root = graph.roots.includes(item.id)
  const lines: VNode[] = [
    h('div', { class: 'mb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground' }, item.role),
    h('p', { class: 'break-words font-medium' }, item.title),
  ]
  if (item.detail) lines.push(h('p', { class: item.kind === 'hidden' ? 'font-mono text-muted-foreground' : 'text-muted-foreground' }, item.detail))
  if (repeat && item.from.length) lines.push(h('p', { class: 'text-muted-foreground' }, 'Where it came from is shown above.'))
  for (const found of item.identifiers) {
    lines.push(
      h('p', [
        `${found.name} `,
        h(ExternalLink, { href: found.url, label: found.value, class: 'break-all font-mono' }),
      ]),
    )
  }
  if (item.link?.document) {
    lines.push(h(RouterLink, { to: { name: 'dataset', params: { id: item.link.document } }, class: 'text-primary hover:underline' }, () => item.link?.label))
  } else if (item.link?.url) {
    // Long identifiers such as a DOI break inside the narrow box.
    lines.push(h(ExternalLink, { href: item.link.url, label: item.link.label, class: 'break-all' }))
  }
  if (item.pending.length) {
    const label = item.kind === 'silent' ? 'Try again' : 'Show where this came from'
    lines.push(h('button', { type: 'button', class: 'mt-1 text-primary hover:underline', onClick: () => expand(graph, item.id, readers, fenced()) }, label))
  }
  const ring = root ? 'shadow-[0_0_0_2px_hsl(var(--primary)/0.35)]' : ''
  return h('div', { class: [BOX, muted ? MUTED : 'bg-background', ring], 'data-box': item.id }, lines)
}

// Sibling files folded into one box: how many, of which release, opened to their names.
const openFolds = ref(new Set<string>())
function foldView(node: DrawnNode): VNode {
  const items = node.ids.map((id) => graph.boxes[id]).filter((item): item is Box => Boolean(item))
  const first = items[0]!
  const release = first.from.map((id) => graph.boxes[id]).find((item) => item?.kind === 'database')
  const open = openFolds.value.has(node.key)
  const toggle = () => {
    const next = new Set(openFolds.value)
    if (!next.delete(node.key)) next.add(node.key)
    openFolds.value = next
  }
  const lines: VNode[] = [
    h('div', { class: 'mb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground' }, first.role),
    h('p', { class: 'font-medium' }, release ? `${items.length} files of ${release.title}` : `${items.length} files`),
    h('button', { type: 'button', class: 'mt-1 text-primary hover:underline', 'aria-expanded': open, onClick: toggle }, open ? 'Hide the files' : 'Show the files'),
  ]
  if (node.repeat) lines.push(h('p', { class: 'text-muted-foreground' }, 'Where these came from is shown above.'))
  if (open) lines.push(h('ul', { class: 'mt-1 max-h-40 space-y-0.5 overflow-y-auto text-muted-foreground' }, items.map((item) => h('li', { key: item.id, class: 'break-all' }, item.title))))
  if (items.some((item) => item.pending.length)) {
    const expandAllOf = async () => {
      const current = fenced()
      for (const item of items) if (current()) await expand(graph, item.id, readers, current)
    }
    lines.push(h('button', { type: 'button', class: 'mt-1 block text-primary hover:underline', onClick: expandAllOf }, 'Show where these came from'))
  }
  return h('div', { class: [BOX, 'bg-background'], 'data-box': node.key }, lines)
}

// One entry, then an arrow and the entries it came from, each with their own sources.
const Branch: ReturnType<typeof defineComponent> = defineComponent({
  props: { node: { type: Object as PropType<DrawnNode>, required: true } },
  setup(branch) {
    return () => {
      const node = branch.node
      const item = graph.boxes[node.ids[0]!]
      if (!item) return null
      const view = node.ids.length > 1 ? foldView(node) : boxView(item, node.repeat)
      const children = node.sources.length
        ? [
            h('div', { class: 'flex w-6 flex-none justify-center text-muted-foreground', 'aria-hidden': 'true' }, [h(ArrowLeft, { class: 'h-4 w-4' })]),
            h('div', { class: 'flex flex-col gap-2.5' }, node.sources.map((source) => h(Branch, { node: source, key: source.key }))),
          ]
        : []
      return h('div', { class: 'flex items-center' }, [h('div', { class: 'w-36 flex-none' }, [view]), ...children])
    }
  },
})
const chain = computed(() => drawnChain(graph))
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <p class="min-w-0 flex-1 text-xs text-muted-foreground">You only see what you are allowed to read.</p>
      <Button v-if="!walking" size="sm" variant="outline" :disabled="!more" @click="showAll">Show all</Button>
      <Button size="sm" :disabled="exporting" @click="exportCrate">Export as crate</Button>
    </div>
    <div v-if="walking" class="flex items-center gap-2 text-xs text-muted-foreground">
      Showing all: {{ graph.steps }} steps read
      <button type="button" class="text-primary hover:underline" @click="stop">Stop</button>
    </div>
    <Notice v-if="exportError" tone="error">{{ exportError }}</Notice>
    <p v-else-if="exported" role="status" class="text-xs text-muted-foreground">Saved as provenance.zip.</p>

    <div class="overflow-x-auto py-2">
      <div class="flex flex-col gap-2.5">
        <Branch v-for="node in chain" :key="node.key" :node="node" />
      </div>
    </div>

    <section v-if="start.kind === 'file'" class="space-y-2 border-t border-border pt-4">
      <h3 class="text-sm font-medium text-foreground">Where it went</h3>
      <p v-if="!contentId" class="text-xs text-muted-foreground">Not available for this file.</p>
      <Button v-else-if="wentState === 'idle'" size="sm" variant="outline" @click="findUses">Find runs and datasets</Button>
      <p v-else-if="wentState === 'loading'" class="text-xs text-muted-foreground">Searching…</p>
      <p v-else-if="wentState === 'failed'" class="text-xs text-destructive">The search did not answer.</p>
      <template v-else-if="went">
        <ul class="space-y-1 text-xs">
          <li>
            Used by {{ went.runs.length }} {{ went.runs.length === 1 ? 'run' : 'runs' }}<template v-if="went.runs.length">:</template>
            <template v-for="(doc, index) in went.runs" :key="doc">
              <RouterLink :to="{ name: 'dataset', params: { id: doc } }" class="font-mono text-primary hover:underline">{{ doc.slice(-8) }}</RouterLink><template v-if="index < went.runs.length - 1">, </template>
            </template>
          </li>
          <li>
            Part of {{ went.datasets.length }} {{ went.datasets.length === 1 ? 'dataset' : 'datasets' }}<template v-if="went.datasets.length">:</template>
            <template v-for="(doc, index) in went.datasets" :key="doc">
              <RouterLink :to="{ name: 'dataset', params: { id: doc } }" class="font-mono text-primary hover:underline">{{ doc.slice(-8) }}</RouterLink><template v-if="index < went.datasets.length - 1">, </template>
            </template>
          </li>
        </ul>
        <p class="text-xs text-muted-foreground">Found by identical content, not this exact version. The list may be incomplete.</p>
      </template>
    </section>
  </div>
</template>
