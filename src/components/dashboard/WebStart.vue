<script setup lang="ts">
// The first steps of the web portal: a bucket, then a key for the tools. Gone once both are done or
// after Hide, which the account keeps.
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import StartLine from '@/components/dashboard/StartLine.vue'
import { useAruna } from '@/composables/useAruna'
import { useHasBucket } from '@/composables/useHasBucket'
import { useOnboarding } from '@/composables/useOnboarding'
import { usePortalFeatures } from '@/composables/usePortalFeatures'

const { myGroups, credentials } = useAruna()
const { hasDone, dismissOnboarding } = useOnboarding()
const { shown } = usePortalFeatures()
const { hasBucket, load } = useHasBucket()
onMounted(load)

const steps = computed(() => [
  { key: 'bucket', done: hasBucket.value === true, next: 'create a bucket' },
  ...(shown('s3-keys')
    ? [{ key: 'tools', done: credentials.value.some((key) => key.status === 'active'), next: 'connect your tools (aws, rclone, Python, Nextflow)' }]
    : []),
])
const open = computed(() => steps.value.find((step) => !step.done))
const done = computed(() => steps.value.filter((step) => step.done).length)
// Only a read bucket list can say the first step is open.
const visible = computed(() => !hasDone('dismissed') && hasBucket.value !== null && Boolean(open.value))
</script>

<template>
  <StartLine v-if="visible && open" :done="done" :total="steps.length" :next="open.next" @hide="dismissOnboarding">
    <template v-if="open.key === 'bucket'">
      <!-- A bucket belongs to a group, so a group comes first. -->
      <Button v-if="myGroups.length" variant="outline" size="sm" as-child>
        <RouterLink to="/app/buckets">Create a bucket</RouterLink>
      </Button>
      <Button v-else variant="outline" size="sm" as-child>
        <RouterLink :to="{ name: 'groups' }">Create a group first</RouterLink>
      </Button>
    </template>
    <Button v-else variant="outline" size="sm" as-child>
      <RouterLink :to="{ name: 'settings', query: { tab: 'access', create: 'key' } }">Create a key</RouterLink>
    </Button>
  </StartLine>
</template>
