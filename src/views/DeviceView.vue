<script setup lang="ts">
// This computer, mounted only in desktop mode: linked folders, what is moving,
// the state of Aruna here and the settings only you control. It is also where an
// `aruna://enroll` link lands, so the outcome is shown here.
import { computed, nextTick, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import ActivityCard from '@/components/desktop/ActivityCard.vue'
import LinkedFolders from '@/components/desktop/LinkedFolders.vue'
import LocalBuckets from '@/components/desktop/LocalBuckets.vue'
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
  // The node-down page links here with ?section=wipe, Home with ?section=local-runs.
  const section = route.query.section
  if (section !== 'wipe' && section !== 'local-runs') return
  await nextTick()
  document.getElementById(section)?.scrollIntoView?.({ block: 'center' })
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
      description="Aruna runs on this computer. Your folders, what is moving, and how it runs."
      :docs="{ topic: 'realm-nodes-groups', section: 'Nodes and the realm' }"
    />

    <div class="container space-y-5 py-5">
      <EnrollPanel v-if="showEnroll" :invite="invite" @enrolled="onEnrolled" />
      <NodePanel />
      <LinkedFolders />
      <ActivityCard />
      <div class="space-y-3.5 pt-2">
        <h2 class="font-display text-[15px] font-semibold text-foreground/85">Settings for this computer</h2>
        <div class="grid items-start gap-5 lg:grid-cols-2">
          <ComputePanel id="local-runs" class="min-w-0" />
          <LocalPanel class="min-w-0" />
          <LocalBuckets class="min-w-0" />
          <WipePanel id="wipe" class="min-w-0" @wiped="refresh" />
        </div>
      </div>
    </div>
  </div>
</template>
