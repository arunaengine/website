<script setup lang="ts">
// Device home, mounted only in desktop mode: the shell's own views live here
// so one portal build serves both the browser and Aruna Desktop. It is also
// where an `aruna://enroll` link lands, so the outcome is shown here.
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import Tabs from '@/components/ui/Tabs.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import EnrollPanel from '@/components/device/EnrollPanel.vue'
import LocalPanel from '@/components/device/LocalPanel.vue'
import NodePanel from '@/components/device/NodePanel.vue'
import { nodeStatus } from '@/lib/desktopBridge'
import { onEnrollInvite, type EnrollInvite, type Unlisten } from '@/lib/desktopEvents'

const WATCH_MS = 5_000

// The welcome view sends an owner holding a code straight to the right tab.
const tab = ref(useRoute().query.tab === 'enroll' ? 'enroll' : 'node')
const invite = ref<EnrollInvite | null>(null)

let live = true
let unlisten: Unlisten | null = null
let timer: ReturnType<typeof setInterval> | undefined

function show(next: EnrollInvite): void {
  invite.value = next
  tab.value = 'enroll'
}

// Without the event channel the supervisor is the signal: report the moment it
// turns enrolled, never an enrollment it already held when this view opened.
async function watchStatus(): Promise<void> {
  let enrolled: boolean | null = null
  const check = async () => {
    try {
      const status = await nodeStatus()
      if (enrolled === false && status.enrolled) {
        show({ seed: null, realm: status.realm, applied: true, error: null })
      }
      enrolled = status.enrolled
    } catch {
      // The node panel already reports what the bridge cannot answer.
    }
  }
  await check()
  if (live) timer = setInterval(() => void check(), WATCH_MS)
}

onMounted(async () => {
  const stop = await onEnrollInvite(show)
  if (!live) return stop?.()
  unlisten = stop
  if (!stop) await watchStatus()
})

onUnmounted(() => {
  live = false
  unlisten?.()
  clearInterval(timer)
})

function onEnrolled() {
  invite.value = null
  tab.value = 'node'
}
</script>

<template>
  <div class="container space-y-5 py-6">
    <header>
      <h1 class="font-display text-lg font-semibold text-aruna-navy">This device</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        The node Aruna Desktop runs on this machine: its state, its enrollment, and the settings only you control.
      </p>
    </header>

    <Tabs v-model="tab">
      <TabsList>
        <TabsTrigger value="node">Node</TabsTrigger>
        <TabsTrigger value="enroll">Enroll</TabsTrigger>
        <TabsTrigger value="local">Local settings</TabsTrigger>
      </TabsList>
      <TabsContent value="node"><NodePanel /></TabsContent>
      <TabsContent value="enroll"><EnrollPanel :invite="invite" @enrolled="onEnrolled" /></TabsContent>
      <TabsContent value="local"><LocalPanel /></TabsContent>
    </Tabs>
  </div>
</template>
