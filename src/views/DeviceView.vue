<script setup lang="ts">
// This computer, mounted only in desktop mode: the state of Aruna here, where it
// keeps its files, and the settings only you control. It is also where an
// `aruna://enroll` link lands, so the outcome is shown here.
import { computed, nextTick, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import ComputePanel from '@/components/device/ComputePanel.vue'
import EnrollPanel from '@/components/device/EnrollPanel.vue'
import LocalPanel from '@/components/device/LocalPanel.vue'
import NodePanel from '@/components/device/NodePanel.vue'
import WipePanel from '@/components/device/WipePanel.vue'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { useEnrollWatch } from '@/composables/useEnrollWatch'

const route = useRoute()
const { invite, start, clear } = useEnrollWatch()
const { status, loaded, refresh } = useDeviceStatus()

// Enrolling is a first-run step, so the form goes away once the node joined -
// but only once the shell actually said so.
const enrolled = computed(() => loaded.value && status.value?.enrolled === true)
const showEnroll = computed(() => !enrolled.value || Boolean(invite.value))

onMounted(async () => {
  void start()
  void refresh()
  // The node-down page links here with ?section=wipe.
  if (route.query.section !== 'wipe') return
  await nextTick()
  document.getElementById('wipe')?.scrollIntoView?.({ block: 'center' })
})

function onEnrolled() {
  clear()
  void refresh()
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="This computer"
      title="This computer"
      description="Aruna runs on this computer. Start or pause it here, and choose where it keeps its files."
      :docs="{ topic: 'realm-nodes-groups', section: 'Nodes and the realm' }"
    />

    <div class="container space-y-4 py-5">
      <EnrollPanel v-if="showEnroll" :invite="invite" @enrolled="onEnrolled" />
      <NodePanel />
      <LocalPanel />
      <ComputePanel />
      <WipePanel id="wipe" @wiped="refresh" />
    </div>
  </div>
</template>
