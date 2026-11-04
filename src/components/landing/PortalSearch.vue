<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronDown, Copy, File, FileBraces, Globe, KeyRound, Link, Lock, Search, Share2, ShieldCheck, Users, Workflow } from '@lucide/vue'
import { createTimers, reducedMotion } from '@/lib/landing/timers'

const props = defineProps<{ play: number }>()

type Role = 'member' | 'guest'
const ITEMS = [
  { kind: FileBraces, name: 'Heart development in zebrafish line ZH-12', meta: 'Dataset of Zebrafish heart network on imaging', open: false },
  { kind: Workflow, name: 'Cellpose segmentation of zebrafish line ZH-12', meta: 'Run of cellpose 3.1.1 on imaging', open: false },
  { kind: File, name: 'ZH-12_P01.cram', meta: 'File in tokyo-sequencing/ZH-12_P01-P12', open: false },
  { kind: FileBraces, name: 'Zebrafish fin regeneration, light-sheet atlas', meta: 'Dataset on imaging, CC BY 4.0', open: true },
  { kind: FileBraces, name: 'Zebrafish reference panel 2026, 96 genomes', meta: 'Dataset on genomics, CC BY 4.0', open: true },
  { kind: FileBraces, name: 'Line ZH-14 crosses and genotypes', meta: 'Dataset of Zebrafish heart network on fish-lab', open: false },
  { kind: FileBraces, name: 'Zebrafish larval brain activity imaging', meta: 'Dataset on imaging, CC BY 4.0', open: true },
]
const ROLES: { role: Role; label: string }[] = [
  { role: 'member', label: 'As a member' },
  { role: 'guest', label: 'As a guest' },
]

const query = ref('')
const role = ref<Role>('member')
const sparql = ref(false)
const input = ref<HTMLInputElement | null>(null)
const roleButtons: (HTMLButtonElement | null)[] = []
const timers = createTimers()
let run = 0

// Search filters by text and by who is searching; guests see public datasets only.
const hits = computed(() => {
  const text = query.value.trim().toLowerCase()
  return ITEMS.filter(
    (item) => (role.value === 'member' || item.open) && (!text || `${item.name} ${item.meta}`.toLowerCase().includes(text)),
  ).map((item) => {
    const at = text ? item.name.toLowerCase().indexOf(text) : -1
    const parts = at < 0 ? [item.name, '', ''] : [item.name.slice(0, at), item.name.slice(at, at + text.length), item.name.slice(at + text.length)]
    return { ...item, parts }
  })
})

function more(count: number): string {
  return `Show ${count} more result${count > 1 ? 's' : ''}`
}

function step(event: KeyboardEvent) {
  const forward = event.key === 'ArrowRight'
  if (!forward && event.key !== 'ArrowLeft') return
  const index = ROLES.findIndex((item) => item.role === role.value)
  const next = (index + (forward ? 1 : ROLES.length - 1)) % ROLES.length
  role.value = ROLES[next]!.role
  roleButtons[next]?.focus()
}

// The query types itself, unless the visitor is already typing.
async function play() {
  const mine = ++run
  query.value = ''
  await timers.wait(400)
  for (const letter of 'zebrafish') {
    if (mine !== run || document.activeElement === input.value) return
    query.value += letter
    await timers.wait(120)
  }
}

onMounted(() => {
  if (reducedMotion()) query.value = 'zebrafish'
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
  <div class="fs">
    <div class="fs-a">
      <h3>Search the realm</h3>
      <p>One search covers the connected nodes and shows only what your permissions allow. SPARQL answers deeper questions.</p>
      <figure class="win search">
        <div class="d-h"><span><Search />Connected nodes</span><small>5 nodes, 1 realm</small></div>
        <div aria-label="Search as" class="seg" role="radiogroup" @keydown="step">
          <button
            v-for="(item, index) in ROLES"
            :key="item.role"
            :ref="(el) => (roleButtons[index] = el as HTMLButtonElement | null)"
            :aria-checked="role === item.role"
            role="radio"
            type="button"
            @click="role = item.role"
          >{{ item.label }}</button>
        </div>
        <div class="sbox">
          <Search />
          <input ref="input" v-model="query" aria-label="Search the realm" autocomplete="off" placeholder="Search the realm" type="search" /><kbd>Ctrl K</kbd>
        </div>
        <div class="tabs">
          <button :class="{ on: !sparql }" type="button" @click="sparql = false">Results <span>{{ hits.length }}</span></button>
          <button :class="{ on: sparql }" type="button" @click="sparql = true">SPARQL</button>
        </div>
        <ul class="res" :hidden="sparql">
          <template v-if="hits.length">
            <li v-for="(hit, index) in hits.slice(0, 5)" :key="hit.name">
              <span class="tile"><component :is="hit.kind" /></span>
              <div>
                <b>{{ hit.parts[0] }}<mark v-if="hit.parts[1]">{{ hit.parts[1] }}</mark>{{ hit.parts[2] }}</b><small>{{ hit.meta }}</small>
              </div>
              <span v-if="index === 0" class="shr"><Share2 />Sharing</span>
              <span v-else class="vis"><template v-if="hit.open"><Globe />Public</template><template v-else><Users />Your groups</template></span>
            </li>
            <li v-if="hits.length > 5" class="more-r">{{ more(hits.length - 5) }}</li>
            <li v-if="hits.length > 3" class="more-r ph">{{ more(hits.length - 3) }}</li>
          </template>
          <li v-else class="none">No results</li>
        </ul>
        <pre class="sparql" :hidden="!sparql"><code><b>SELECT</b> ?run ?tool <b>WHERE</b> {
  ?run a schema:CreateAction ;
       schema:instrument ?tool ;
       schema:object ?input .
  ?input schema:name <s>"ZH-12_P01.cram"</s> .
}</code></pre>
      </figure>
    </div>
    <div class="fs-b">
      <h3>Share with a link</h3>
      <p>Links grant read access to chosen folders and never more than your own. Encrypted buckets stay locked.</p>
      <figure class="card share tied">
        <div class="d-h"><span><Share2 />Share dataset ZH-12</span></div>
        <div class="shds">
          <span class="tile"><FileBraces /></span>
          <span><b>Heart development in zebrafish line <span class="nw">ZH-12</span></b><small>Selected in search</small></span>
        </div>
        <p class="d-sub">Anyone with the link can open the dataset and its files without an account. It never grants more than your own access.</p>
        <label>Access</label>
        <div class="opts"><b>Read only</b><span>Read and write</span><span>Upload only</span></div>
        <label>Policy</label>
        <div class="field pol"><ShieldCheck /><span>Only files in</span><span class="chips"><code>heidelberg-imaging/</code></span></div>
        <label>Link</label>
        <div class="field lnk">
          <Link /><code><span class="a">v3.aruna-engine.org/s/</span><span class="b">ZH-12-q7Kx2</span></code><span class="cp"><Copy />Copy</span>
        </div>
        <p class="disc"><ChevronDown />Link settings: expiry and password</p>
        <div class="keys">
          <span class="tile"><KeyRound /></span>
          <span><b>Not in this share: unpublished-lines</b>Encrypted bucket, keys stay with Mei Lin Tan and Jonas Freund</span>
          <span class="lk"><Lock />Locked</span>
        </div>
      </figure>
    </div>
  </div>
</template>
