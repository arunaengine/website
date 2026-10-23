<script setup lang="ts">
// Mock of creating a distributed bucket: a name, a preset, member nodes with a
// data strategy each, key ranges, refresh, range requests and search.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import CreateSettings from '@/components/distributed/CreateSettings.vue'
import MemberPicker from '@/components/distributed/MemberPicker.vue'
import MockNotice from '@/components/distributed/MockNotice.vue'
import PresetPicker from '@/components/distributed/PresetPicker.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import { bucketNameProblem } from '@/lib/bucketName'
import { defaultSettings, presetMembers, STRATEGIES, type MemberDraft, type PresetId } from '@/lib/distributedMock'
import { MOCK_BASE } from '@/router/distributedMock'

const name = ref('')
const preset = ref<PresetId>('sharding-replicas')
const members = ref<MemberDraft[]>(presetMembers(preset.value))
const settings = ref(defaultSettings(preset.value))

watch(preset, (id) => {
  members.value = presetMembers(id)
  settings.value = defaultSettings(id)
})

const nameProblem = computed(() => (name.value.trim() ? bucketNameProblem(name.value.trim()) : null))
const fewMembers = computed(() => members.value.length < 2)
</script>

<template>
  <div>
    <PageHeader
      title="New distributed bucket"
      description="Create the same bucket on several nodes. Each node creates its own bucket, so each creation can fail."
    >
      <template #breadcrumbs>
        <span>·</span>
        <RouterLink :to="MOCK_BASE" class="hover:underline">Distributed buckets</RouterLink>
      </template>
    </PageHeader>

    <div class="container space-y-5 py-6">
      <MockNotice />

      <section class="surface space-y-3 p-5">
        <h2 class="font-display text-base font-semibold text-aruna-navy">Name</h2>
        <Input v-model="name" placeholder="bucket-name" class="max-w-sm font-mono text-xs" :invalid="nameProblem ? 'error' : undefined" aria-label="Bucket name" />
        <p v-if="nameProblem" class="text-xs text-destructive">{{ nameProblem }}</p>
        <p v-else class="text-xs text-muted-foreground">Every member node creates a bucket with this name in your group.</p>
      </section>

      <section class="surface space-y-3 p-5">
        <h2 class="font-display text-base font-semibold text-aruna-navy">Preset</h2>
        <PresetPicker v-model="preset" />
      </section>

      <section class="surface space-y-3 p-5">
        <h2 class="font-display text-base font-semibold text-aruna-navy">Member nodes</h2>
        <p class="text-xs text-muted-foreground">
          Only nodes an operator marked as shard hosts can join. The list is fixed when you create the bucket.
        </p>
        <MemberPicker v-model="members" :preset="preset" />
        <Notice v-if="fewMembers" tone="warning">A distributed bucket needs at least two member nodes.</Notice>
        <dl class="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
          <div v-for="strategy in STRATEGIES" :key="strategy.value" class="flex gap-2">
            <dt class="font-medium text-foreground">{{ strategy.label }}</dt>
            <dd class="text-muted-foreground">{{ strategy.hint }}</dd>
          </div>
        </dl>
      </section>

      <CreateSettings v-model="settings" :preset="preset" :node-ids="members.map((member) => member.nodeId)" />
    </div>
  </div>
</template>
