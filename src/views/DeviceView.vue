<script setup lang="ts">
// Device home, mounted only in desktop mode: the shell's own views live here
// so one portal build serves both the browser and Aruna Desktop. It is also
// where an `aruna://enroll` link lands, so the outcome is shown here.
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Tabs from '@/components/ui/Tabs.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import ComputePanel from '@/components/device/ComputePanel.vue'
import EnrollPanel from '@/components/device/EnrollPanel.vue'
import LocalPanel from '@/components/device/LocalPanel.vue'
import NodePanel from '@/components/device/NodePanel.vue'
import WipePanel from '@/components/device/WipePanel.vue'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { useEnrollWatch } from '@/composables/useEnrollWatch'

// The welcome view sends an owner holding a code straight to the right tab.
const tab = ref(useRoute().query.tab === 'enroll' ? 'enroll' : 'node')
const { invite, start, clear } = useEnrollWatch()
const { status, refresh } = useDeviceStatus()

// Enrolling is a first-run step: the tab stays only while it can still happen.
const enrolled = computed(() => status.value?.enrolled === true)
const showEnroll = computed(() => !enrolled.value || Boolean(invite.value) || tab.value === 'enroll')

watch(invite, (next) => {
  if (next) tab.value = 'enroll'
})

onMounted(() => {
  void start()
  void refresh()
})

function onEnrolled() {
  clear()
  tab.value = 'node'
  void refresh()
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
        <TabsTrigger value="local">Storage &amp; settings</TabsTrigger>
        <TabsTrigger value="compute">Compute</TabsTrigger>
        <TabsTrigger v-if="showEnroll" value="enroll">Enroll</TabsTrigger>
        <TabsTrigger value="danger">Danger zone</TabsTrigger>
      </TabsList>
      <TabsContent value="node"><NodePanel /></TabsContent>
      <TabsContent value="local"><LocalPanel /></TabsContent>
      <TabsContent value="compute"><ComputePanel /></TabsContent>
      <TabsContent v-if="showEnroll" value="enroll">
        <EnrollPanel :invite="invite" @enrolled="onEnrolled" />
      </TabsContent>
      <TabsContent value="danger"><WipePanel @wiped="refresh" /></TabsContent>
    </Tabs>
  </div>
</template>
