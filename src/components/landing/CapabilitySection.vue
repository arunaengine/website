<script setup lang="ts">
import { ArrowRight, CircleCheck, Cloud, Database, FileBraces, Fish, FlaskConical, GitBranch, Link, Microscope, Network, Share2, TestTubes, Workflow } from '@lucide/vue'

const emit = defineEmits<{ open: [view: string] }>()

const JOINED = [
  { icon: Microscope, name: 'Imaging facility', holds: 'Light-sheet stacks' },
  { icon: Fish, name: 'Fish facility', holds: 'Fish sheet' },
  { icon: TestTubes, name: 'Sequencing core', holds: 'CRAM reads' },
  { icon: FlaskConical, name: 'Genomics group', holds: 'Variants' },
  { icon: Cloud, name: 'Cloud archive', holds: 'Raw archive' },
]

// Each card opens the portal view that shows it.
const CARDS = [
  { view: 'pv-ds', icon: GitBranch, title: 'Provenance per file', text: 'Each run records its inputs, tool and outputs.', go: 'Open the dataset view' },
  { view: 'pv-s3', icon: Database, title: 'One S3 bucket', text: 'Your S3 tools and pipelines see one bucket.', go: 'Open the bucket view' },
  { view: 'pv-nd', icon: Network, title: 'One or more nodes per site', text: 'Nodes connect directly and work offline.', go: 'Open the node view' },
  { view: 'pv-sh', icon: Share2, title: 'Shared on your terms', text: 'Links never grant more than your own access.', go: 'Open search and share' },
  { view: 'pv-rn', icon: Workflow, title: 'Compute at the data', text: 'Containers start on the node that holds the data.', go: 'Open the compute view' },
]
</script>

<template>
  <section id="what" class="s25">
    <div class="wrap head-c">
      <p class="eb">What Aruna does</p>
      <h2>One layer over every site</h2>
      <p class="body"><span class="t-l">Your data stays where it is. Aruna joins it into one bucket, describes it for reuse and runs analyses next to it.</span><span class="t-s">Data stays where it is. Aruna joins, describes and computes on it.</span></p>
    </div>
    <div class="wrap bento">
      <article class="bx w2">
        <div class="bx-t">
          <span class="bi"><Link /></span>
          <div><h3>Joined where it lives</h3><p>Files stay at the five sites. One dataset lists them all.</p></div>
        </div>
        <div class="join">
          <ul class="join-s">
            <li v-for="site in JOINED" :key="site.name"><component :is="site.icon" class="si" /><b>{{ site.name }}</b><span>{{ site.holds }}</span></li>
          </ul>
          <svg aria-hidden="true" class="join-l" preserveAspectRatio="none" viewBox="0 0 100 200">
            <path d="M0 20 C55 20 45 100 100 100" />
            <path d="M0 60 C55 60 45 100 100 100" />
            <path class="on" d="M0 100 L100 100" />
            <path d="M0 140 C55 140 45 100 100 100" />
            <path d="M0 180 C55 180 45 100 100 100" />
          </svg>
          <div class="join-d">
            <span class="bi"><FileBraces /></span><b>ZH-12</b><small>One dataset, 5 sites</small><code>2,304 stacks, 15 files</code>
          </div>
        </div>
      </article>
      <article class="bx">
        <div class="bx-t">
          <span class="bi"><FileBraces /></span>
          <div><h3>Described for reuse</h3><p>RO-Crate records, checked against profiles.</p></div>
        </div>
        <dl class="mini-kv">
          <dt>Organism</dt><dd><i>Danio rerio</i></dd>
          <dt>Line</dt><dd><i>Tg(myl7:GFP)</i>, ZH-12</dd>
          <dt>License</dt><dd>CC BY 4.0</dd>
        </dl>
        <div class="mini-ppl"><span>People</span><span class="pc"><a>Jonas Freund</a><a>Mei Lin Tan</a><a>Daniel Okafor</a></span></div>
        <p class="mini-ok"><CircleCheck />Valid for the Model organism study profile</p>
      </article>
      <div class="bx5">
        <a v-for="card in CARDS" :key="card.view" class="bk" href="#portal" @click="emit('open', card.view)">
          <span class="bi"><component :is="card.icon" /></span>
          <h3>{{ card.title }}</h3>
          <p>{{ card.text }}</p>
          <span class="go">{{ card.go }}<ArrowRight /></span>
        </a>
      </div>
    </div>
  </section>
</template>
