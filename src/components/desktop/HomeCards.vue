<script setup lang="ts">
// The desktop's own part of Home above the Overview: a note while the node is not running, and the
// first steps as a card. A step is done only when the node said so.
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useLocalStorage } from '@vueuse/core'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import BindFolderDialog from '@/components/desktop/BindFolderDialog.vue'
import NewBucketDialog from '@/components/desktop/NewBucketDialog.vue'
import StartLine from '@/components/dashboard/StartLine.vue'
import { useAruna } from '@/composables/useAruna'
import { usePortalFeatures } from '@/composables/usePortalFeatures'
import { useDeviceCompute } from '@/composables/useDeviceCompute'
import { useDeviceKeys } from '@/composables/useDeviceKeys'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { useHasBucket } from '@/composables/useHasBucket'
import { useNodeControl } from '@/composables/useNodeControl'
import { useSyncedFolders } from '@/composables/useSyncedFolders'
import type { BindSource } from '@/lib/bindSource'
import { FolderPlus, KeyRound, Play, Plus } from '@lucide/vue'

const { myGroups } = useAruna()
const deviceKeys = useDeviceKeys()
const { shown } = usePortalFeatures()
const { status, state: nodeState } = useDeviceStatus()
const { folders, listState: foldersState, load: loadFolders } = useSyncedFolders()
const { compute } = useDeviceCompute()
const control = useNodeControl()

const showBind = ref(false)
const showNewBucket = ref(false)
// The bucket New bucket hands on to the link; empty lets the owner pick one.
const bindTarget = ref<Partial<BindSource> & { newBucket?: boolean }>({})
const { hasBucket, load: loadBuckets } = useHasBucket()
const startHidden = useLocalStorage('aruna:desktop:get-started-hidden', false)

function openBind(target: Partial<BindSource> & { newBucket?: boolean } = {}) {
  bindTarget.value = target
  showBind.value = true
}

// A linked folder always has its bucket.
function onBound() {
  hasBucket.value = true
  void loadFolders()
}

const notRunning = computed(() => nodeState.value === 'stopped' || nodeState.value === 'error')
const runsShown = computed(() => shown('compute'))

// Each step is done only when the node said so.
const steps = computed(() => [
  { key: 'bucket', done: hasBucket.value === true, next: 'create a bucket' },
  { key: 'folder', done: folders.value.length > 0, next: 'link a local folder' },
  { key: 'tools', done: deviceKeys.active.value.length > 0, next: 'connect your tools (aws, rclone, Python, Nextflow)' },
  ...(runsShown.value ? [{ key: 'runs', done: compute.value?.enabled === true, next: 'run jobs on this computer' }] : []),
])
const stepsDone = computed(() => steps.value.filter((step) => step.done).length)
// The card names the open steps and offers their buttons, the next one first.
const open = computed(() => steps.value.filter((step) => !step.done))
const nextText = computed(() => {
  const words = open.value.map((step) => step.next)
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : (words[0] ?? '')
})
const variant = (key: string) => (open.value[0]?.key === key ? 'default' : 'outline')
// Only loaded lists can say a step is open, so nothing shows before that.
const showSteps = computed(
  () =>
    !startHidden.value &&
    hasBucket.value !== null &&
    foldersState.value === 'ready' &&
    deviceKeys.state.value !== 'idle' &&
    deviceKeys.state.value !== 'loading' &&
    stepsDone.value < steps.value.length,
)

onMounted(loadBuckets)
</script>

<template>
  <div class="space-y-5 empty:hidden">
    <Notice v-if="notRunning" tone="warning">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="font-medium">This computer is not running.</p>
          <p class="mt-0.5">{{ status?.message || 'Your folders, tools and local runs wait until it runs again.' }}</p>
          <p v-if="control.error.value" class="mt-1 text-destructive">{{ control.error.value }}</p>
        </div>
        <Button variant="outline" size="sm" :disabled="control.busy.value" @click="control.start">
          <Play class="h-3.5 w-3.5" /> Start
        </Button>
      </div>
    </Notice>

    <!-- First steps: leave once every one is done. -->
    <StartLine v-if="showSteps && open.length" :done="stepsDone" :total="steps.length" :next="nextText" @hide="startHidden = true">
      <template v-for="step in open" :key="step.key">
        <template v-if="step.key === 'bucket'">
          <!-- A bucket belongs to a group, so a group comes first. -->
          <Button v-if="myGroups.length" :variant="variant('bucket')" size="sm" class="max-sm:flex-1" @click="showNewBucket = true">
            <Plus class="h-3.5 w-3.5" /> New bucket
          </Button>
          <Button v-else :variant="variant('bucket')" size="sm" class="max-sm:flex-1" as-child>
            <RouterLink :to="{ name: 'groups' }">Create a group first</RouterLink>
          </Button>
        </template>
        <Button v-else-if="step.key === 'folder'" :variant="variant('folder')" size="sm" class="max-sm:flex-1" @click="openBind()">
          <FolderPlus class="h-3.5 w-3.5" /> Link a local folder
        </Button>
        <Button v-else-if="step.key === 'tools'" :variant="variant('tools')" size="sm" class="max-sm:flex-1" as-child>
          <RouterLink :to="{ name: 'settings', query: { tab: 'access', create: 'key' } }"><KeyRound class="h-3.5 w-3.5" /> Connect your tools</RouterLink>
        </Button>
        <Button v-else :variant="variant('runs')" size="sm" class="max-sm:flex-1" as-child>
          <RouterLink :to="{ name: 'device', query: { section: 'local-runs' } }"><Play class="h-3.5 w-3.5" /> Run jobs here</RouterLink>
        </Button>
      </template>
    </StartLine>

    <BindFolderDialog v-model:open="showBind" v-bind="bindTarget" @bound="onBound" />
    <NewBucketDialog
      v-model:open="showNewBucket"
      @created="hasBucket = true"
      @link="(target: BindSource) => openBind({ ...target, newBucket: true })"
    />
  </div>
</template>
