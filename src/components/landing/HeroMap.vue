<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Database, Folder } from '@lucide/vue'
import { LAND_PATH } from '@/lib/landing/world'
import { SITES, project } from '@/lib/landing/sites'
import { createTimers, reducedMotion } from '@/lib/landing/timers'

const LABEL_WIDTH = 128
const LABEL_HEIGHT = 36

const pins = SITES.filter((site) => site.at).map((site) => ({ ...site, p: project(...site.at!) }))
const hub = pins.find((pin) => pin.hub)!
const others = pins.filter((pin) => !pin.hub)

const svg = ref<SVGSVGElement | null>(null)
const bucket = ref<HTMLElement | null>(null)
const names: (SVGTextElement | null)[] = []
const places: (SVGTextElement | null)[] = []
const meet = ref<[number, number]>([300, 160])
const widths = ref(pins.map(() => LABEL_WIDTH))
const active = ref(1)
const built = ref(false)
const timers = createTimers()
let cycle: ReturnType<typeof setInterval> | undefined

const activeName = computed(() => SITES[active.value]!.name)
const hubLine = computed(() => `M${hub.p[0]} ${hub.p[1]} L${meet.value[0]} ${meet.value[1]}`)

function arc([x, y]: [number, number]): string {
  const [cx, cy] = meet.value
  const bend = Math.hypot(cx - x, cy - y) * 0.18
  return `M${x} ${y} Q${(x + cx) / 2} ${(y + cy) / 2 - bend} ${cx} ${cy}`
}

// Each label is as wide as its text, so it sits right next to its pin.
function label(index: number) {
  const [x, y] = pins[index]!.p
  const side = pins[index]!.side
  const w = widths.value[index]!
  const top = side === 'a' ? y - 12 - LABEL_HEIGHT : side === 'b' ? y + 12 : y - LABEL_HEIGHT / 2
  const left = side === 'l' ? x - 10 - w : x - w / 2
  return { x: left, y: top, w }
}

// Every route meets at the logo badge on the bucket's top edge, measured from the layout.
function route() {
  if (!svg.value || !bucket.value) return
  const box = svg.value.getBoundingClientRect()
  const top = bucket.value.getBoundingClientRect()
  if (!box.width) return
  const badge = getComputedStyle(bucket.value, '::before')
  const offset = (parseFloat(badge.marginTop) || 0) + (parseFloat(badge.height) || 0) / 2
  meet.value = [
    ((top.left + top.width / 2 - box.left) * 600) / box.width,
    ((top.top + offset - box.top) * 310) / box.height,
  ]
}

function measure() {
  widths.value = pins.map((_, index) => {
    const text = Math.max(names[index]?.getComputedTextLength() ?? 0, places[index]?.getComputedTextLength() ?? 0)
    return text > 0 ? text + 18 : LABEL_WIDTH
  })
}

onMounted(() => {
  route()
  measure()
  requestAnimationFrame(() => (built.value = true))
  window.addEventListener('resize', route)
  void document.fonts?.ready.then(() => {
    route()
    measure()
  })
  if (reducedMotion()) return
  timers.after(900, () => {
    cycle = setInterval(() => (active.value = (active.value + 1) % SITES.length), 1700)
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', route)
  timers.clear()
  clearInterval(cycle)
})
</script>

<template>
  <div aria-label="Five sites of a zebrafish study on a world map, joined into one bucket" class="hvis" :class="{ built }">
    <svg ref="svg" aria-hidden="true" class="world" viewBox="0 0 600 310">
      <path class="w-land" :d="LAND_PATH" />
      <g>
        <path class="w-link hub" :class="{ on: hub.name === activeName }" :d="hubLine" />
        <path v-for="pin in others" :key="pin.name" class="w-link" :class="{ on: pin.name === activeName }" :d="arc(pin.p)" />
      </g>
      <g>
        <g v-for="(pin, index) in pins" :key="pin.name" class="w-site" :class="{ on: pin.name === activeName }">
          <rect class="w-pill" :height="LABEL_HEIGHT" rx="6" :width="label(index).w" :x="label(index).x" :y="label(index).y" />
          <text :ref="(el) => (names[index] = el as SVGTextElement | null)" class="w-name" :x="label(index).x + 9" :y="label(index).y + 15">{{ pin.name }}</text>
          <text :ref="(el) => (places[index] = el as SVGTextElement | null)" class="w-place" :x="label(index).x + 9" :y="label(index).y + 28">{{ pin.place }}</text>
          <circle class="w-ring" :cx="pin.p[0]" :cy="pin.p[1]" r="12" />
          <circle class="w-pin" :cx="pin.p[0]" :cy="pin.p[1]" r="9" />
          <g :transform="`translate(${pin.p[0]} ${pin.p[1]})`">
            <g class="w-ico"><component :is="pin.icon" :size="11" x="-5.5" y="-5.5" /></g>
          </g>
        </g>
      </g>
    </svg>
    <div ref="bucket" class="hb">
      <div class="hb-h"><Database /><code>s3://zebrafish-heart-2026</code><small>1 bucket, 6 folders, 6 places</small></div>
      <ul id="hrows">
        <li v-for="(site, index) in SITES" :key="site.folder" :class="{ on: index === active }">
          <Folder /><code>{{ site.folder }}</code><span class="sz">{{ site.size }}</span>
          <span class="at"><component :is="site.icon" />{{ site.name }}<small>{{ site.place }}</small></span>
        </li>
      </ul>
    </div>
    <p class="hnote">Example data: a zebrafish study across six locations</p>
  </div>
</template>
