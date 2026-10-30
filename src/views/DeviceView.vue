<script setup lang="ts">
// This computer, mounted only in desktop mode: linked folders, what is moving,
// the state of Aruna here and the settings only you control. It is also where an
// `aruna://enroll` link lands, so the outcome is shown here.
import { computed, nextTick, onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Server, SlidersHorizontal } from '@lucide/vue'
import Button from '@/components/ui/Button.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
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
  // The node-down page links here with ?section=wipe, Home with the folders, activity or local runs.
  const section = route.query.section
  if (typeof section !== 'string' || !['wipe', 'local-runs', 'folders', 'activity'].includes(section)) return
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
      :docs="{ topic: 'realm-nodes-groups', section: 'Nodes and the realm' }"
    >
      <template #actions>
        <Button v-if="status?.nodeId" variant="outline" as-child>
          <RouterLink :to="{ name: 'node', params: { nodeId: status.nodeId } }"><Server class="h-4 w-4" /> Node page</RouterLink>
        </Button>
      </template>
    </PageHeader>

    <div class="w-full space-y-8 px-4 py-6 sm:px-6">
      <EnrollPanel v-if="showEnroll" :invite="invite" @enrolled="onEnrolled" />
      <NodePanel />
      <LinkedFolders id="folders" />
      <ActivityCard id="activity" />
      <section aria-labelledby="computer-settings-heading">
        <SectionHeading id="computer-settings-heading" title="Settings for this computer" :icon="SlidersHorizontal" />
        <div class="grid gap-4 lg:grid-cols-2">
          <ComputePanel id="local-runs" class="min-w-0" />
          <LocalPanel class="min-w-0" />
          <LocalBuckets class="min-w-0" />
          <WipePanel id="wipe" class="min-w-0" @wiped="refresh" />
        </div>
      </section>
    </div>
  </div>
</template>
