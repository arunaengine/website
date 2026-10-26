<script setup lang="ts">
// Where a new bucket is stored. The default is this node. Several nodes show the ways
// to keep copies, and the advanced options hold the per-node settings.
import { computed, ref, watch } from 'vue'
import CreateSettings from '@/components/distributed/CreateSettings.vue'
import StorageFeatureLink from '@/components/distributed/StorageFeatureLink.vue'
import MemberPicker from '@/components/distributed/MemberPicker.vue'
import MemberSettings from '@/components/distributed/MemberSettings.vue'
import PresetPicker from '@/components/distributed/PresetPicker.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Notice from '@/components/ui/Notice.vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { defaultSettings, membersFor, presetById, STRATEGIES, type Placement, type PresetId } from '@/lib/distributedMock'
import { placementProblem } from '@/lib/distribution'

const props = defineProps<{ open: boolean; modelValue: Placement }>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void; (e: 'update:modelValue', value: Placement): void }>()

const draft = ref<Placement>(props.modelValue)
watch(
  () => props.open,
  (open) => {
    if (open) draft.value = { ...props.modelValue }
  },
)

const WHERE = [
  { value: 'one', label: 'This node' },
  { value: 'several', label: 'Several nodes' },
]
const { nodes, localNodeId } = useRealmNodes()
const problem = computed(() => (draft.value.several ? placementProblem(draft.value) : null))

// Reachable infrastructure nodes, this node first.
const reachable = computed(() =>
  nodes.value
    .filter((node) => node.kind !== 'user' && node.reachable)
    .sort((a, b) => Number(b.nodeId === localNodeId.value) - Number(a.nodeId === localNodeId.value))
    .map((node) => node.nodeId),
)

function start(preset: PresetId) {
  return membersFor(preset, reachable.value.slice(0, presetById(preset).members.length))
}

function pickPreset(preset: PresetId) {
  draft.value = { ...draft.value, preset, members: start(preset), settings: defaultSettings(preset) }
}

function pickWhere(value: string) {
  const several = value === 'several'
  const empty = !draft.value.members.length
  draft.value = { ...draft.value, several, members: several && empty ? start(draft.value.preset) : draft.value.members }
}

function apply() {
  emit('update:modelValue', draft.value)
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-w-3xl">
      <DialogHeader>
        <DialogTitle>Where should this bucket be stored?</DialogTitle>
        <DialogDescription>
          Each node creates its own bucket, so each can fail.
          <StorageFeatureLink question="nodes" class="ml-1" />
        </DialogDescription>
      </DialogHeader>
      <OptionToggle
        :model-value="draft.several ? 'several' : 'one'"
        :options="WHERE"
        aria-label="Where the bucket is stored"
        @update:model-value="pickWhere"
      />
      <template v-if="draft.several">
        <div class="space-y-2">
          <h3 class="text-sm font-medium text-foreground">How copies are kept</h3>
          <PresetPicker :model-value="draft.preset" @update:model-value="pickPreset" />
        </div>
        <div class="space-y-2">
          <h3 class="text-sm font-medium text-foreground">Nodes</h3>
          <p class="text-xs text-muted-foreground">Only reachable realm nodes can hold a bucket. The first node writes.</p>
          <MemberPicker v-model="draft.members" :preset="draft.preset" />
          <Notice v-if="problem" tone="warning">{{ problem }}</Notice>
        </div>
        <details class="rounded-md border border-border px-4 py-3">
          <summary class="cursor-pointer text-sm font-medium text-foreground">Advanced options</summary>
          <div class="mt-4 space-y-5">
            <div class="space-y-2">
              <h3 class="text-sm font-medium text-foreground">Per node</h3>
              <MemberSettings v-model="draft.members" :preset="draft.preset" />
              <dl class="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                <div v-for="strategy in STRATEGIES" :key="strategy.value" class="flex gap-2">
                  <dt class="font-medium text-foreground">{{ strategy.label }}</dt>
                  <dd class="text-muted-foreground">{{ strategy.hint }}</dd>
                </div>
              </dl>
            </div>
            <CreateSettings v-model="draft.settings" :preset="draft.preset" :node-ids="draft.members.map((member) => member.nodeId)" />
          </div>
        </details>
      </template>
      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">Cancel</Button>
        <Button :disabled="Boolean(problem)" @click="apply">Use these settings</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
