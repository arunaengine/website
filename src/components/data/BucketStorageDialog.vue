<script setup lang="ts">
// Where a new bucket is stored. The default is this node. Several nodes show the ways
// to keep copies, and the advanced options hold the per-node settings.
import { computed, ref, watch } from 'vue'
import CreateSettings from '@/components/distributed/CreateSettings.vue'
import MemberPicker from '@/components/distributed/MemberPicker.vue'
import MemberSettings from '@/components/distributed/MemberSettings.vue'
import MockNotice from '@/components/distributed/MockNotice.vue'
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
import {
  defaultSettings,
  MIN_MEMBERS,
  presetMembers,
  STRATEGIES,
  type Placement,
  type PresetId,
} from '@/lib/distributedMock'

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
const few = computed(() => draft.value.several && draft.value.members.length < MIN_MEMBERS)

function pickPreset(preset: PresetId) {
  draft.value = { ...draft.value, preset, members: presetMembers(preset), settings: defaultSettings(preset) }
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
          Each node creates its own bucket with the same name, so each creation can fail.
        </DialogDescription>
      </DialogHeader>
      <MockNotice />
      <OptionToggle
        :model-value="draft.several ? 'several' : 'one'"
        :options="WHERE"
        aria-label="Where the bucket is stored"
        @update:model-value="draft = { ...draft, several: $event === 'several' }"
      />
      <template v-if="draft.several">
        <div class="space-y-2">
          <h3 class="text-sm font-medium text-foreground">How copies are kept</h3>
          <PresetPicker :model-value="draft.preset" @update:model-value="pickPreset" />
        </div>
        <div class="space-y-2">
          <h3 class="text-sm font-medium text-foreground">Nodes</h3>
          <p class="text-xs text-muted-foreground">
            Only nodes an operator marked as shard hosts can be chosen. The list is fixed when the bucket is created.
          </p>
          <MemberPicker v-model="draft.members" :preset="draft.preset" />
          <Notice v-if="few" tone="warning">Choose at least two nodes.</Notice>
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
        <Button :disabled="few" @click="apply">Use these settings</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
