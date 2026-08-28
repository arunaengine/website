<script setup lang="ts">
// Device home, mounted only in desktop mode: the shell's own views live here
// so one portal build serves both the browser and Aruna Desktop. It is also
// where an `aruna://enroll` link lands, so the outcome is shown here.
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import Tabs from '@/components/ui/Tabs.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import ComputePanel from '@/components/device/ComputePanel.vue'
import EnrollPanel from '@/components/device/EnrollPanel.vue'
import LocalPanel from '@/components/device/LocalPanel.vue'
import NodePanel from '@/components/device/NodePanel.vue'
import WipePanel from '@/components/device/WipePanel.vue'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { useEnrollWatch } from '@/composables/useEnrollWatch'
import { useRouteTab } from '@/composables/useRouteTab'

const route = useRoute()
const tab = useRouteTab(['node', 'local', 'compute', 'enroll', 'danger'], 'node')
const { invite, start, clear } = useEnrollWatch()
const { status, loaded, refresh } = useDeviceStatus()

// Enrolling is a first-run step, so the tab goes away once the node joined -
// but only once the shell actually said so.
const enrolled = computed(() => loaded.value && status.value?.enrolled === true)
const showEnroll = computed(() => !enrolled.value || Boolean(invite.value) || tab.value === 'enroll')

watch(invite, (next) => {
  if (next) tab.value = 'enroll'
})

// The node-down page still points here with the older ?section=wipe link.
watch(
  () => route.query.section,
  (section) => {
    if (section === 'wipe' && tab.value !== 'danger') tab.value = 'danger'
  },
  { immediate: true },
)

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
  <div>
    <PageHeader
      eyebrow="This computer"
      title="This device"
      description="The node Aruna Desktop runs on this computer: its state, its enrollment, and the settings only you control."
    />

    <div class="container py-5">
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
        <TabsContent id="wipe" value="danger"><WipePanel @wiped="refresh" /></TabsContent>
      </Tabs>
    </div>
  </div>
</template>
