<script setup lang="ts">
// The dashboard's realm topology: the node serving this portal in the middle, the other nodes beside
// it and, in the desktop, this computer below. A ring takes the node kind's colour, the dot its
// state, an arc an import. Edges are the hub's own connections only, never a guessed mesh.
import { computed, ref } from 'vue'
import { useElementSize } from '@vueuse/core'
import { Laptop, MapPin } from '@lucide/vue'
import type { RealmNodeInfo } from '@/lib/api'
import { nodeName, nodeOnline, roleLabel } from '@/components/nodes/node-display'
import { THIS_COMPUTER } from '@/composables/useRealmNodes'

const props = defineProps<{
  nodes: RealmNodeInfo[]
  /** The node serving this portal, drawn in the middle. */
  localPeerId?: string
  /** This computer in the desktop: its node id, name and the realm nodes it is connected to now. */
  computer?: { id: string; name: string; peers: string[] } | null
  /** The node lit up from the node table. */
  highlight?: string | null
}>()
const emit = defineEmits<{ select: [nodeId: string]; hover: [nodeId: string | null] }>()

const RING = 20
const HUB_RING = 22
const DEVICE_RING = 18
const ARC = RING + 6
const LABEL_MAX = 22

const KIND_STROKE: Record<RealmNodeInfo['kind'], string> = { management: '#335DC6', server: '#24A9E6', user: 'hsl(var(--muted-foreground))' }

// Drawn in the pane's own pixels, so rings and labels keep their size at every width. The other
// nodes stand above the hub in a flat triangle, lifted more on a narrow pane so labels stay apart.
const root = ref<HTMLElement | null>(null)
const size = useElementSize(root)
const box = computed(() => {
  const w = size.width.value || 520
  const h = size.height.value || 330
  const narrow = w < 470
  const lift = narrow ? 56 : 40
  const spreadX = narrow ? Math.max(80, (w - 32) / 2 - 64) : Math.min(210, Math.max(144, (w - 32) / 2 - 66))
  const below = props.computer ? 58 + 72 : 0
  const top = 44
  const room = h - 56 - top
  const hubY = top + Math.max(0, (room - lift - 35 - 58 - below) / 2) + lift + 35
  return { w, h, cx: w / 2, hubY, lift, spreadX, spreadY: 70, deviceY: hubY + 58 + Math.min(110, Math.max(28, room - lift - 35 - 58 - 72)) + DEVICE_RING }
})

const hub = computed(() => (props.localPeerId ? props.nodes.find((node) => node.node_id === props.localPeerId) : undefined))
// The other nodes on a flat ellipse starting at the left, so two of them stand beside the hub.
const placed = computed(() => {
  const others = props.nodes.filter((node) => node !== hub.value).sort((a, b) => a.node_id.localeCompare(b.node_id))
  return others.map((node, index) => {
    const angle = Math.PI + (2 * Math.PI * index) / others.length
    const { cx, hubY, lift, spreadX, spreadY } = box.value
    return { node, x: cx + Math.cos(angle) * spreadX, y: hubY - lift + Math.sin(angle) * spreadY }
  })
})
// The spokes first, the hub last so it sits on top.
const spots = computed(() => [
  ...placed.value.map((spot) => ({ ...spot, r: RING, isHub: false })),
  ...(hub.value ? [{ node: hub.value, x: box.value.cx, y: box.value.hubY, r: HUB_RING, isHub: true }] : []),
])
const trim = (x1: number, y1: number, r1: number, x2: number, y2: number, r2: number) => {
  const length = Math.hypot(x2 - x1, y2 - y1) || 1
  const [ux, uy] = [(x2 - x1) / length, (y2 - y1) / length]
  return { x1: x1 + ux * (r1 + 3), y1: y1 + uy * (r1 + 3), x2: x2 - ux * (r2 + 3), y2: y2 - uy * (r2 + 3) }
}
const edges = computed(() =>
  hub.value
    ? placed.value.map((spot) => ({
        id: spot.node.node_id,
        connected: spot.node.connection_status === 'connected',
        ...trim(box.value.cx, box.value.hubY, HUB_RING, spot.x, spot.y, RING),
      }))
    : [],
)
// Storage nodes side by side are joined by a straight line while the hub reaches both.
const storageLinks = computed(() => {
  const storage = placed.value.filter((spot) => spot.node.kind === 'server' && spot.node.connection_status === 'connected')
  return storage.slice(1).map((spot, index) => ({
    id: `${storage[index].node.node_id}-${spot.node.node_id}`,
    ...trim(storage[index].x, storage[index].y, RING, spot.x, spot.y, RING),
  }))
})

const computerSpot = computed(() => {
  const own = props.computer
  if (!own) return null
  const peers = new Set(own.peers)
  const { cx, hubY, deviceY } = box.value
  const targets = [...(hub.value ? [{ node: hub.value, x: cx, y: hubY, r: HUB_RING }] : []), ...placed.value.map((spot) => ({ ...spot, r: RING }))]
  const lines = targets
    .filter((target) => peers.has(target.node.node_id))
    .map((target) => ({ id: target.node.node_id, ...trim(cx, deviceY, DEVICE_RING, target.x, target.y, target.r) }))
  const named = own.name !== THIS_COMPUTER
  const type = ['Device', named ? 'this computer' : '', lines.length ? '' : 'not connected'].filter(Boolean).join(', ')
  return { ...own, label: short(own.name), type, lines, connected: lines.length > 0 }
})

function short(name: string): string {
  const chars = Array.from(name)
  return chars.length > LABEL_MAX ? `${chars.slice(0, LABEL_MAX - 1).join('')}…` : name
}
const typeOf = (node: RealmNodeInfo) => `${roleLabel[node.kind].charAt(0).toUpperCase()}${roleLabel[node.kind].slice(1)}`
const importing = (node: RealmNodeInfo) => (node.info?.utilization?.imports_running ?? 0) > 0
// A three-quarter arc around the ring while the node imports.
function arc(x: number, y: number): string {
  const point = (deg: number) => [x + ARC * Math.cos(((deg - 90) * Math.PI) / 180), y + ARC * Math.sin(((deg - 90) * Math.PI) / 180)]
  const [[sx, sy], [ex, ey]] = [point(0), point(270)]
  return `M ${sx} ${sy} A ${ARC} ${ARC} 0 1 1 ${ex} ${ey}`
}

// One place for every node is said once; several are counted.
const placeLabel = computed(() => {
  const places = props.nodes.map((node) => node.place?.trim() || null)
  const distinct = new Set(places.filter(Boolean))
  if (distinct.size === 1 && places.every(Boolean)) return `All nodes are in ${[...distinct][0]}`
  return distinct.size > 1 ? `${distinct.size} places` : null
})

const select = (nodeId: string) => emit('select', nodeId)
const hover = (nodeId: string | null) => emit('hover', nodeId)
const label = computed(() =>
  computerSpot.value
    ? `Realm node topology. This computer, ${computerSpot.value.name}, is ${computerSpot.value.connected ? 'connected' : 'not connected'}.`
    : 'Realm node topology',
)
</script>

<template>
  <div ref="root" class="grid-faint absolute inset-0">
    <p v-if="placeLabel" class="absolute left-4 top-4 z-10 flex items-center gap-1.5 type-secondary">
      <MapPin class="size-3.5" aria-hidden="true" />{{ placeLabel }}
    </p>
    <p v-if="!nodes.length" class="absolute inset-0 grid place-items-center text-sm text-muted-foreground">This realm has no nodes yet.</p>
    <svg v-else :viewBox="`0 0 ${box.w} ${box.h}`" class="absolute inset-0 h-full w-full" role="img" :aria-label="label">
      <defs>
        <radialGradient id="topology-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stop-color="#4E86D7" stop-opacity="0.12" />
          <stop offset="100%" stop-color="#4E86D7" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="topology-glow-hub" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stop-color="#55C4DE" stop-opacity="0.22" />
          <stop offset="100%" stop-color="#55C4DE" stop-opacity="0" />
        </radialGradient>
      </defs>
      <ellipse :cx="box.cx" :cy="box.hubY + 40" :rx="box.spreadX + 90" :ry="box.spreadY + 110" fill="url(#topology-glow)" />

      <template v-for="edge in edges" :key="edge.id">
        <line v-if="edge.connected" :x1="edge.x1" :y1="edge.y1" :x2="edge.x2" :y2="edge.y2" stroke="#10b981" stroke-opacity="0.7" stroke-width="2" stroke-linecap="round" />
        <line v-else :x1="edge.x1" :y1="edge.y1" :x2="edge.x2" :y2="edge.y2" stroke="hsl(var(--muted-foreground))" stroke-opacity="0.4" stroke-dasharray="3 6" stroke-width="1.5" stroke-linecap="round" />
      </template>
      <line
        v-for="link in storageLinks"
        :key="`storage-${link.id}`"
        :x1="link.x1"
        :y1="link.y1"
        :x2="link.x2"
        :y2="link.y2"
        stroke="#10b981"
        stroke-opacity="0.7"
        stroke-width="2"
        stroke-linecap="round"
      />
      <line
        v-for="line in computerSpot?.lines ?? []"
        :key="`device-${line.id}`"
        :x1="line.x1"
        :y1="line.y1"
        :x2="line.x2"
        :y2="line.y2"
        stroke="hsl(var(--muted-foreground))"
        stroke-opacity="0.8"
        stroke-dasharray="5 5"
        stroke-width="1.5"
      />

      <g
        v-for="spot in spots"
        :key="spot.node.node_id"
        class="cursor-pointer focus:outline-none"
        role="link"
        tabindex="0"
        :data-node="spot.node.node_id"
        :opacity="nodeOnline(spot.node) ? 1 : 0.5"
        :aria-label="`Open ${nodeName(spot.node)}`"
        @click="select(spot.node.node_id)"
        @keydown.enter="select(spot.node.node_id)"
        @mouseenter="hover(spot.node.node_id)"
        @mouseleave="hover(null)"
        @focus="hover(spot.node.node_id)"
        @blur="hover(null)"
      >
        <title>{{ nodeName(spot.node) }}</title>
        <circle :cx="spot.x" :cy="spot.y" :r="spot.r + 10" fill="none" stroke="hsl(var(--primary))" stroke-width="2" :opacity="highlight === spot.node.node_id ? 0.6 : 0" />
        <circle v-if="spot.isHub" :cx="spot.x" :cy="spot.y" :r="spot.r + 18" fill="url(#topology-glow-hub)" />
        <circle :cx="spot.x" :cy="spot.y" :r="spot.r" fill="hsl(var(--card))" :stroke="spot.isHub ? '#55C4DE' : KIND_STROKE[spot.node.kind]" stroke-width="2" />
        <path v-if="importing(spot.node)" :d="arc(spot.x, spot.y)" fill="none" stroke="#55C4DE" stroke-width="2.5" stroke-linecap="round" />
        <circle :cx="spot.x" :cy="spot.y" :r="spot.isHub ? 6.5 : 6" :fill="spot.isHub ? '#55C4DE' : nodeOnline(spot.node) ? '#10b981' : 'hsl(var(--muted-foreground))'" />
        <text :x="spot.x" :y="spot.y + spot.r + 18" text-anchor="middle" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="hsl(var(--foreground))" stroke="hsl(var(--background))" stroke-width="4" stroke-linejoin="round" paint-order="stroke">{{ short(nodeName(spot.node)) }}</text>
        <text :x="spot.x" :y="spot.y + spot.r + 33" text-anchor="middle" font-family="Inter, sans-serif" font-size="11.5" fill="hsl(var(--muted-foreground))" stroke="hsl(var(--background))" stroke-width="4" stroke-linejoin="round" paint-order="stroke">{{ typeOf(spot.node) }}</text>
      </g>

      <g
        v-if="computerSpot"
        class="cursor-pointer focus:outline-none"
        role="link"
        tabindex="0"
        :data-node="computerSpot.id"
        :opacity="computerSpot.connected ? 1 : 0.5"
        :aria-label="`Open ${computerSpot.name}`"
        @click="select(computerSpot.id)"
        @keydown.enter="select(computerSpot.id)"
        @mouseenter="hover(computerSpot.id)"
        @mouseleave="hover(null)"
        @focus="hover(computerSpot.id)"
        @blur="hover(null)"
      >
        <title>{{ computerSpot.name }}</title>
        <circle :cx="box.cx" :cy="box.deviceY" :r="DEVICE_RING + 10" fill="none" stroke="hsl(var(--primary))" stroke-width="2" :opacity="highlight === computerSpot.id ? 0.6 : 0" />
        <circle :cx="box.cx" :cy="box.deviceY" :r="DEVICE_RING" fill="hsl(var(--card))" stroke="hsl(var(--muted-foreground))" stroke-width="1.5" />
        <Laptop :x="box.cx - 9" :y="box.deviceY - 9" :size="18" color="hsl(var(--muted-foreground))" />
        <text :x="box.cx" :y="box.deviceY + DEVICE_RING + 18" text-anchor="middle" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="hsl(var(--foreground))" stroke="hsl(var(--background))" stroke-width="4" stroke-linejoin="round" paint-order="stroke">{{ computerSpot.label }}</text>
        <text :x="box.cx" :y="box.deviceY + DEVICE_RING + 33" text-anchor="middle" font-family="Inter, sans-serif" font-size="11.5" fill="hsl(var(--muted-foreground))" stroke="hsl(var(--background))" stroke-width="4" stroke-linejoin="round" paint-order="stroke">{{ computerSpot.type }}</text>
      </g>
    </svg>

    <p v-if="nodes.length" class="absolute bottom-3 left-4 z-10 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span class="inline-flex items-center gap-1.5">
        <svg width="18" height="8" aria-hidden="true"><line x1="1" y1="4" x2="17" y2="4" stroke="#10b981" stroke-opacity="0.7" stroke-width="2" stroke-linecap="round" /></svg>Connected
      </span>
      <span class="inline-flex items-center gap-1.5">
        <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true"><path d="M 0 -5.5 A 5.5 5.5 0 1 1 -5.5 0" fill="none" stroke="#55C4DE" stroke-width="2" stroke-linecap="round" /></svg>Importing
      </span>
      <span v-if="computerSpot" class="inline-flex items-center gap-1.5">
        <svg width="18" height="8" aria-hidden="true"><line x1="1" y1="4" x2="17" y2="4" stroke="currentColor" stroke-dasharray="4 3" stroke-width="1.5" /></svg>Device link
      </span>
    </p>
  </div>
</template>
