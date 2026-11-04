<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { ChevronDown, Clock, Container, File, FileSpreadsheet, GitBranch, HardDrive, Image, Terminal, Workflow } from '@lucide/vue'
import ProvenanceLane, { type LaneStep } from './ProvenanceLane.vue'
import { createTimers, reducedMotion } from '@/lib/landing/timers'

const props = defineProps<{ play: number }>()

const STAGES = ['Queued', 'Initializing', 'Running', 'Completed']
const LANE: LaneStep[] = [
  { icon: Image, name: 'Images', note: '2,304 stacks' },
  { icon: Workflow, name: 'Cellpose', note: 'On imaging', run: true },
  { icon: File, name: 'Cell table', note: '3.1 million cells' },
]
const LOG = [
  ['14:02:11', 'Pulled cellpose 3.1.1'],
  ['14:02:40', 'Mounted heidelberg-imaging/ZH-12_timelapse/, local, 6.2 TiB'],
  ['14:03:02', 'Started segmentation of 2,304 stacks'],
  ['16:41:27', 'Wrote heidelberg-imaging/ZH-12_cells.parquet, 3.1 million cells'],
  ['16:41:29', 'Recorded provenance in ZH-12'],
]

const stage = ref(3)
const progress = ref(1)
const timers = createTimers()
let run = 0

function set(next: number, share: number) {
  stage.value = next
  progress.value = share
}

// A run moves from queued to completed.
async function play() {
  const mine = ++run
  const live = () => mine === run
  set(0, 0)
  await timers.wait(800)
  if (!live()) return
  set(1, 1 / 3)
  await timers.wait(800)
  if (!live()) return
  for (let k = 0; k <= 20; k++) {
    set(2, 1 / 3 + k / 30)
    await timers.wait(100)
    if (!live()) return
  }
  set(3, 1)
}

watch(
  () => props.play,
  () => {
    if (!reducedMotion()) void play()
  },
)

onBeforeUnmount(() => {
  run++
  timers.clear()
})
</script>

<template>
  <div class="pv-one">
    <figure class="card runcard">
      <div class="rh">
        <span class="tile"><Workflow /></span>
        <div><b>Cellpose segmentation of the ZH-12 time-lapse</b><small>Runs on imaging, where the data is</small></div>
        <span class="pill" :class="stage === 3 ? 'ok' : 'wait'">{{ STAGES[stage] }}</span>
      </div>
      <div class="steps">
        <div class="meter"><span :style="{ '--p': `${progress * 100}%` }"></span></div>
        <span v-for="(name, index) in STAGES" :key="name" class="st" :class="{ done: index < stage || stage === 3, now: index === stage && stage < 3 }"><i></i>{{ name }}</span>
      </div>
      <div class="outblk">
        <span class="tile"><FileSpreadsheet /></span>
        <div>
          <small><FileSpreadsheet class="oi" />Output</small><b>Per-cell measurements as Parquet</b><span>heidelberg-imaging/<wbr /><span class="sg">ZH-12_cells.parquet,</span> 3.1 million cells, saved to the dataset</span>
        </div>
      </div>
      <dl class="kv run-kv">
        <dt>Container</dt><dd><Container /><span>cellpose 3.1.1</span></dd>
        <dt>Input</dt><dd><File /><span>2,304 image stacks, 6.2 TiB</span></dd>
        <dt>Node</dt><dd><HardDrive /><span>imaging, Heidelberg</span></dd>
        <dt>Duration</dt><dd><Clock /><span>2 h 39 min, finished 16:41</span></dd>
      </dl>
      <p class="disc"><ChevronDown />View run details</p>
    </figure>
    <div class="rn-pair">
      <div class="dsp rn-prov">
        <div class="sec-h"><span><GitBranch />Recorded provenance</span><small>Saved with the run</small></div>
        <div class="lanes"><ProvenanceLane label="Imaging run" :steps="LANE" /></div>
      </div>
      <div class="dsp rn-log">
        <div class="sec-h"><span><Terminal />Run log</span><small>imaging node</small></div>
        <pre class="mini-term"><code><span v-for="[time, line] in LOG" :key="time" class="rl"><em>{{ time }}</em><span>{{ line }}</span></span></code></pre>
      </div>
    </div>
  </div>
</template>
