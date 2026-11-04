<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { Database, FileBraces, Network, Share2, Workflow } from '@lucide/vue'
import PortalBucket from './PortalBucket.vue'
import PortalCompute from './PortalCompute.vue'
import PortalDataset from './PortalDataset.vue'
import PortalNodes from './PortalNodes.vue'
import PortalSearch from './PortalSearch.vue'
import { createTimers, reducedMotion } from '@/lib/landing/timers'

const TABS = [
  { id: 'pv-ds', label: 'Dataset', icon: FileBraces, view: PortalDataset },
  { id: 'pv-s3', label: 'Bucket', icon: Database, view: PortalBucket },
  { id: 'pv-nd', label: 'Nodes', icon: Network, view: PortalNodes },
  { id: 'pv-sh', label: 'Search and share', icon: Share2, view: PortalSearch },
  { id: 'pv-rn', label: 'Compute', icon: Workflow, view: PortalCompute },
]
// Each view stays long enough for its own animation to finish.
const STEP = 7000
const DWELL: Record<string, number> = { 'pv-s3': 9000, 'pv-nd': 10000, 'pv-rn': 8000 }

const active = ref(TABS[0]!.id)
// Counts how often each view was shown; a view replays its moment on every change.
const plays = reactive<Record<string, number>>(Object.fromEntries(TABS.map((tab) => [tab.id, 0])))
const stage = ref<HTMLElement | null>(null)
const timers = createTimers()
let wide: MediaQueryList | undefined
let stopped = false
let visible = false
let seen = false
let observer: IntersectionObserver | undefined

function show(id: string) {
  active.value = id
  plays[id]!++
}

function halt() {
  timers.clear()
}

// On wide screens the views cycle while the stage is on screen.
function plan() {
  halt()
  if (stopped || !visible || !wide?.matches || reducedMotion()) return
  const current = TABS.findIndex((tab) => tab.id === active.value)
  timers.after(DWELL[active.value] ?? STEP, () => {
    show(TABS[(current + 1) % TABS.length]!.id)
    plan()
  })
}

/** Opens a view; any choice by the visitor stops the cycle for good. */
function select(id: string) {
  stopped = true
  halt()
  show(id)
}

// The stage keeps the height of the tallest view, so cycling never moves the page.
function fit() {
  const el = stage.value
  if (!el) return
  el.style.minHeight = ''
  if (!wide?.matches) return
  const views = [...el.querySelectorAll<HTMLElement>('.pv')]
  const was = views.map((view) => view.hidden)
  const tallest = Math.max(
    ...views.map((view) => {
      view.hidden = false
      const height = view.offsetHeight
      view.hidden = true
      return height
    }),
  )
  views.forEach((view, index) => (view.hidden = was[index]!))
  el.style.minHeight = `${tallest + 4}px`
}

function resize() {
  fit()
  plan()
}

onMounted(() => {
  wide = window.matchMedia('(min-width: 1200px)')
  observer = new IntersectionObserver(
    ([entry]) => {
      visible = !!entry?.isIntersecting
      if (visible && !seen) {
        seen = true
        show(active.value)
      }
      plan()
    },
    { threshold: 0.2 },
  )
  if (stage.value) observer.observe(stage.value)
  window.addEventListener('resize', resize)
  void document.fonts?.ready.then(fit)
  fit()
})

onBeforeUnmount(() => {
  halt()
  observer?.disconnect()
  window.removeEventListener('resize', resize)
})

defineExpose({ select })
</script>

<template>
  <section id="portal" class="s25 sc25">
    <div class="wrap head-c">
      <p class="eb">In the portal</p>
      <h2>The whole study in one place</h2>
      <p class="body"><span class="t-l">Files, descriptions, nodes and analyses of one study, as they look in Aruna.</span><span class="t-s">One study, as it looks in Aruna.</span></p>
    </div>
    <div class="wrap">
      <div aria-label="Portal views" class="ptabs" role="tablist">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          :aria-controls="tab.id"
          :aria-selected="active === tab.id"
          role="tab"
          type="button"
          @click="select(tab.id)"
        >
          <component :is="tab.icon" />{{ tab.label }}
        </button>
      </div>
      <div ref="stage" class="pstage">
        <div v-for="tab in TABS" :id="tab.id" :key="tab.id" class="pv" :hidden="active !== tab.id" role="tabpanel">
          <component :is="tab.view" :play="plays[tab.id]!" />
        </div>
      </div>
      <p class="example">Example data in the Aruna portal. <a href="https://v3.aruna-engine.org/app">Try it in the NFDI realm</a></p>
    </div>
  </section>
</template>
