<script setup lang="ts">
import { computed } from 'vue'
import {
  displayName,
  entityGroup,
  orderedEntities,
  partIds,
  referencesTo,
  rootId,
  type CrateDraft,
} from '@/lib/crate/editor'

// Three layers, laid out in plain arithmetic: the root, the data entities it
// lists, and everything contextual. Edges are the references between them.
const NODE_WIDTH = 108
const NODE_HEIGHT = 24
const GAP_X = 10
const GAP_Y = 46

const props = defineProps<{ draft: CrateDraft; selected: string }>()
const emit = defineEmits<{ (e: 'select', entityId: string): void }>()

const layers = computed(() => {
  const parts = partIds(props.draft)
  const rows: Record<string, string[]> = { root: [], data: [], contextual: [] }
  for (const entity of orderedEntities(props.draft)) {
    rows[entityGroup(props.draft, entity, parts)].push(entity.id)
  }
  return [rows.root, rows.data, rows.contextual].filter((row) => row.length)
})

const width = computed(() =>
  Math.max(...layers.value.map((row) => row.length), 1) * (NODE_WIDTH + GAP_X) + GAP_X)
const height = computed(() => (layers.value.length - 1) * GAP_Y + NODE_HEIGHT + GAP_Y / 2)

const placed = computed(() => {
  const positions = new Map<string, { x: number; y: number; label: string }>()
  layers.value.forEach((row, depth) => {
    const rowWidth = row.length * (NODE_WIDTH + GAP_X) - GAP_X
    row.forEach((id, index) => {
      positions.set(id, {
        x: (width.value - rowWidth) / 2 + index * (NODE_WIDTH + GAP_X),
        y: depth * GAP_Y,
        label: displayName(findLabel(id)) || id,
      })
    })
  })
  return positions
})

function findLabel(id: string) {
  return props.draft.entities.find((entity) => entity.id === id)
}

const edges = computed(() => {
  const lines: Array<{ key: string; x1: number; y1: number; x2: number; y2: number }> = []
  for (const target of props.draft.entities) {
    const to = placed.value.get(target.id)
    if (!to) continue
    for (const use of referencesTo(props.draft, target.id)) {
      const from = placed.value.get(use.entityId)
      if (!from || use.entityId === target.id) continue
      lines.push({
        key: `${use.entityId}:${use.property}:${use.index}`,
        x1: from.x + NODE_WIDTH / 2,
        y1: from.y + NODE_HEIGHT,
        x2: to.x + NODE_WIDTH / 2,
        y2: to.y,
      })
    }
  }
  return lines
})

const nodes = computed(() => [...placed.value.entries()].map(([id, node]) => ({ id, ...node })))
const root = computed(() => rootId(props.draft))
</script>

<template>
  <div class="overflow-x-auto rounded-md border border-border bg-muted/20 p-2">
    <svg :viewBox="`0 0 ${width} ${height}`" :width="width" :height="height" role="img" aria-label="Dataset graph">
      <line
        v-for="edge in edges"
        :key="edge.key"
        :x1="edge.x1"
        :y1="edge.y1"
        :x2="edge.x2"
        :y2="edge.y2"
        class="stroke-border"
        stroke-width="1"
      />
      <g v-for="node in nodes" :key="node.id" class="cursor-pointer" @click="emit('select', node.id)">
        <rect
          :x="node.x"
          :y="node.y"
          :width="NODE_WIDTH"
          :height="NODE_HEIGHT"
          rx="6"
          class="stroke-border"
          :class="node.id === selected ? 'fill-primary/15' : node.id === root ? 'fill-card' : 'fill-background'"
        />
        <text
          :x="node.x + NODE_WIDTH / 2"
          :y="node.y + NODE_HEIGHT / 2 + 3"
          text-anchor="middle"
          class="fill-foreground text-[9px]"
        >
          {{ node.label.length > 16 ? `${node.label.slice(0, 15)}…` : node.label }}
        </text>
      </g>
    </svg>
  </div>
</template>
