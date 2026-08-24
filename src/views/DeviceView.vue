<script setup lang="ts">
// Device home, mounted only in desktop mode: the shell's own views live here
// so one portal build serves both the browser and Aruna Desktop.
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import Tabs from '@/components/ui/Tabs.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import EnrollPanel from '@/components/device/EnrollPanel.vue'
import LocalPanel from '@/components/device/LocalPanel.vue'
import NodePanel from '@/components/device/NodePanel.vue'

// The welcome view sends an owner holding a code straight to the right tab.
const tab = ref(useRoute().query.tab === 'enroll' ? 'enroll' : 'node')

function onEnrolled() {
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
      <TabsContent value="enroll"><EnrollPanel @enrolled="onEnrolled" /></TabsContent>
      <TabsContent value="local"><LocalPanel /></TabsContent>
    </Tabs>
  </div>
</template>
