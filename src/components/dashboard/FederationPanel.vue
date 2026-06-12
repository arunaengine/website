<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { Node } from '@/data/types'

const props = defineProps<{
  nodes: Node[]
  /** peer id of the node this portal is connected to */
  primaryId?: string
}>()

/* SVG viewport — everything below lives in this coordinate system. */
const VW = 600
const VH = 300
const RING = 14
const TRIM = RING + 3

/* Preset layout spots (percent of canvas) for up to 8 nodes. */
const SPOTS: Array<[number, number]> = [
  [22, 24],
  [78, 30],
  [50, 78],
  [14, 70],
  [86, 74],
  [50, 10],
  [32, 50],
  [68, 54],
]

type PlacedNode = Node & { cx: number; cy: number; primary: boolean }

const placed = computed<PlacedNode[]>(() =>
  props.nodes.slice(0, SPOTS.length).map((node, i) => ({
    ...node,
    cx: 80 + (SPOTS[i][0] / 100) * (VW - 160),
    cy: 44 + (SPOTS[i][1] / 100) * (VH - 112),
    primary: !!props.primaryId && node.id === props.primaryId,
  })),
)

/* All pairwise connections, trimmed so lines terminate at the node rings. */
const edges = computed(() => {
  const list = placed.value
  const out: Array<{
    x1: number
    y1: number
    x2: number
    y2: number
    active: boolean
    syncing: boolean
  }> = []
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]
      const b = list[j]
      const dx = b.cx - a.cx
      const dy = b.cy - a.cy
      const len = Math.hypot(dx, dy) || 1
      const ux = dx / len
      const uy = dy / len
      out.push({
        x1: a.cx + ux * TRIM,
        y1: a.cy + uy * TRIM,
        x2: b.cx - ux * TRIM,
        y2: b.cy - uy * TRIM,
        active: a.status !== 'offline' && b.status !== 'offline',
        syncing:
          a.status === 'syncing' ||
          b.status === 'syncing' ||
          a.status === 'degraded' ||
          b.status === 'degraded',
      })
    }
  }
  return out
})

function statusColor(status: Node['status']): string {
  if (status === 'healthy') return '#4ade80'
  if (status === 'syncing' || status === 'degraded') return '#fbbf24'
  return '#5C6378'
}

const statusLabel: Record<Node['status'], string> = {
  healthy: 'online',
  degraded: 'degraded',
  syncing: 'syncing',
  offline: 'offline',
}
</script>

<template>
  <section>
    <div class="mb-3.5 flex items-center justify-between">
      <h2 class="font-display text-[15px] font-semibold text-foreground/85">
        Federation network
      </h2>
      <div class="flex items-center gap-4 text-[11px] text-muted-foreground">
        <span class="flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full bg-emerald-400" /> Online
        </span>
        <span class="flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full bg-amber-400" /> Syncing
        </span>
        <span class="flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full bg-muted-foreground/50" /> Offline
        </span>
        <RouterLink to="/app/status" class="text-xs font-medium text-primary hover:underline">
          Node status
        </RouterLink>
      </div>
    </div>

    <div class="surface overflow-hidden rounded-xl p-0">
      <div
        v-if="!placed.length"
        class="px-5 py-12 text-center text-xs text-muted-foreground"
      >
        This realm has no nodes yet.
      </div>

      <template v-else>
        <!-- Topology — a single SVG so connections truly terminate at nodes -->
        <div class="border-b border-border/60 bg-background">
          <svg
            :viewBox="`0 0 ${VW} ${VH}`"
            preserveAspectRatio="xMidYMid meet"
            class="block h-auto w-full"
            role="img"
            aria-label="Realm node topology"
          >
            <defs>
              <pattern
                id="fed-grid"
                width="32"
                height="32"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 32 0 L 0 0 0 32"
                  fill="none"
                  stroke="hsl(var(--border))"
                  stroke-opacity="0.55"
                  stroke-width="1"
                />
              </pattern>
              <radialGradient id="fed-glow" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0%" stop-color="#4E86D7" stop-opacity="0.12" />
                <stop offset="100%" stop-color="#4E86D7" stop-opacity="0" />
              </radialGradient>
              <radialGradient id="fed-glow-primary" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0%" stop-color="#55C4DE" stop-opacity="0.18" />
                <stop offset="100%" stop-color="#55C4DE" stop-opacity="0" />
              </radialGradient>
            </defs>

            <rect :width="VW" :height="VH" fill="url(#fed-grid)" opacity="0.5" />
            <ellipse
              :cx="VW / 2"
              :cy="VH / 2 - 20"
              :rx="VW * 0.4"
              :ry="VH * 0.5"
              fill="url(#fed-glow)"
            />

            <!-- Edges first so nodes sit on top -->
            <g v-for="(e, i) in edges" :key="i">
              <line
                :x1="e.x1"
                :y1="e.y1"
                :x2="e.x2"
                :y2="e.y2"
                :stroke="e.syncing ? '#fbbf24' : '#4E86D7'"
                :stroke-opacity="e.active ? 0.45 : 0.18"
                stroke-width="1.5"
                stroke-linecap="round"
              />
              <line
                v-if="e.active"
                :x1="e.x1"
                :y1="e.y1"
                :x2="e.x2"
                :y2="e.y2"
                :stroke="e.syncing ? '#fbbf24' : '#4E86D7'"
                stroke-width="2"
                stroke-dasharray="2 14"
                stroke-linecap="round"
                stroke-opacity="0.5"
              />
            </g>

            <!-- Nodes -->
            <g v-for="n in placed" :key="n.id">
              <circle
                v-if="n.primary"
                :cx="n.cx"
                :cy="n.cy"
                :r="RING + 10"
                fill="url(#fed-glow-primary)"
              />
              <circle
                :cx="n.cx"
                :cy="n.cy"
                :r="RING"
                fill="hsl(var(--card))"
                :stroke="n.primary ? '#55C4DE' : 'hsl(var(--input))'"
                :stroke-width="n.primary ? 1.5 : 1"
              />
              <circle :cx="n.cx" :cy="n.cy" r="5" :fill="statusColor(n.status)" />
              <circle
                :cx="n.cx - 1.2"
                :cy="n.cy - 1.2"
                r="1.2"
                fill="rgba(255,255,255,0.5)"
              />
              <g :transform="`translate(${n.cx}, ${n.cy + RING + 14})`">
                <text
                  text-anchor="middle"
                  font-family="JetBrains Mono, monospace"
                  font-size="10"
                  font-weight="600"
                  fill="hsl(var(--foreground))"
                >
                  {{ n.slug }}
                </text>
                <text
                  y="11"
                  text-anchor="middle"
                  font-family="Inter, sans-serif"
                  font-size="9"
                  fill="hsl(var(--muted-foreground))"
                >
                  {{ n.country }}{{ n.primary ? ' · this node' : '' }}
                </text>
              </g>
            </g>
          </svg>
        </div>

        <!-- Node detail cards -->
        <div
          class="grid"
          :style="{ gridTemplateColumns: `repeat(${Math.min(placed.length, 3)}, 1fr)` }"
        >
          <div
            v-for="(n, i) in placed"
            :key="n.id"
            :class="[
              'flex flex-col gap-3 px-5 py-4',
              i % 3 !== 0 && 'border-l border-border/60',
              i >= 3 && 'border-t border-border/60',
            ]"
          >
            <div>
              <div class="mb-1 flex items-center gap-1.5">
                <span
                  class="h-1.5 w-1.5 rounded-full"
                  :style="{ background: statusColor(n.status) }"
                />
                <span
                  class="text-[10px] font-semibold uppercase tracking-wider"
                  :style="{ color: statusColor(n.status) }"
                >
                  {{ statusLabel[n.status] }}
                </span>
                <span
                  v-if="n.primary"
                  class="rounded-sm border border-aruna-aqua/30 bg-aruna-aqua/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-aruna-aqua"
                >
                  Primary
                </span>
              </div>
              <div class="truncate font-mono text-[13px] font-semibold text-foreground">
                {{ n.name }}
              </div>
              <div class="mt-0.5 truncate font-mono text-[11px] text-muted-foreground/80">
                {{ n.endpoint }}
              </div>
            </div>

            <div
              class="grid grid-cols-3 gap-2 border-t border-border/60 pt-2.5"
            >
              <div>
                <div class="text-[9px] uppercase tracking-wider text-muted-foreground/70">
                  Kind
                </div>
                <div class="mt-0.5 font-mono text-xs font-semibold text-foreground/80">
                  {{ n.country }}
                </div>
              </div>
              <div>
                <div class="text-[9px] uppercase tracking-wider text-muted-foreground/70">
                  Replicas
                </div>
                <div class="mt-0.5 font-mono text-xs font-semibold text-foreground/80">
                  ×{{ n.replicaFactor }}
                </div>
              </div>
              <div>
                <div class="text-[9px] uppercase tracking-wider text-muted-foreground/70">
                  Docs
                </div>
                <div class="mt-0.5 font-mono text-xs font-semibold text-foreground/80">
                  {{ n.metadataCount }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
