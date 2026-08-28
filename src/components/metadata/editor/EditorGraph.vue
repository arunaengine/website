<script setup lang="ts">
import { computed, ref } from 'vue'
import { Handle, Position, VueFlow, type Connection, type NodeMouseEvent } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import { entityIcon } from './icons'
import { crateGraph, layoutGraph, type GraphNode } from '@/lib/crate/graph'
import {
  addValue,
  findEntity,
  linkProperties,
  propertyKey,
  type CrateDraft,
} from '@/lib/crate/editor'
import type { VocabIndex } from '@/lib/profiles/vocabulary'
import { ExternalLink } from '@lucide/vue'

const props = defineProps<{ draft: CrateDraft; vocab: VocabIndex | null; selected: string }>()
const emit = defineEmits<{
  (e: 'select', entityId: string): void
  (e: 'open', entityId: string): void
  (e: 'update', draft: CrateDraft): void
}>()

const pending = ref<Connection | null>(null)

const model = computed(() => crateGraph(props.draft, props.vocab))
const nodes = computed(() => layoutGraph(model.value).map((placed) => ({
  id: placed.node.id,
  type: 'crate',
  position: { x: placed.x, y: placed.y },
  data: placed.node,
})))
const edges = computed(() => model.value.edges.map((edge) => ({
  id: edge.id,
  source: edge.source,
  target: edge.target,
  label: edge.label,
})))

// Only the reference properties of the dragged-from entity that accept what it
// was dropped on; picking one writes the reference.
const candidates = computed(() => {
  const source = findEntity(props.draft, pending.value?.source ?? '')
  const target = findEntity(props.draft, pending.value?.target ?? '')
  if (!source || !target) return []
  return linkProperties(props.vocab, source.types, target.types)
})

function connect(connection: Connection) {
  pending.value = connection
}

function pick(key: string) {
  const connection = pending.value
  pending.value = null
  if (!connection) return
  emit('update', addValue(props.draft, connection.source, key, {
    kind: 'reference',
    value: connection.target,
  }))
}

function iconFor(node: GraphNode) {
  return node.kind === 'external' ? ExternalLink : entityIcon(findEntity(props.draft, node.id), node.kind === 'root')
}
</script>

<template>
  <div class="surface relative h-[32rem] overflow-hidden">
    <VueFlow
      :nodes="nodes"
      :edges="edges"
      fit-view-on-init
      :min-zoom="0.2"
      @node-click="(event: NodeMouseEvent) => emit('select', event.node.id)"
      @node-double-click="(event: NodeMouseEvent) => emit('open', event.node.id)"
      @connect="connect"
    >
      <Background :gap="18" />
      <Controls />
      <template #node-crate="{ data }">
        <div
          class="w-[200px] rounded-lg border bg-card px-3 py-2 text-left shadow-sm"
          :class="[
            data.kind === 'external' ? 'border-dashed border-border' : 'border-border',
            data.id === selected ? 'ring-2 ring-primary' : '',
          ]"
        >
          <Handle type="target" :position="Position.Top" />
          <div class="flex items-center gap-1.5">
            <component :is="iconFor(data)" class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <Badge
              :variant="data.kind === 'root' ? 'default' : data.kind === 'external' ? 'outline' : 'secondary'"
              size="sm"
            >
              {{ data.badge }}
            </Badge>
          </div>
          <p class="mt-1 truncate text-xs font-medium text-foreground">{{ data.label }}</p>
          <p v-if="data.types.length" class="truncate text-[10px] text-muted-foreground">
            {{ data.types.join(', ') }}
          </p>
          <Handle type="source" :position="Position.Bottom" />
        </div>
      </template>
    </VueFlow>

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
            @click="pick(propertyKey(term))"
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
</style>
