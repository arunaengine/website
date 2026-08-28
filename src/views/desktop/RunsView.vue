<script setup lang="ts">
// Everything running for this account, split by where it runs: on this
// computer, or in the realm. The realm half is the portal's own compute
// surface, reused as it is.
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Tabs from '@/components/ui/Tabs.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import NewRunMenu from '@/components/compute/NewRunMenu.vue'
import LocalRunsPanel from '@/components/desktop/LocalRunsPanel.vue'
import JobsPanel from '@/components/jobs/JobsPanel.vue'
import TasksPanel from '@/components/compute/TasksPanel.vue'
import { useDeviceCompute } from '@/composables/useDeviceCompute'
import { useRealm } from '@/composables/useRealm'
import { featureEnabled } from '@/lib/config'

const route = useRoute()
const router = useRouter()
const { realm } = useRealm()
const { compute, ensureLoaded } = useDeviceCompute()

const tesEnabled = featureEnabled('tes')
const jobsEnabled = featureEnabled('jobs')

// The detail drawer lives on the local tab, so a deep link opens it there.
const tab = computed({
  get: () => (route.name === 'run-detail' || route.query.where !== 'realm' ? 'local' : 'realm'),
  set: (value: string) => {
    void router.replace({ name: 'runs', query: value === 'realm' ? { where: 'realm' } : {} })
  },
})

const localHint = computed(() =>
  compute.value?.backend ? `${compute.value.backend} · ${compute.value.running} running` : '',
)

onMounted(() => void ensureLoaded())
</script>

<template>
  <div>
    <PageHeader eyebrow="This computer" title="Runs" description="Work you started, wherever it is executing.">
      <template #actions>
        <NewRunMenu size="sm" />
      </template>
    </PageHeader>

    <div class="container py-5">
      <Tabs v-model="tab">
        <TabsList>
          <TabsTrigger value="local">This computer</TabsTrigger>
          <TabsTrigger value="realm">{{ realm.shortName }}</TabsTrigger>
        </TabsList>

        <TabsContent value="local">
          <p v-if="localHint" class="mb-3 font-mono text-[11px] text-muted-foreground">{{ localHint }}</p>
          <LocalRunsPanel />
        </TabsContent>

        <TabsContent value="realm">
          <div class="space-y-6">
            <TasksPanel v-if="tesEnabled" />
            <JobsPanel v-if="jobsEnabled" />
            <p v-if="!tesEnabled && !jobsEnabled" class="surface px-5 py-8 text-center text-sm text-muted-foreground">
              This realm serves no compute surface.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  </div>
</template>
