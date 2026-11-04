<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import {
  Braces,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Clock,
  Download,
  File,
  FileBraces,
  Files,
  FlaskConical,
  Fish,
  Folder,
  GitBranch,
  Globe,
  Image,
  Info,
  LayoutDashboard,
  Microscope,
  Quote,
  Search,
  TestTubes,
  Users,
  Workflow,
} from '@lucide/vue'
import lockup from '@/assets/brand/lockup-horizontal-white.avif'
import ProvenanceLane, { type LaneStep } from './ProvenanceLane.vue'
import { reducedMotion } from '@/lib/landing/timers'

const props = defineProps<{ play: number }>()

const FILES = [
  { folder: true, path: ['heidelberg-imaging/', 'ZH-12_timelapse/'], note: '2,304 stacks', icon: Microscope, place: 'Imaging facility' },
  { folder: false, path: ['boston-fish/', 'ZH-12_fish.tsv'], note: '', icon: Fish, place: 'Fish facility' },
  { folder: true, path: ['tokyo-sequencing/', 'ZH-12_P01-P12/'], note: '12 CRAM files', icon: TestTubes, place: 'Sequencing core' },
  { folder: false, path: ['sandiego-variants/', 'ZH-12.vcf.gz'], note: '', icon: FlaskConical, place: 'Genomics group' },
  { folder: false, path: ['heidelberg-imaging/', 'ZH-12_cells.parquet'], note: '', icon: Microscope, place: 'Imaging facility' },
  { folder: false, path: ['ncbi-reference/', 'GRCz11.fa.gz'], note: '', icon: Globe, place: 'NCBI' },
]

const IMAGING: LaneStep[] = [
  { icon: Image, name: 'Images', note: '2,304 stacks' },
  { icon: Workflow, name: 'Cellpose', note: 'On imaging', run: true },
  { icon: File, name: 'Cell table', note: '3.1 million cells' },
]
const SEQUENCING: LaneStep[] = [
  { icon: TestTubes, name: 'Reads', note: '12 parent fish' },
  { icon: Workflow, name: 'nf-core/sarek', note: 'On genomics', run: true },
  { icon: File, name: 'Variants', note: 'ZH-12.vcf.gz' },
]
// Files and provenance steps fade in one after another, 70 ms apart.
const STEP_DELAY = (FILES.length + 1) * 70

const playing = ref(false)
const figure = ref<HTMLElement | null>(null)

watch(
  () => props.play,
  async () => {
    if (reducedMotion()) return
    playing.value = false
    await nextTick()
    void figure.value?.offsetWidth
    playing.value = true
  },
)
</script>

<template>
  <figure ref="figure" aria-label="A dataset page in the Aruna portal" class="win app ds13" :class="{ play: playing }">
    <div class="abar">
      <img alt="" :src="lockup" /><span class="ab-r"><Globe />Zebrafish heart network</span><span class="ab-s"><Search />Search datasets, files and runs<kbd>Ctrl K</kbd></span><span class="ab-u">JF</span>
    </div>
    <div class="page">
      <div class="crumb"><Globe />Zebrafish heart network<ChevronRight class="bc-m" /><span class="bc-m">Datasets</span><ChevronRight /><b>ZH-12</b></div>
      <div class="ds-h">
        <span class="tile"><FileBraces /></span>
        <div>
          <h3 class="ptitle">Heart development in zebrafish line <span class="nw">ZH-12</span></h3>
          <span class="tp">Dataset</span><span class="okp"><CircleCheck />Valid for the Model organism study profile</span>
        </div>
        <span class="acts"><span class="tb"><Quote />Cite</span><span class="tb"><Download />Export</span></span>
      </div>
      <div class="tabs2"><b><LayoutDashboard />Overview</b><span><GitBranch />Provenance</span><span><Clock />History</span><span><Braces />JSON-LD</span></div>
      <div class="dsg">
        <div class="dsg-a">
          <div class="sec-h"><span><Info />About</span></div>
          <div class="card2">
            <p class="desc">Light-sheet time-lapse of heart development in 48 embryos from 24 to 72 hours after fertilization, with whole-genome sequencing of the 12 parent fish.</p>
            <dl class="g3">
              <dt>Organism</dt><dd><a><i>Danio rerio</i></a></dd>
              <dt>Line</dt><dd><a><i>Tg(myl7:GFP)</i>, ZH-12</a></dd>
              <dt>Microscope</dt><dd><a>Zeiss Lightsheet 7</a></dd>
              <dt>Sequencer</dt><dd><a>Illumina NovaSeq X</a></dd>
              <dt>License</dt><dd><a>CC BY 4.0</a></dd>
              <dt>Persistent ID</dt><dd class="pid"><code title="w3id.org/aruna/01M60WMF2Q">w3id.org/aruna/01M60WMF2Q</code></dd>
            </dl>
            <div class="ppl"><span><Users />People</span><a>Jonas Freund</a><a>Mei Lin Tan</a><a>Daniel Okafor</a></div>
          </div>
        </div>
        <div class="dsg-b">
          <div class="sec-h"><span><Files />Files</span><small>2,304 stacks and 15 files from 5 places</small></div>
          <ul class="fl">
            <li v-for="(file, index) in FILES" :key="file.path.join('')" :class="{ on: index === 0 }" :style="{ animationDelay: `${index * 70}ms` }">
              <component :is="file.folder ? Folder : File" /><code><span class="sg">{{ file.path[0] }}</span><wbr /><span class="sg">{{ file.path[1] }}</span><template v-if="file.note"> <small>{{ file.note }}</small></template></code><span class="loc"><component :is="file.icon" />{{ file.place }}</span>
            </li>
            <li class="more" :style="{ animationDelay: `${FILES.length * 70}ms` }"><ChevronDown /><span>Show all entries</span></li>
          </ul>
        </div>
      </div>
      <div id="prov" class="dsp">
        <div class="sec-h"><span><GitBranch />Provenance</span><small>2 runs</small></div>
        <div class="lanes">
          <ProvenanceLane :delay="STEP_DELAY" label="Imaging run" :steps="IMAGING" />
          <ProvenanceLane :delay="STEP_DELAY + 3 * 70" label="Sequencing run" :steps="SEQUENCING" />
        </div>
      </div>
    </div>
  </figure>
</template>
