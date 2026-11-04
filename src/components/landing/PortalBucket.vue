<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CircleCheck, Cloud, File, FlaskConical, Fish, Globe, HardDrive, Microscope, TestTubes } from '@lucide/vue'
import { createTimers, phoneScreen, reducedMotion } from '@/lib/landing/timers'

const props = defineProps<{ play: number }>()

const FULL = 'aws s3 ls s3://zebrafish-heart-2026/ --recursive --human-readable'
// Phones hide the size column, so they show the command without --human-readable.
const SHORT = 'aws s3 ls --recursive \\\n    s3://zebrafish-heart-2026/'
const PHONE_COPY = 'aws s3 cp \\\n    $B/tokyo-sequencing/\\\n    ZH-12_P01-P12/ZH-12_P01.cram .'

const LISTING = [
  { date: '2026-03-02 11:18:52', size: '842 KiB', path: ['boston-fish/', 'ZH-12_crosses.tsv'], icon: Fish, place: 'Fish facility' },
  { date: '2026-03-02 11:20:14', size: '1.2 MiB', path: ['boston-fish/', 'ZH-12_fish.tsv'], icon: Fish, place: 'Fish facility' },
  {
    date: '2026-03-20 16:41:27',
    size: '412.8 MiB',
    path: ['heidelberg-imaging/', 'ZH-12_cells.parquet'],
    icon: Microscope,
    place: 'Imaging facility',
  },
  {
    date: '2026-03-12 17:45:09',
    size: '2.8 GiB',
    path: ['heidelberg-imaging/', 'ZH-12_timelapse/', 's0001.tif'],
    icon: Microscope,
    place: 'Imaging facility',
  },
  {
    date: '2026-03-12 17:45:31',
    size: '2.8 GiB',
    path: ['heidelberg-imaging/', 'ZH-12_timelapse/', 's0002.tif'],
    icon: Microscope,
    place: 'Imaging facility',
  },
  { date: '2026-02-27 22:10:31', size: '1.1 TiB', path: ['mumbai-archive/', 'ZH-12_raw_2026-02.tar'], icon: Cloud, place: 'Cloud archive' },
  { date: '2025-11-18 08:00:00', size: '1.4 GiB', path: ['ncbi-reference/', 'GRCz11.fa.gz'], icon: Globe, place: 'NCBI' },
  { date: '2026-03-18 10:02:44', size: '3.8 GiB', path: ['sandiego-variants/', 'ZH-12.vcf.gz'], icon: FlaskConical, place: 'Genomics group' },
  {
    date: '2026-03-14 09:12:41',
    size: '38.6 GiB',
    path: ['tokyo-sequencing/', 'ZH-12_P01-P12/', 'ZH-12_P01.cram'],
    icon: TestTubes,
    place: 'Sequencing core',
    sel: true,
  },
  {
    date: '2026-03-14 09:13:07',
    size: '39.1 GiB',
    path: ['tokyo-sequencing/', 'ZH-12_P01-P12/', 'ZH-12_P02.cram'],
    icon: TestTubes,
    place: 'Sequencing core',
  },
]
// The listing lines plus the closing "more objects" line.
const LINES = LISTING.length + 1
const TAIL = 7

const command = ref('')
const listed = ref(0)
const tailOn = ref<boolean[]>(Array(TAIL).fill(false))
const done = ref(false)
const tail: (HTMLElement | null)[] = []
const timers = createTimers()
let full = FULL
let run = 0

function finish() {
  tailOn.value = Array(TAIL).fill(true)
  done.value = true
}

// The command types and the bucket listing streams in, then the copy follows.
async function play() {
  const mine = ++run
  const live = () => mine === run
  done.value = false
  listed.value = 0
  tailOn.value = Array(TAIL).fill(false)
  command.value = ''
  for (let i = 1; i <= full.length; i++) {
    command.value = full.slice(0, i)
    await timers.wait(14 + Math.random() * 14)
    if (!live()) return
  }
  await timers.wait(250)
  for (let i = 1; i <= LINES; i++) {
    listed.value = i
    await timers.wait(130)
    if (!live()) return
  }
  await timers.wait(400)
  for (let i = 0; i < TAIL; i++) {
    if (!tail[i]?.offsetParent) continue
    tailOn.value = tailOn.value.map((on, k) => on || k === i)
    await timers.wait(300)
    if (!live()) return
  }
  finish()
}

onMounted(() => {
  if (phoneScreen()) full = SHORT
  if (!reducedMotion()) return
  command.value = full
  listed.value = LINES
  finish()
})

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
  <div class="pv-two">
    <figure aria-label="An S3 client lists one bucket whose folders live in different places" class="term" :class="{ 'done-1': done }">
      <div class="bar"><i></i><i></i><i></i><span class="url">jonas@imaging: ~</span></div>
      <pre><code>
<span class="ln on"><span class="pr">$</span> <span>{{ command }}</span><span class="cur c1"></span></span>
<span v-for="(line, index) in LISTING" :key="line.path.join('')" class="ln f" :class="{ on: listed > index, sel: line.sel }"><span class="d">{{ line.date }}</span><span class="s">{{ line.size }}</span><span class="p"><template v-for="(part, k) in line.path" :key="part"><wbr v-if="k" /><span class="sg">{{ part }}</span></template></span><span class="lc"><component :is="line.icon" />{{ line.place }}</span></span>
<span class="ln f more" :class="{ on: listed >= LINES }"><span class="p"># 2,312 more objects across the six folders</span></span>
<span :ref="(el) => (tail[0] = el as HTMLElement | null)" class="ln gap" :class="{ on: tailOn[0] }"></span>
<span :ref="(el) => (tail[1] = el as HTMLElement | null)" class="ln l2 sel" :class="{ on: tailOn[1] }"><span class="pr">$</span> aws s3 cp s3:/<wbr />/<wbr />zebrafish-heart-2026/<wbr />tokyo-sequencing/<wbr />ZH-12_P01-P12/<wbr />ZH-12_P01.cram .</span>
<span :ref="(el) => (tail[2] = el as HTMLElement | null)" class="ln l2 dim" :class="{ on: tailOn[2] }">download: s3:/<wbr />/<wbr />zebrafish-heart-2026/<wbr />tokyo-sequencing/<wbr />ZH-12_P01-P12/<wbr />ZH-12_P01.cram to ./<wbr />ZH-12_P01.cram</span>
<span :ref="(el) => (tail[3] = el as HTMLElement | null)" class="ln ph" :class="{ on: tailOn[3] }"><span class="pr">$</span> B=s3://zebrafish-heart-2026</span>
<span :ref="(el) => (tail[4] = el as HTMLElement | null)" class="ln ph sel" :class="{ on: tailOn[4] }"><span class="pr">$</span> {{ PHONE_COPY }}</span>
<span :ref="(el) => (tail[5] = el as HTMLElement | null)" class="ln ph dim" :class="{ on: tailOn[5] }">download: $B/<wbr />tokyo-sequencing/<wbr /><span class="sg">ZH-12_P01-P12</span>/<wbr /><span class="sg">ZH-12_P01.cram</span></span>
<span :ref="(el) => (tail[6] = el as HTMLElement | null)" class="ln l2" :class="{ on: tailOn[6] }"><span class="pr">$</span> <span class="cur c2"></span></span>
</code></pre>
    </figure>
    <figure class="card file">
      <div class="f-h"><span class="tile"><File /></span><div><b>ZH-12_P01.cram</b><small>tokyo-sequencing / ZH-12_P01-P12</small></div></div>
      <dl class="kv">
        <dt>Size</dt><dd><span>38.6 GiB</span></dd>
        <dt>Stored on</dt><dd><HardDrive /><span>Sequencing core, Tokyo, its own node</span></dd>
        <dt>Checked</dt><dd><CircleCheck class="ok" /><span>Content hash verified on upload</span></dd>
        <dt>SHA-256</dt><dd><code>3f9a0c51…d07b21e4</code></dd>
        <dt>Used by</dt><dd><span>ZH-12 heart development, Zebrafish reference panel 2026</span></dd>
      </dl>
      <p class="f-note">Stored once in Tokyo and used by two datasets. The copy above came straight from that node.</p>
    </figure>
  </div>
</template>
