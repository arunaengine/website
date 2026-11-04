<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronDown, CircleCheck, Clock, Cloud, FileBraces, FlaskConical, Fish, Globe, Microscope, Network, Tag, TestTubes, Workflow } from '@lucide/vue'
import { createTimers, phoneScreen, reducedMotion } from '@/lib/landing/timers'

const props = defineProps<{ play: number }>()

const NODES = [
  { id: 'imaging', org: 'Imaging facility, Heidelberg', icon: Microscope, x: 120, y: 70 },
  { id: 'fish-lab', org: 'Fish facility, Boston', icon: Fish, x: 300, y: 48 },
  { id: 'sequencing', org: 'Sequencing core, Tokyo, behind a firewall', icon: TestTubes, x: 470, y: 78 },
  { id: 'genomics', org: 'Genomics group, San Diego', icon: FlaskConical, x: 200, y: 168 },
  { id: 'archive', org: 'Cloud archive, Mumbai', icon: Cloud, x: 400, y: 172 },
  { id: 'NFDI realm', org: 'Another realm, connected', icon: Globe, x: 572, y: 168, realm: true },
]
const LINKS: [number, number, boolean?][] = [[0, 1], [1, 2], [0, 3], [3, 4], [4, 2], [1, 3], [1, 4], [2, 5, true]]
// The links of the fish facility, which goes offline in this view.
const PILOT = [0, 1, 5, 6]
const EDITS = [
  { icon: FileBraces, text: 'Fish sheet: 6 crosses added' },
  { icon: Tag, text: 'Fish ZH-12-07: status changed from breeding to retired' },
  { icon: Workflow, text: 'Run record of the genotyping check' },
]

type Status = { pill: 'off' | 'wait' | 'ok'; text: string } | null

const phone = ref(false)
const offline = ref(false)
const highlight = ref(false)
const editsShown = ref(false)
const merged = ref(false)
// Parts of the edits box shown so far: the disclosure line first, then one edit per step.
const kept = ref(EDITS.length + 1)
const status = ref<Status>(null)
const timers = createTimers()
let generation = 0
let touched = false
let run = 0

// Phones spread the rows so the map is taller, and give edge labels more room.
const points = computed(() => NODES.map((node) => ({ ...node, y: phone.value ? Math.round(40 + (node.y - 48) * 1.6) : node.y })))
const viewBox = computed(() => (phone.value ? '14 -40 672 386' : '70 -6 560 224'))

// Top-row labels sit above their node and bottom-row labels below, so no line runs through them.
function labelY(y: number): number {
  return y < 120 ? y - 21 : y + (phone.value ? 40 : 29)
}

// The fish facility goes offline, keeps its edits and merges them on return.
async function setOffline(off: boolean) {
  const mine = ++generation
  offline.value = off
  highlight.value = true
  if (off) {
    editsShown.value = true
    merged.value = false
    kept.value = 0
    status.value = { pill: 'off', text: 'Offline' }
    for (let n = 1; n <= EDITS.length; n++) {
      await timers.wait(reducedMotion() ? 0 : 700)
      if (mine !== generation) return
      kept.value = n
      status.value = { pill: 'off', text: `Offline, ${n} edit${n > 1 ? 's' : ''} kept` }
    }
    return
  }
  status.value = { pill: 'wait', text: 'Merging 3 edits' }
  await timers.wait(reducedMotion() ? 0 : 1200)
  if (mine !== generation) return
  status.value = { pill: 'ok', text: 'Edits merged' }
  merged.value = true
  await timers.wait(2400)
  if (mine === generation) highlight.value = false
}

function toggle() {
  touched = true
  void setOffline(!offline.value)
}

async function play() {
  const mine = ++run
  generation++
  offline.value = false
  editsShown.value = false
  status.value = null
  highlight.value = false
  await timers.wait(700)
  if (mine !== run || touched) return
  await setOffline(true)
  await timers.wait(1400)
  if (mine === run && !touched) void setOffline(false)
}

onMounted(() => {
  phone.value = phoneScreen()
  if (!reducedMotion()) return
  editsShown.value = true
  merged.value = true
  status.value = { pill: 'ok', text: 'Edits merged' }
})

watch(
  () => props.play,
  () => {
    if (!reducedMotion()) void play()
  },
)

onBeforeUnmount(() => {
  run++
  generation++
  timers.clear()
})
</script>

<template>
  <div class="pv-one">
    <figure aria-live="polite" class="card status">
      <div class="card-h">
        <span><Network />Node map</span>
        <button :aria-checked="offline" class="switch" role="switch" type="button" @click="toggle">
          <span class="knob"></span><span class="sw-l">{{ offline ? 'Fish facility offline' : 'Fish facility online' }}</span>
        </button>
        <small><Clock />Updated 14:32</small>
      </div>
      <svg aria-label="Five connected nodes and one connected realm" class="map" role="img" :viewBox="viewBox">
        <line
          v-for="([a, b, far], index) in LINKS"
          :key="index"
          class="ln-l"
          :class="{ far, down: offline && PILOT.includes(index) }"
          :x1="points[a]!.x"
          :x2="points[b]!.x"
          :y1="points[a]!.y"
          :y2="points[b]!.y"
        />
        <g v-for="(node, index) in points" :key="node.id" class="nd" :class="{ realm: node.realm, sel: index === 1, down: index === 1 && offline }">
          <circle v-if="index === 1" class="h" :cx="node.x" :cy="node.y" r="19" />
          <circle class="r" :cx="node.x" :cy="node.y" r="13" />
          <circle class="c" :cx="node.x" :cy="node.y" r="5" />
          <text :x="node.x" :y="labelY(node.y)">{{ node.id }}</text>
        </g>
      </svg>
      <ul class="nodes">
        <li v-for="(node, index) in NODES" :key="node.id" :class="{ hl: index === 1 && highlight }">
          <span class="tile"><component :is="node.icon" /></span>
          <b :class="{ nm: node.realm }">{{ node.id }}</b>
          <span class="org">{{ node.org }}</span>
          <span class="st">
            <span v-if="node.realm" class="pill">Connected</span>
            <span v-else-if="index === 1 && status" class="pill" :class="status.pill">{{ status.text }}</span>
            <CircleCheck v-else class="ok" />
          </span>
        </li>
      </ul>
      <div class="edits" :class="{ merged }" :hidden="!editsShown">
        <b>{{ merged ? '3 edits merged into the realm' : 'Edits made offline on fish-lab' }}</b>
        <span v-show="kept > 0" class="disc sm"><ChevronDown />View the 3 edits</span>
        <span v-for="(edit, index) in EDITS" v-show="index + 1 < kept" :key="edit.text"><component :is="edit.icon" /><em>{{ edit.text }}</em></span>
      </div>
    </figure>
  </div>
</template>
