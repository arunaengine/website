<script setup lang="ts">
// Where a file or dataset came from, one link at a time with the user's own access. Opening it
// reads the direct inputs; each earlier part opens in place and is read then, and reading can stop.
import { computed, defineComponent, h, reactive, ref, watch, type Component, type PropType, type VNode } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { useElementSize } from '@vueuse/core'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import { ArrowDown, CloudOff, Database, Download, EyeOff, File, FileText, Files, GitBranch, Globe, Info, ListTodo, Minus, MoveRight, Network, Plus, RotateCw, UserRound, Workflow } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useUserDirectory } from '@/composables/useUserDirectory'
import { apiErrorMessage } from '@/lib/api'
import { folderRoute, objectRoute } from '@/lib/crate/dataIdentity'
import { splitName } from '@/lib/objectListing'
import { shortUserId } from '@/lib/utils'
import {
  addWriters,
  chainColumns,
  drawnChain,
  emptyGraph,
  expand,
  intoRecord,
  isOrigin,
  linkedBuckets,
  startDataset,
  startFile,
  type Box,
  type ChainCard,
  type DrawnNode,
  type Graph,
  type Hop,
  type ProvenanceStart,
  type Readers,
} from '@/lib/provenance'

const props = defineProps<{
  start: ProvenanceStart
  /** A run record's results, shown as the record's own card; `where` names the run's node. */
  record?: { files: number; path: string; to: RouteLocationRaw | null; runId?: string; where?: string } | null
}>()

const { getVersionOrigin, getRun, getBucketRuns, fetchRoCrateRaw, downloadProvenanceCrate, runSparql, listGroupConnectors, myGroups, sessionEpoch } = useAruna()
const { displayName } = useRealmNodes()
const users = useUserDirectory()

const readers: Readers = {
  origin: (version) => getVersionOrigin(version),
  run: (runId) => getRun(runId),
  crate: (documentId) => fetchRoCrateRaw(documentId),
  writers: async (bucket, prefix, nodeId) => (await getBucketRuns(bucket, prefix, nodeId)).runs.map((run) => run.run_id),
}

const graph = reactive<Graph>(emptyGraph())
const walking = ref(false)
// Cards opened or closed by hand, by card id; the rest follow the direct default.
const opened = ref(new Map<string, boolean>())
// The full graph opens every card, so reading goes on until nothing waits or it is stopped.
const full = ref(false)
// Each read has its number; a newer read or a stop ends the older one.
let reading = 0
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
    stop()
    went.value = null
    wentState.value = 'idle'
    opened.value = new Map()
    full.value = false
    Object.assign(graph, emptyGraph())
    if (props.start.kind === 'file') startFile(graph, props.start.id, props.start.name, props.start.origin)
    else {
      startDataset(graph, props.start.title, props.start.documentId, props.start.crate)
      void readWriters(props.start.documentId, props.start.crate)
    }
  },
  { immediate: true },
)

// A dataset that names a bucket shows the runs that wrote into it; a node without the lookup adds none.
async function readWriters(documentId: string, crate: unknown) {
  const current = fenced()
  const answers = await Promise.all(linkedBuckets(crate).map((part) => getBucketRuns(part.bucket, part.prefix, part.nodeId).catch(() => null)))
  const runIds = answers.flatMap((answer) => answer?.runs.map((run) => run.run_id) ?? [])
  if (!current() || !runIds.length) return
  addWriters(graph, documentId, runIds)
  void readDirect()
}

// The open cards; a run record's results are not read, its card counts them.
const waiting = (item: Box | undefined) => Boolean(item?.pending.length) && item!.kind !== 'silent' && !(item!.id === graph.roots[0] && props.record)
// A closed card reads only the run that made it, which it shows.
const ownRun = (hop: Hop) => hop.kind === 'run'
const readable = (card: ChainCard, item: Box | undefined) => waiting(item) && (card.open || item!.pending.some(ownRun))
const unread = computed(() => layout.value.cards.some((card) => card.node.ids.some((id) => readable(card, graph.boxes[id]))))
// The level being read, counted from the start, and the links still waiting on the drawn cards.
const level = ref(0)
const left = computed(() => layout.value.cards.flatMap((card) => card.node.ids.filter((id) => readable(card, graph.boxes[id])).map((id) => graph.boxes[id]!.pending.filter((hop) => card.open || ownRun(hop)).length)).reduce((sum, count) => sum + count, 0))
// Reads level by level: the waiting card nearest the start goes first, so the graph grows outward.
async function readDirect() {
  const current = fenced()
  const run = ++reading
  walking.value = true
  for (;;) {
    const cards = layout.value.cards
    const next = cards.flatMap((card) => card.node.ids.filter((id) => readable(card, graph.boxes[id])).map((id) => ({ id, card }))).sort((a, b) => b.card.column - a.card.column)[0]
    if (!next || run !== reading || !current()) break
    level.value = layout.value.columns - next.card.column
    await expand(graph, next.id, readers, current, next.card.open ? undefined : ownRun)
  }
  if (run === reading) walking.value = false
}

function stop() {
  reading += 1
  walking.value = false
}

function showFull(value: boolean) {
  full.value = value
  opened.value = new Map()
}

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

// Cards are 104 px high in rows of 120 px; a half row lets a card sit between two sources.
const PITCH = 120
const GAP = 48

const chain = computed(() => intoRecord(graph, drawnChain(graph)))
const layout = computed(() => chainColumns(graph, chain.value, !full.value, opened.value))
const gridStyle = computed(() => ({
  gridTemplateColumns: Array.from({ length: layout.value.columns }, () => 'minmax(9rem, 16rem)').join(` ${GAP}px `),
  gridTemplateRows: `repeat(${layout.value.rows * 2}, ${PITCH / 2}px)`,
}))
const byId = computed(() => new Map(layout.value.cards.map((card) => [card.id, card])))
const centre = (card: ChainCard) => card.row * PITCH + PITCH / 2
function edgesFrom(column: number) {
  return layout.value.cards.flatMap((card) => {
    const target = card.column === column && card.into ? byId.value.get(card.into) : undefined
    if (!target) return []
    const [y1, y2] = [centre(card), centre(target)]
    return [{ id: card.id, line: `M0 ${y1}C${GAP / 2} ${y1} ${GAP / 2} ${y2} ${GAP - 2} ${y2}`, head: `M${GAP - 7} ${y2 - 4}L${GAP - 2} ${y2}L${GAP - 7} ${y2 + 4}`, me: !target.into }]
  })
}

// Below 600 px the chain becomes a list from the sources down to the start.
const pane = ref<HTMLElement | null>(null)
const { width } = useElementSize(pane)
const narrow = computed(() => width.value > 0 && width.value < 600)

const VERSIONED = /arn:aruna:[^:/]+:[^:/]+:s3\/([^/]+)\/(.+)@[0-9A-HJKMNP-TV-Z]{26}$/
// The id a box was asked by names its bucket and key; a global id names neither.
function askedOf(id: string) {
  return Object.entries(graph.seen).find(([, seen]) => seen === id)?.[0] ?? id
}
function placeOf(item: Box): RouteLocationRaw | undefined {
  const key = VERSIONED.exec(askedOf(item.id))
  if (key) return objectRoute(key[1]!, decodeURIComponent(key[2]!))
  const bucket = item.kind === 'database' ? /^database:[^/]+\/(.+)$/.exec(item.id)?.[1] : undefined
  return bucket ? folderRoute(bucket, '') : undefined
}

// Boxes outside the data keep their role, also upstream: a person, a system job, a source.
const OUTSIDE: Box['kind'][] = ['person', 'system', 'source']
const ICONS: Record<Box['kind'], Component> = {
  file: File,
  dataset: FileText,
  unversioned: File,
  run: Workflow,
  system: ListTodo,
  database: Database,
  source: Globe,
  person: UserRound,
  hidden: EyeOff,
  silent: CloudOff,
}

// People and connectors are named by id; their names are looked up once per view.
watch(
  () => [...new Set(Object.values(graph.boxes).filter((item) => item.kind === 'person').map((item) => item.title))],
  (ids) => {
    if (ids.length) void users.resolveUsers(ids)
  },
)
const connectorNames = ref(new Map<string, string>())
let namesEpoch = -1
watch(
  () => [sessionEpoch.value, Object.values(graph.boxes).some((item) => item.connector)] as const,
  async ([epoch, wanted]) => {
    if (!wanted || namesEpoch === epoch) return
    namesEpoch = epoch
    connectorNames.value = new Map()
    const answers = await Promise.all(myGroups.value.map((group) => listGroupConnectors(group.id).catch(() => null)))
    if (epoch !== sessionEpoch.value) return
    connectorNames.value = new Map(answers.flatMap((answer) => answer?.connectors.map((each) => [each.connector_id, each.name] as const) ?? []))
  },
)

function originDetail(item: Box): string {
  if (item.kind === 'person' && item.device) return `Device: ${displayName(item.device)}`
  if (item.connector) {
    const name = connectorNames.value.get(item.connector)
    return name ? `Connector: ${name}` : 'Through a connector'
  }
  return item.detail ?? ''
}

interface Shown {
  icon: Component
  role: string
  title: string
  detail: string
  mono?: boolean
  path?: string
  identifiers: Box['identifiers']
  to?: RouteLocationRaw
  href?: string
  me: boolean
  muted: boolean
  fold?: { key: string; open: boolean }
  action?: { label: string; icon: Component; run: () => void }
  earlier?: { open: boolean; text: string; label: string }
}

// What a closed card holds back: the cards before it, and whether links there are still unread.
// `shown` leaves out the sources a closed card draws anyway: where it came from.
function before(node: DrawnNode, shown = false): { count: number; unread: boolean } {
  const unread = node.ids.some((id) => graph.boxes[id]?.pending.length && graph.boxes[id]!.kind !== 'silent')
  const hidden = shown ? node.sources.filter((source) => !isOrigin(graph, source)) : node.sources
  return hidden.map((source) => before(source)).reduce((sum, each) => ({ count: sum.count + 1 + each.count, unread: sum.unread || each.unread }), { count: 0, unread })
}

// Every card but the start opens and closes what came before it, in place.
function earlierOf(card: ChainCard): Shown['earlier'] {
  if (!card.into || card.node.repeat) return undefined
  const { count, unread } = before(card.node, true)
  if (!count && !unread) return undefined
  if (card.open) return { open: true, text: 'Hide', label: 'Hide earlier steps' }
  const steps = `${count}${unread ? '+' : ''} ${count === 1 && !unread ? 'step' : 'steps'}`
  return { open: false, text: count ? steps : 'More', label: count ? `Show ${steps} before this` : 'Show earlier steps' }
}

function toggleEarlier(card: ChainCard) {
  opened.value = new Map(opened.value).set(card.id, !card.open)
}

function shown(card: ChainCard): Shown {
  const items = card.node.ids.map((id) => graph.boxes[id]).filter((item): item is Box => Boolean(item))
  const item = items[0]!
  const me = !card.into
  const action = item.kind === 'silent' ? { label: 'Try again', icon: RotateCw, run: () => expand(graph, item.id, readers, fenced()) } : undefined
  const repeat = card.node.repeat && item.from.length ? (items.length > 1 ? 'Their provenance is shown elsewhere.' : 'Its provenance is shown elsewhere.') : ''
  const base = { identifiers: [], me, muted: false, action, earlier: earlierOf(card) }
  if (me && props.record && props.start.kind === 'dataset') {
    const files = props.record.files
    return { ...base, icon: Files, role: 'Files', title: `${files} result ${files === 1 ? 'file' : 'files'}`, detail: props.record.path, mono: true, to: props.record.to ?? undefined }
  }
  if (items.length > 1) {
    const release = item.from.map((id) => graph.boxes[id]).find((each) => each?.kind === 'database')
    const open = openFolds.value.has(card.node.key)
    const files = `${items.length} files`
    const fold = { key: card.node.key, open }
    // The files of one database read as that database, with its release and their count, unless
    // the database is drawn beside them.
    if (release && !layout.value.cards.some((each) => each.node.ids.includes(release.id))) {
      const facts = release.release ? `Release ${release.release.label}, ${files}` : files
      return { ...base, icon: Database, role: 'Database', title: release.release?.name ?? release.title, detail: [facts, repeat].filter(Boolean).join('. '), fold }
    }
    const of = release?.release ? `Release ${release.release.label}` : release ? `Of ${release.title}` : ''
    return { ...base, icon: Files, role: item.role, title: files, detail: [of, repeat].filter(Boolean).join('. '), fold }
  }
  const document = item.link?.document
  const run = item.kind === 'run' ? item.id.replace(/^run:/, '') : ''
  const to = document ? { name: 'dataset', params: { id: document } } : run ? { name: 'task', params: { taskId: run } } : placeOf(item)
  return {
    ...base,
    icon: me && props.start.kind === 'dataset' ? FileText : ICONS[item.kind],
    role: item.role,
    title: item.kind === 'person' ? (users.cachedUser(item.title)?.name || shortUserId(item.title)) : item.title,
    detail: repeat || originDetail(item) || (run && run === props.record?.runId ? props.record.where ?? '' : ''),
    mono: item.kind === 'hidden',
    path: item.path,
    identifiers: item.identifiers,
    to: me ? undefined : to,
    href: document ? undefined : item.link?.url,
    muted: item.kind === 'hidden' || item.kind === 'unversioned' || item.kind === 'silent',
  }
}

// Sibling files folded into one card list their names below the chain on request.
const openFolds = ref(new Set<string>())
function toggleFold(key: string) {
  const next = new Set(openFolds.value)
  if (!next.delete(key)) next.add(key)
  openFolds.value = next
}
const foldLists = computed(() =>
  layout.value.cards
    .filter((card) => card.node.ids.length > 1 && openFolds.value.has(card.node.key))
    .map((card) => ({ key: card.node.key, title: shown(card).title, names: card.node.ids.map((id) => graph.boxes[id]).map((item) => item?.path ?? item?.title ?? '') })),
)

// Words wrap at spaces; a name without spaces keeps its end, such as the file extension.
function titleView(view: Shown): VNode {
  if (/\s/.test(view.title)) return h('span', { class: 'line-clamp-2 break-words' }, view.title)
  const [head, tail] = splitName(view.title)
  return h('span', { class: 'flex min-w-0' }, [h('span', { class: 'truncate' }, head), h('span', { class: 'shrink-0 whitespace-nowrap' }, tail)])
}

const CardView = defineComponent({
  props: { card: { type: Object as PropType<ChainCard>, required: true } },
  setup(cardProps) {
    return () => {
      const view = shown(cardProps.card)
      // The title carries the link; its overlay makes the whole card open what it shows.
      const stretch = 'after:absolute after:inset-0 after:content-[""] focus-visible:outline-none'
      const title = view.to
        ? h(RouterLink, { to: view.to, class: stretch }, () => titleView(view))
        : view.href
          ? h('a', { href: view.href, target: '_blank', rel: 'noopener noreferrer', class: stretch }, titleView(view))
          : titleView(view)
      const detail: (VNode | string)[] = view.detail ? [h('span', { class: view.mono ? 'font-mono' : '' }, view.detail)] : []
      for (const found of view.identifiers) {
        detail.push(h('span', { class: 'relative z-10' }, [`${found.name} `, h(ExternalLink, { href: found.url, label: found.value, class: 'font-mono' })]))
      }
      if (view.fold) {
        detail.unshift(h('button', { type: 'button', class: 'relative z-10 text-primary hover:underline', 'aria-expanded': view.fold.open, onClick: () => toggleFold(view.fold!.key) }, view.fold.open ? 'Hide the files' : 'Show the files'))
      }
      // Steps made by a run of an input read as upstream; the icon still tells a run from a file.
      const head = [
        h(view.icon, { class: ['h-3.5 w-3.5 shrink-0', view.me ? 'text-aruna-navy dark:text-aruna-aqua' : 'text-muted-foreground'], 'aria-hidden': 'true' }),
        h('span', { class: 'truncate' }, cardProps.card.upstream && !OUTSIDE.includes(graph.boxes[cardProps.card.node.ids[0]!]?.kind ?? 'file') ? 'Upstream' : view.role),
      ]
      if (view.me && props.start.kind === 'dataset') head.push(h('span', { class: 'ml-auto shrink-0 font-medium text-aruna-navy dark:text-aruna-aqua' }, 'This record'))
      if (view.action) {
        const action = view.action
        head.push(h('button', { type: 'button', class: 'relative z-10 -my-1 ml-auto inline-flex shrink-0 rounded p-0.5 text-primary hover:bg-muted', title: action.label, 'aria-label': action.label, onClick: action.run }, [h(action.icon, { class: 'h-3.5 w-3.5' }), h('span', { class: 'sr-only' }, action.label)]))
      } else if (view.earlier) {
        const earlier = view.earlier
        head.push(h('button', {
          type: 'button',
          class: 'relative z-10 -my-1 ml-auto inline-flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-primary hover:bg-muted',
          title: earlier.label,
          'aria-label': earlier.label,
          'aria-expanded': earlier.open,
          onClick: () => toggleEarlier(cardProps.card),
        }, [h(earlier.open ? Minus : Plus, { class: 'h-3.5 w-3.5', 'aria-hidden': 'true' }), earlier.text]))
      }
      return h('div', {
        class: [
          'relative flex min-w-0 flex-col justify-center rounded-lg border bg-card px-3 py-2 shadow-sm transition-colors dark:shadow-none',
          view.me ? 'border-aruna-aqua ring-2 ring-aruna-aqua/25' : view.muted ? 'border-dashed border-border bg-muted/40' : 'border-border',
          view.to || view.href ? 'hover:border-primary/40' : '',
        ],
        title: view.path,
        'data-box': cardProps.card.node.key,
      }, [
        h('span', { class: 'flex items-center gap-1.5 text-[11px] text-muted-foreground' }, head),
        h('span', { class: 'mt-0.5 text-[13px] font-medium leading-[18px] text-foreground' }, [title]),
        detail.length ? h('span', { class: 'mt-0.5 truncate text-xs text-muted-foreground [&>*+*]:ml-2', title: view.detail || undefined }, detail) : null,
      ])
    }
  },
})

// On a phone: each source's chain as a group, then where they join.
const ListBranch: ReturnType<typeof defineComponent> = defineComponent({
  props: { card: { type: Object as PropType<ChainCard>, required: true } },
  setup(branch) {
    return () => {
      const card = branch.card
      const sources = layout.value.cards.filter((each) => each.into === card.id)
      const self = h(CardView, { card })
      const down = h('div', { class: 'grid h-6 place-items-center text-muted-foreground', 'aria-hidden': 'true' }, [h(ArrowDown, { class: 'h-4 w-4' })])
      if (!sources.length) return h('div', { class: 'flex flex-col' }, [self])
      if (sources.length === 1) return h('div', { class: 'flex flex-col' }, [h(ListBranch, { card: sources[0] }), down, self])
      const run = graph.boxes[card.node.ids[0]!]?.kind === 'run'
      const groups = sources.map((source, index) =>
        h('div', { key: source.id, class: 'mb-4 border-l-2 border-border pl-3' }, [
          h('p', { class: 'mb-2 text-xs text-muted-foreground' }, `${run ? 'Input' : 'Source'} ${index + 1} of ${sources.length}`),
          h(ListBranch, { card: source }),
        ]),
      )
      const join = sources.length === 2 ? (run ? 'Both inputs go into' : 'Both go into') : run ? 'All inputs go into' : 'All go into'
      return h('div', { class: 'flex flex-col' }, [...groups, h('p', { class: 'mb-2 flex items-center gap-1.5 text-xs text-muted-foreground' }, [h(ArrowDown, { class: 'h-3.5 w-3.5 text-aruna-aqua', 'aria-hidden': 'true' }), join]), self])
    }
  },
})

// Reads after every new start and every card opened by hand.
watch(() => [props.start, sessionEpoch.value, opened.value], () => void readDirect(), { immediate: true })

const INFO = 'You only see what you are allowed to read.'
const LEGEND = [
  { icon: MoveRight, label: 'Flows from source to result' },
  { icon: UserRound, label: 'Uploaded by a person' },
  { icon: Workflow, label: 'Run' },
  { icon: ListTodo, label: 'System job' },
  { icon: Globe, label: 'External source' },
  { icon: File, label: 'File' },
  { icon: FileText, label: 'Dataset' },
  { icon: Database, label: 'Database' },
]
// The legend names only what the graph draws; the arrow is always drawn.
const legend = computed(() => {
  const drawn = new Set(layout.value.cards.map((card) => shown(card).icon))
  if (drawn.has(Files)) drawn.add(File)
  return LEGEND.filter((item) => item.icon === MoveRight || drawn.has(item.icon))
})
</script>

<template>
  <div class="space-y-4">
    <SectionHeading v-if="start.kind === 'dataset'" id="provenance-heading" title="Provenance" :icon="GitBranch" :info="INFO">
      <template #actions>
        <Button v-if="!full" size="sm" variant="outline" @click="showFull(true)"><Network class="h-4 w-4" /> Show full graph</Button>
        <Button v-else-if="!walking && unread" size="sm" variant="outline" @click="readDirect"><Network class="h-4 w-4" /> Read the rest</Button>
        <Button v-else-if="!walking" size="sm" variant="outline" @click="showFull(false)"><Network class="h-4 w-4" /> Show direct steps</Button>
        <Button size="sm" variant="outline" :disabled="exporting" @click="exportCrate"><Download class="h-4 w-4" /> Export as crate</Button>
      </template>
    </SectionHeading>
    <div v-else class="flex flex-wrap items-center gap-2">
      <Tooltip :label="INFO">
        <button type="button" class="inline-flex rounded-full text-muted-foreground hover:text-foreground" aria-label="About provenance"><Info class="size-4" /></button>
      </Tooltip>
      <Button v-if="!full" size="sm" variant="outline" class="ml-auto" @click="showFull(true)"><Network class="h-4 w-4" /> Show full graph</Button>
      <Button v-else-if="!walking && unread" size="sm" variant="outline" class="ml-auto" @click="readDirect"><Network class="h-4 w-4" /> Read the rest</Button>
      <Button v-else-if="!walking" size="sm" variant="outline" class="ml-auto" @click="showFull(false)"><Network class="h-4 w-4" /> Show direct steps</Button>
      <Button size="sm" variant="outline" :class="full && walking ? 'ml-auto' : ''" :disabled="exporting" @click="exportCrate"><Download class="h-4 w-4" /> Export as crate</Button>
    </div>
    <Notice v-if="exportError" tone="error">{{ exportError }}</Notice>
    <p v-else-if="exported" role="status" class="text-xs text-muted-foreground">Saved as provenance.zip.</p>

    <div :class="start.kind === 'dataset' ? 'surface overflow-hidden' : ''">
      <div v-if="walking" role="status" class="flex flex-wrap items-center gap-2 px-4 pt-3 text-xs text-muted-foreground">
        <Spinner v-if="full" />
        {{ full ? `Reading the full graph, level ${level}` : 'Reading' }}: {{ graph.steps }} {{ graph.steps === 1 ? 'step' : 'steps' }} read, {{ left }} waiting
        <button type="button" class="text-primary hover:underline" @click="stop">Stop</button>
      </div>
      <div ref="pane" :class="start.kind === 'dataset' ? 'p-4' : 'py-2'">
        <div v-if="narrow" class="flex flex-col gap-4">
          <ListBranch v-for="card in layout.cards.filter((each) => !each.into)" :key="card.id" :card="card" />
        </div>
        <div v-else class="overflow-x-auto">
          <div class="grid justify-center" :style="gridStyle">
            <svg
              v-for="column in layout.columns - 1"
              :key="column"
              :width="GAP"
              :height="layout.rows * PITCH"
              :style="{ gridColumn: column * 2, gridRow: '1 / -1' }"
              class="overflow-visible"
              aria-hidden="true"
            >
              <g v-for="edge in edgesFrom(column - 1)" :key="edge.id" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" :class="edge.me ? 'stroke-aruna-aqua' : 'stroke-border'">
                <path :d="edge.line" />
                <path :d="edge.head" :class="edge.me ? '' : 'stroke-muted-foreground'" />
              </g>
            </svg>
            <CardView
              v-for="card in layout.cards"
              :key="card.id"
              :card="card"
              class="my-2 h-[104px]"
              :style="{ gridColumn: card.column * 2 + 1, gridRow: `${card.row * 2 + 1} / span 2` }"
            />
          </div>
        </div>
      </div>
      <div v-for="fold in foldLists" :key="fold.key" class="border-t border-border-subtle px-5 py-3 text-xs">
        <p class="mb-1 font-medium text-foreground">{{ fold.title }}</p>
        <ul class="max-h-40 space-y-0.5 overflow-y-auto text-muted-foreground">
          <li v-for="name in fold.names" :key="name" class="break-words [overflow-wrap:anywhere]">{{ name }}</li>
        </ul>
      </div>
      <div v-if="!narrow" class="flex flex-wrap gap-x-5 gap-y-1 border-t border-border-subtle text-xs text-muted-foreground" :class="start.kind === 'dataset' ? 'px-5 py-3' : 'pt-3'">
        <span v-for="item in legend" :key="item.label" class="inline-flex items-center gap-1.5"><component :is="item.icon" class="h-3.5 w-3.5" aria-hidden="true" />{{ item.label }}</span>
        <span v-if="start.kind === 'dataset'" class="inline-flex items-center gap-1.5"><span class="inline-block h-2.5 w-3.5 rounded-sm border-2 border-aruna-aqua" aria-hidden="true" />This record</span>
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
