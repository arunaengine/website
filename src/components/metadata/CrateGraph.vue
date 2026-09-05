<script setup lang="ts">
// One graph for every place a crate is shown. View mode selects and opens;
// edit mode also links two entities by dragging one node onto the other.
import { computed, nextTick, ref, watch, type Component } from 'vue'
import {
  Handle,
  MarkerType,
  Position,
  useVueFlow,
  VueFlow,
  type Connection,
  type EdgeMouseEvent,
  type NodeMouseEvent,
} from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import { typeIcon } from './editor/icons'
import {
  BADGES,
  CONTEXT_LIMIT,
  MINIMAP_LIMIT,
  crateGraph,
  dataOnly,
  describeGraph,
  layoutGraph,
  toDraft,
  type GraphNode,
  type GraphNodeKind,
} from '@/lib/crate/graph'
import { findEntity, linkProperties, propertyKey, type CrateDraft } from '@/lib/crate/editor'
import { linkReference } from '@/lib/crate/references'
import type { VocabIndex } from '@/lib/profiles/vocabulary'
import { Eye, EyeOff, ExternalLink, File as FileIcon, FolderTree, Package, Tag } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    source: unknown
    mode: 'view' | 'edit'
    vocab?: VocabIndex | null
    selected?: string
    height?: string
  }>(),
  { vocab: null, selected: undefined, height: '36rem' },
)
const emit = defineEmits<{
  (e: 'select', entityId: string): void
  (e: 'open', entityId: string): void
  (e: 'update', draft: CrateDraft): void
}>()

const KINDS: GraphNodeKind[] = ['root', 'dataset', 'file', 'contextual', 'external']
const KIND_ICONS: Record<GraphNodeKind, Component> = {
  root: Package,
  dataset: FolderTree,
  file: FileIcon,
  contextual: Tag,
  external: ExternalLink,
}
const BADGE_VARIANTS: Record<GraphNodeKind, 'default' | 'secondary' | 'outline'> = {
  root: 'default',
  dataset: 'secondary',
  file: 'secondary',
  contextual: 'outline',
  external: 'outline',
}
const MARKER = { type: MarkerType.ArrowClosed, color: 'context-stroke', width: 16, height: 16 }

const draft = computed(() => toDraft(props.source))
const model = computed(() => crateGraph(draft.value, props.vocab))
const hasContext = computed(() => model.value.nodes.some((node) => node.kind === 'contextual' || node.kind === 'external'))

// Someone's own choice wins; until they make one the crate's size decides.
const contextChoice = ref<boolean | null>(null)
const contextShown = computed(() => contextChoice.value ?? model.value.nodes.length <= CONTEXT_LIMIT)
const shown = computed(() => (contextShown.value ? model.value : dataOnly(model.value)))
const summary = computed(() => describeGraph(shown.value))

// The whole crate stays in view: fitted when the nodes are placed, when the
// canvas changes size and whenever an entity comes or goes.
const FIT = { padding: 0.25, maxZoom: 1, duration: 0 }
const { fitView, onNodesInitialized, dimensions } = useVueFlow()
onNodesInitialized(() => void fitView(FIT))
watch(() => `${dimensions.value.width}x${dimensions.value.height}`, () => void fitView(FIT))

const nodes = computed(() => layoutGraph(shown.value).map((placed) => ({
  id: placed.node.id,
  type: 'crate',
  position: { x: placed.x, y: placed.y },
  data: placed.node,
})))
watch(() => nodes.value.length, () => void nextTick(() => fitView(FIT)))

// A clicked node lights itself and its neighbours and dims the rest; the
// pane clears it. The editor's own selection only draws the ring.
const focus = ref('')
const hovered = ref('')
const ring = computed(() => props.selected ?? focus.value)
const neighbours = computed(() => {
  const ids = new Set<string>()
  for (const edge of shown.value.edges) {
    if (edge.source === focus.value) ids.add(edge.target)
    if (edge.target === focus.value) ids.add(edge.source)
  }
  return ids
})
watch(shown, () => (focus.value = ''))

const edges = computed(() => shown.value.edges.map((edge) => {
  const lit = edge.id === hovered.value || edge.source === focus.value || edge.target === focus.value
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: lit ? edge.label : undefined,
    class: lit ? 'is-lit' : focus.value ? 'is-dim' : '',
    markerEnd: MARKER,
  }
}))

function nodeClass(node: GraphNode): string[] {
  const dimmed = Boolean(focus.value) && node.id !== focus.value && !neighbours.value.has(node.id)
  return [
    node.kind === 'root' ? 'border-primary/50 shadow-md' : '',
    node.kind === 'external' ? 'border-dashed bg-muted/50' : '',
    node.id === ring.value ? 'ring-2 ring-primary' : '',
    dimmed ? 'opacity-40' : '',
  ]
}

function iconFor(node: GraphNode): Component {
  return node.kind === 'contextual' ? typeIcon(node.types) : KIND_ICONS[node.kind]
}

function pick(event: NodeMouseEvent) {
  focus.value = event.node.id
  emit('select', event.node.id)
}

// Edit mode: only the reference properties of the dragged-from entity that
// accept what it was dropped on; picking one writes the reference.
const pending = ref<Connection | null>(null)
const candidates = computed(() => {
  const source = findEntity(draft.value, pending.value?.source ?? '')
  const target = findEntity(draft.value, pending.value?.target ?? '')
  if (!source || !target) return []
  return linkProperties(props.vocab, source.types, target.types)
})

function link(key: string) {
  const connection = pending.value
  pending.value = null
  if (!connection) return
  emit('update', linkReference(draft.value, connection.source, key, connection.target))
}
</script>

<template>
  <div class="crate-graph surface relative overflow-hidden" :style="{ height }">
    <div role="img" :aria-label="`Graph of ${summary}`" class="absolute inset-0 bg-muted/30">
      <VueFlow
        :nodes="nodes"
        :edges="edges"
        :nodes-connectable="mode === 'edit'"
        :zoom-on-double-click="false"
        :min-zoom="0.1"
        :max-zoom="1.5"
        @node-click="pick"
        @node-double-click="(event: NodeMouseEvent) => emit('open', event.node.id)"
        @pane-click="focus = ''"
        @edge-mouse-enter="(event: EdgeMouseEvent) => (hovered = event.edge.id)"
        @edge-mouse-leave="hovered = ''"
        @connect="(connection: Connection) => (pending = connection)"
      >
        <Background :gap="18" />
        <MiniMap v-if="shown.nodes.length > MINIMAP_LIMIT" pannable zoomable />
        <template #node-crate="{ data }">
          <div
            class="surface flex h-16 w-[220px] items-center gap-2.5 px-3 text-left transition-opacity"
            :class="nodeClass(data)"
          >
            <Handle v-if="mode === 'edit'" type="target" :position="Position.Top" />
            <component
              :is="iconFor(data)"
              class="h-4 w-4 shrink-0"
              :class="data.kind === 'root' ? 'text-primary' : 'text-muted-foreground'"
            />
            <div class="min-w-0 flex-1">
              <p
                class="truncate text-xs text-foreground"
                :class="data.kind === 'root' ? 'font-semibold' : 'font-medium'"
                :title="data.label"
              >
                {{ data.label }}
              </p>
              <p class="h-4 truncate text-[10px] text-muted-foreground" :title="data.facts">{{ data.facts }}</p>
            </div>
            <Badge :variant="BADGE_VARIANTS[data.kind as GraphNodeKind]" size="sm" class="shrink-0">
              {{ data.badge }}
            </Badge>
            <Handle v-if="mode === 'edit'" type="source" :position="Position.Bottom" />
          </div>
        </template>
      </VueFlow>
    </div>

    <Controls :show-interactive="false" />

    <ul
      class="absolute left-3 top-3 z-10 flex flex-wrap gap-x-3 gap-y-1 rounded-md border border-border/70 bg-card/90 px-2.5 py-1.5 text-[10px] text-muted-foreground"
      aria-label="Kinds of node"
    >
      <li v-for="kind in KINDS" :key="kind" class="flex items-center gap-1">
        <component :is="KIND_ICONS[kind]" class="h-3 w-3" :class="kind === 'root' ? 'text-primary' : ''" />
        {{ BADGES[kind] }}
      </li>
    </ul>

    <Button
      v-if="hasContext"
      variant="outline"
      size="sm"
      class="absolute right-3 top-3 z-10 h-7 bg-card/90 text-[11px]"
      :aria-pressed="contextShown"
      @click="contextChoice = !contextShown"
    >
      <Eye v-if="contextShown" class="size-3.5" />
      <EyeOff v-else class="size-3.5" />
      Show contextual entities
    </Button>

    <div
      v-if="pending"
      class="absolute left-1/2 top-3 z-20 w-72 -translate-x-1/2 rounded-md border border-border bg-popover p-2 shadow-md"
    >
      <p class="px-1 pb-1 text-xs text-muted-foreground">Link them through which property?</p>
      <ul v-if="candidates.length" class="max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border">
        <li v-for="term in candidates" :key="term.uri">
          <button
            type="button"
            class="w-full px-2.5 py-1.5 text-left text-xs hover:bg-muted/40"
            @click="link(propertyKey(term))"
          >
            {{ term.label }}
          </button>
        </li>
      </ul>
      <p v-else class="px-1 py-2 text-xs text-muted-foreground">
        No property of this entity accepts that.
      </p>
      <div class="mt-2 flex justify-end">
        <Button variant="ghost" size="sm" @click="pending = null">Cancel</Button>
      </div>
    </div>
  </div>
</template>

<style>
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';
@import '@vue-flow/controls/dist/style.css';
@import '@vue-flow/minimap/dist/style.css';

.crate-graph .vue-flow__background circle {
  fill: hsl(var(--muted-foreground) / 0.35);
}
.crate-graph .vue-flow__edge-path {
  stroke: hsl(var(--muted-foreground) / 0.45);
  stroke-width: 1.5;
  transition: stroke 0.15s;
}
.crate-graph .vue-flow__edge.is-lit .vue-flow__edge-path {
  stroke: hsl(var(--primary));
  stroke-width: 2;
}
.crate-graph .vue-flow__edge.is-dim {
  opacity: 0.25;
}
.crate-graph .vue-flow__edge-text {
  fill: hsl(var(--foreground));
  font-size: 10px;
}
.crate-graph .vue-flow__edge-textbg {
  fill: hsl(var(--card));
}
.crate-graph .vue-flow__handle {
  width: 8px;
  height: 8px;
  background: hsl(var(--primary));
  border: 2px solid hsl(var(--card));
}
.crate-graph .vue-flow__controls {
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: 0.375rem;
  box-shadow: none;
}
.crate-graph .vue-flow__controls-button {
  background: hsl(var(--card));
  border-bottom-color: hsl(var(--border));
  color: hsl(var(--foreground));
}
.crate-graph .vue-flow__controls-button svg {
  fill: currentColor;
}
.crate-graph .vue-flow__controls-button:hover {
  background: hsl(var(--accent));
}
.crate-graph .vue-flow__minimap {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 0.375rem;
}
.crate-graph .vue-flow__minimap-node {
  fill: hsl(var(--muted-foreground) / 0.5);
}
.crate-graph .vue-flow__minimap-mask {
  fill: hsl(var(--muted) / 0.7);
}
</style>
