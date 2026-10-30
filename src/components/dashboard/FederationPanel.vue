<script setup lang="ts">
import { computed } from 'vue'
import { useNow } from '@vueuse/core'
import EmptyState from '@/components/ui/EmptyState.vue'
import type { RealmNodeInfo } from '@/lib/api'
import { connectionLabel, connectionVariant, kindLabel, nodeName } from '@/components/nodes/node-display'
import { THIS_COMPUTER, useRealmNodes } from '@/composables/useRealmNodes'
import { isDesktop } from '@/lib/desktop'
import { relativeTime, truncateMiddle } from '@/lib/utils'
import { Laptop } from '@lucide/vue'

const props = defineProps<{
  nodes: RealmNodeInfo[]
  /** id of the node this portal is connected to */
  localPeerId?: string
  /** This computer in the desktop: its node id, name and the realm nodes it is connected to now. */
  computer?: { id: string; name: string; peers: string[] } | null
}>()

// The page decides what a chosen node opens, so choosing the same node again works too.
const emit = defineEmits<{ select: [nodeId: string] }>()
const openNode = (id: string) => emit('select', id)

// Topology coordinate system: everything below lives in this viewBox.
const VW = 600
const VH = 360
const CX = VW / 2
const CY = VH / 2
// Elliptical spread: a tighter horizontal and a taller vertical radius keep
// the panel size but pull nodes toward the top/bottom, so hub connections run
// steep instead of flat.
const RADIUS_X = 92
const RADIUS_Y = 132
const RING = 13
const TRIM = RING + 3
const ARC_R = RING + 4
const LABEL_CAP = 10

// Honesty: the hub is the node serving this portal, and each edge reflects only
// that node's own connection_status to it, never a fabricated mesh.
const hub = computed<RealmNodeInfo | undefined>(() => {
  return props.localPeerId ? props.nodes.find((node) => node.node_id === props.localPeerId) : undefined
})

// On the desktop the hub is a realm node, not the device serving this portal, so it goes by name.
const { displayName } = useRealmNodes()
const desktop = isDesktop()
const hubName = computed(() => (desktop && hub.value ? displayName(hub.value.node_id) : null))

const spokes = computed(() =>
  props.nodes
    .filter((node) => node.node_id !== hub.value?.node_id)
    .sort((a, b) => a.node_id.localeCompare(b.node_id)),
)

// This computer sits at the right edge, with a quiet line to each realm node it is connected to.
const PC_X = VW - 100
const PC_Y = CY - 30
const PC_RING = 9
// A longer name is cut so it stays inside the right edge of the viewBox.
const PC_NAME_MAX = 20

const computer = computed(() => {
  if (!desktop || !hub.value || !props.computer) return null
  const peers = new Set(props.computer.peers)
  const lines = [{ node: hub.value, cx: CX, cy: CY }, ...placedSpokes.value]
    .filter((placed) => peers.has(placed.node.node_id))
    .map((placed) => {
      const dx = placed.cx - PC_X
      const dy = placed.cy - PC_Y
      const len = Math.hypot(dx, dy) || 1
      return {
        id: placed.node.node_id,
        x1: PC_X + (dx / len) * (PC_RING + 3),
        y1: PC_Y + (dy / len) * (PC_RING + 3),
        x2: placed.cx - (dx / len) * TRIM,
        y2: placed.cy - (dy / len) * TRIM,
      }
    })
  const chars = Array.from(props.computer.name)
  const shortName = chars.length > PC_NAME_MAX ? `${chars.slice(0, PC_NAME_MAX - 1).join('')}…` : props.computer.name
  const connected = lines.length > 0
  // Under its own name it is "This computer"; without one, the name already says so.
  const caption = [props.computer.name === THIS_COMPUTER ? '' : 'This computer', connected ? '' : 'not connected'].filter(Boolean).join(', ')
  return { id: props.computer.id, name: props.computer.name, shortName, lines, connected, caption: caption.charAt(0).toUpperCase() + caption.slice(1) }
})

const topologyLabel = computed(() => {
  if (!computer.value) return 'Realm node topology'
  const { name, connected } = computer.value
  return `Realm node topology. This computer, ${name}, is ${connected ? 'connected' : 'not connected'}.`
})

const showLabels = computed(() => spokes.value.length <= LABEL_CAP)

type Placed = { node: RealmNodeInfo; cx: number; cy: number }

// FNV-1a: a stable per-node seed so jitter is deterministic across refreshes.
function nodeHash(id: string): number {
  let hash = 2166136261
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

// Aperiodic slot stagger: uniform slots put opposite nodes exactly 180° apart,
// which renders their hub connections as one straight line. A three-step
// pattern keeps every pair of edges at a visibly distinct angle.
const STAGGER_PATTERN = [-1, 0.5, 1]

const placedSpokes = computed<Placed[]>(() => {
  const list = spokes.value
  const count = Math.max(list.length, 1)
  const slot = 360 / count
  return list.map((node, i) => {
    const seed = nodeHash(node.node_id)
    const angleJitter = ((seed & 0xffff) / 0x10000 - 0.5) * Math.min(slot * 0.6, 26)
    const stagger = Math.min(slot * 0.22, 16) * STAGGER_PATTERN[i % STAGGER_PATTERN.length]
    const spread = 0.8 + (((seed >>> 16) & 0xffff) / 0x10000) * 0.28
    const angle = (-90 + slot * i + stagger + angleJitter) * (Math.PI / 180)
    return {
      node,
      cx: CX + Math.cos(angle) * RADIUS_X * spread,
      cy: CY + Math.sin(angle) * RADIUS_Y * spread,
    }
  })
})

const edges = computed(() => {
  if (!hub.value) return []
  return placedSpokes.value.map((placed) => {
    const dx = placed.cx - CX
    const dy = placed.cy - CY
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    return {
      id: placed.node.node_id,
      x1: CX + ux * TRIM,
      y1: CY + uy * TRIM,
      x2: placed.cx - ux * TRIM,
      y2: placed.cy - uy * TRIM,
      connected: placed.node.connection_status === 'connected',
    }
  })
})

// Reading `now` re-renders heartbeat freshness as time passes.
const now = useNow({ interval: 1_000 })

function heartbeatAge(node: RealmNodeInfo): number | null {
  const ms = node.info?.utilization.heartbeat_at_ms
  return ms && now.value ? now.value.getTime() - ms : null
}

function isFresh(node: RealmNodeInfo): boolean {
  const age = heartbeatAge(node)
  return age !== null && age < 90_000
}

function nodeOpacity(node: RealmNodeInfo): number {
  return isFresh(node) ? 1 : 0.5
}

function heartbeatLabel(node: RealmNodeInfo): string | null {
  const ms = node.info?.utilization.heartbeat_at_ms
  return ms && now.value ? relativeTime(new Date(ms).toISOString()) : null
}

// Each node goes by the shared name rule, cut to fit under its ring; the id stays in the tooltip.
const LABEL_MAX = 22
function label(node: RealmNodeInfo): string {
  const chars = Array.from(nodeName(node))
  return chars.length > LABEL_MAX ? `${chars.slice(0, LABEL_MAX - 1).join('')}…` : chars.join('')
}

function nodeTitle(node: RealmNodeInfo): string {
  const parts = [truncateMiddle(node.node_id), kindLabel[node.kind], connectionLabel(node)]
  const beat = heartbeatLabel(node)
  if (beat) parts.push(`heartbeat ${beat}`)
  return parts.join(', ')
}

const kindStroke: Record<RealmNodeInfo['kind'], string> = {
  management: '#335DC6',
  server: '#24A9E6',
  user: 'hsl(var(--muted-foreground))',
}

function connColor(node: RealmNodeInfo): string {
  return connectionVariant(node) === 'success' ? '#10b981' : 'hsl(var(--muted-foreground))'
}

function loadPermille(node: RealmNodeInfo): number {
  return node.info?.utilization.load_permille ?? 0
}

function hasLoad(node: RealmNodeInfo): boolean {
  return loadPermille(node) > 0
}

function loadColor(node: RealmNodeInfo): string {
  const permille = loadPermille(node)
  if (permille >= 800) return 'hsl(var(--destructive))'
  if (permille >= 500) return '#f59e0b'
  return '#10b981'
}

function loadArc(cx: number, cy: number, permille: number): string {
  const endDeg = Math.min(permille / 1000, 0.9999) * 360
  const rad = (deg: number) => (deg - 90) * (Math.PI / 180)
  const sx = cx + ARC_R * Math.cos(rad(0))
  const sy = cy + ARC_R * Math.sin(rad(0))
  const ex = cx + ARC_R * Math.cos(rad(endDeg))
  const ey = cy + ARC_R * Math.sin(rad(endDeg))
  return `M ${sx} ${sy} A ${ARC_R} ${ARC_R} 0 ${endDeg > 180 ? 1 : 0} 1 ${ex} ${ey}`
}
</script>

<template>
  <section>
    <div class="surface overflow-hidden rounded-xl p-0">
      <EmptyState v-if="!nodes.length" class="m-5" title="This realm has no nodes yet." />

      <template v-else>
        <!-- Topology: a single SVG so connections truly terminate at nodes -->
        <div class="border-b border-border/60 bg-background">
          <svg
            :viewBox="`0 0 ${VW} ${VH}`"
            preserveAspectRatio="xMidYMid meet"
            class="block h-auto w-full"
            role="img"
            :aria-label="topologyLabel"
          >
            <defs>
              <pattern id="fed-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M 32 0 L 0 0 0 32" fill="none" stroke="hsl(var(--border))" stroke-opacity="0.55" stroke-width="1" />
              </pattern>
              <radialGradient id="fed-glow" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0%" stop-color="#4E86D7" stop-opacity="0.12" />
                <stop offset="100%" stop-color="#4E86D7" stop-opacity="0" />
              </radialGradient>
              <radialGradient id="fed-glow-hub" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0%" stop-color="#55C4DE" stop-opacity="0.18" />
                <stop offset="100%" stop-color="#55C4DE" stop-opacity="0" />
              </radialGradient>
            </defs>

            <rect :width="VW" :height="VH" fill="url(#fed-grid)" opacity="0.5" />
            <ellipse :cx="CX" :cy="CY" :rx="VW * 0.4" :ry="VH * 0.42" fill="url(#fed-glow)" />

            <!-- Edges first so nodes sit on top. Only connected links animate:
                 the flow toward the hub is truthful for connection_status. -->
            <g v-for="e in edges" :key="e.id">
              <template v-if="e.connected">
                <line
                  :x1="e.x1"
                  :y1="e.y1"
                  :x2="e.x2"
                  :y2="e.y2"
                  stroke="#10b981"
                  stroke-opacity="0.4"
                  stroke-width="1.5"
                  stroke-linecap="round"
                />
                <line
                  class="fed-flow"
                  :x1="e.x1"
                  :y1="e.y1"
                  :x2="e.x2"
                  :y2="e.y2"
                  stroke="#10b981"
                  stroke-opacity="0.65"
                  stroke-width="1.75"
                  stroke-linecap="round"
                />
              </template>
              <line
                v-else
                :x1="e.x1"
                :y1="e.y1"
                :x2="e.x2"
                :y2="e.y2"
                stroke="hsl(var(--muted-foreground))"
                stroke-opacity="0.3"
                stroke-dasharray="3 6"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </g>

            <line
              v-for="l in computer?.lines ?? []"
              :key="`pc-${l.id}`"
              :x1="l.x1"
              :y1="l.y1"
              :x2="l.x2"
              :y2="l.y2"
              stroke="hsl(var(--muted-foreground))"
              stroke-opacity="0.6"
              stroke-dasharray="4 4"
              stroke-width="1"
            />

            <!-- Spoke nodes -->
            <g
              v-for="p in placedSpokes"
              :key="p.node.node_id"
              class="fed-node cursor-pointer focus:outline-none"
              role="link"
              tabindex="0"
              :opacity="nodeOpacity(p.node)"
              :aria-label="`Open ${nodeName(p.node)}`"
              @click="openNode(p.node.node_id)"
              @keydown.enter="openNode(p.node.node_id)"
            >
              <title>{{ nodeTitle(p.node) }}</title>
              <circle
                v-if="isFresh(p.node)"
                class="fed-pulse"
                :cx="p.cx"
                :cy="p.cy"
                :r="RING"
                fill="none"
                :stroke="kindStroke[p.node.kind]"
                stroke-width="1"
              />
              <circle :cx="p.cx" :cy="p.cy" :r="RING" fill="hsl(var(--card))" :stroke="kindStroke[p.node.kind]" stroke-width="1.5" />
              <path
                v-if="hasLoad(p.node)"
                :d="loadArc(p.cx, p.cy, loadPermille(p.node))"
                fill="none"
                :stroke="loadColor(p.node)"
                stroke-width="2"
                stroke-linecap="round"
              />
              <circle :cx="p.cx" :cy="p.cy" r="4" :fill="connColor(p.node)" />
              <text
                v-if="showLabels"
                :x="p.cx"
                :y="p.cy + RING + 14"
                text-anchor="middle"
                font-family="Inter, sans-serif"
                font-size="10"
                font-weight="600"
                fill="hsl(var(--foreground))"
              >
                {{ label(p.node) }}
              </text>
            </g>

            <!-- Hub: the node serving this portal -->
            <g
              v-if="hub"
              class="fed-node cursor-pointer focus:outline-none"
              role="link"
              tabindex="0"
              :aria-label="`Open ${nodeName(hub)}`"
              @click="openNode(hub.node_id)"
              @keydown.enter="openNode(hub.node_id)"
            >
              <title>{{ nodeTitle(hub) }}, {{ hubName ?? 'this node' }}</title>
              <circle :cx="CX" :cy="CY" :r="RING + 10" fill="url(#fed-glow-hub)" />
              <circle :cx="CX" :cy="CY" :r="RING + 2" fill="hsl(var(--card))" stroke="#55C4DE" stroke-width="1.5" />
              <path
                v-if="hasLoad(hub)"
                :d="loadArc(CX, CY, loadPermille(hub))"
                fill="none"
                :stroke="loadColor(hub)"
                stroke-width="2"
                stroke-linecap="round"
              />
              <circle :cx="CX" :cy="CY" r="4.5" fill="#55C4DE" />
              <text
                :x="CX"
                :y="CY + RING + 16"
                text-anchor="middle"
                font-family="Inter, sans-serif"
                font-size="10"
                font-weight="600"
                fill="hsl(var(--foreground))"
              >
                {{ label(hub) }}
              </text>
              <!-- In the browser the hub serves this portal; in the desktop its name above already says which. -->
              <text v-if="!desktop" :x="CX" :y="CY + RING + 27" text-anchor="middle" font-family="Inter, sans-serif" font-size="9" fill="hsl(var(--muted-foreground))">
                this node
              </text>
            </g>

            <!-- This computer, desktop only -->
            <g v-if="computer" :opacity="computer.connected ? 1 : 0.5">
              <title>{{ computer.name }}</title>
              <circle
                :cx="PC_X"
                :cy="PC_Y"
                :r="PC_RING"
                fill="hsl(var(--card))"
                stroke="hsl(var(--muted-foreground))"
                stroke-width="1.25"
                :stroke-dasharray="computer.connected ? undefined : '2 2'"
              />
              <Laptop :x="PC_X - 5" :y="PC_Y - 5" :size="10" color="hsl(var(--muted-foreground))" />
              <text
                :x="PC_X"
                :y="PC_Y + PC_RING + 14"
                text-anchor="middle"
                font-family="Inter, sans-serif"
                font-size="10"
                font-weight="600"
                fill="hsl(var(--foreground))"
              >
                {{ computer.shortName }}
              </text>
              <text :x="PC_X" :y="PC_Y + PC_RING + 25" text-anchor="middle" font-family="Inter, sans-serif" font-size="9" fill="hsl(var(--muted-foreground))">
                {{ computer.caption }}
              </text>
            </g>
          </svg>
          <p v-if="edges.length || computer" class="border-t border-border/60 px-5 py-2 text-[11px] text-muted-foreground">
            <template v-if="hubName">
              Connections as seen by {{ hubName }}.
              <template v-if="computer">
                {{ computer.connected ? 'This computer shows its own.' : 'This computer is not connected right now.' }}
              </template>
            </template>
            <template v-else>Edges show connections as seen by the node serving this portal, not full mesh topology.</template>
          </p>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.fed-pulse {
  transform-box: fill-box;
  transform-origin: center;
  animation: fed-pulse 2.4s ease-out infinite;
}

/* Dashes drift toward the path start (the hub) to read as a live inbound link. */
.fed-flow {
  stroke-dasharray: 2 14;
  animation: fed-flow 1.6s linear infinite;
}

@keyframes fed-pulse {
  0% {
    transform: scale(1);
    opacity: 0.5;
  }
  100% {
    transform: scale(1.7);
    opacity: 0;
  }
}

@keyframes fed-flow {
  to {
    stroke-dashoffset: 16;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fed-pulse {
    animation: none;
    opacity: 0;
  }

  .fed-flow {
    animation: none;
  }
}
</style>
