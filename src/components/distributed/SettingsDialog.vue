<script setup lang="ts">
// The settings of the whole bucket. The node replaces them as one object and does not report the
// current values, so every field is set here.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import { useSetChanges } from '@/composables/useSetChanges'
import { RANGE_MODES, REFRESH_OPTIONS, type RangeMode } from '@/lib/distributedMock'
import { defaultDraft, draftProblem, settingsBody, type DistributedBucket, type SettingsDraft } from '@/lib/distribution'

const props = defineProps<{ open: boolean; bucket: DistributedBucket }>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void; (e: 'changed'): void }>()

const draft = ref<SettingsDraft>(defaultDraft())
const changes = useSetChanges(computed(() => props.bucket.live))

watch(() => props.open, (open) => open && (draft.value = defaultDraft()))

const MODES = [{ value: 'member', label: 'Each node decides' }, ...RANGE_MODES.map(({ value, label }) => ({ value, label }))]
const modeHint = computed(() => RANGE_MODES.find((mode) => mode.value === draft.value.mode)?.hint ?? 'Each node follows its own data strategy.')
const problem = computed(() => draftProblem(draft.value))

function set<K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) {
  draft.value = { ...draft.value, [key]: value }
}

async function save() {
  if (problem.value || !(await changes.settings(settingsBody(draft.value)))) return
  emit('changed')
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Reads and updates</DialogTitle>
        <DialogDescription>These settings apply to the whole bucket.</DialogDescription>
      </DialogHeader>
      <Notice tone="warning">
        The node does not report the current values. Saving sets every field below.
      </Notice>
      <div class="space-y-4">
        <div class="space-y-1">
          <label class="text-xs font-medium text-foreground" for="set-refresh">Check external sources</label>
          <Select id="set-refresh" :model-value="draft.refresh" :options="REFRESH_OPTIONS" aria-label="Refresh interval" @update:model-value="set('refresh', $event)" />
        </div>
        <div class="space-y-1">
          <span class="text-xs font-medium text-foreground">Range requests</span>
          <OptionToggle :model-value="draft.mode" :options="MODES" aria-label="Range request behaviour" @update:model-value="set('mode', $event as RangeMode | 'member')" />
          <p class="text-xs text-muted-foreground">{{ modeHint }}</p>
        </div>
        <label class="flex items-start gap-3 text-sm">
          <Switch :checked="draft.index" aria-label="Search index" @update:checked="set('index', $event)" />
          <span class="font-medium text-foreground">Search index</span>
        </label>
        <label class="flex items-start gap-3 text-sm">
          <Switch :checked="draft.public" aria-label="Public" @update:checked="set('public', $event)" />
          <span class="font-medium text-foreground">Public</span>
        </label>
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="space-y-1">
            <label class="text-xs font-medium text-foreground" for="set-split-objects">Split a range above (files)</label>
            <Input id="set-split-objects" :model-value="draft.splitObjects" inputmode="numeric" placeholder="Never" @update:model-value="set('splitObjects', String($event))" />
          </div>
          <div class="space-y-1">
            <label class="text-xs font-medium text-foreground" for="set-split-bytes">Split a range above (bytes)</label>
            <Input id="set-split-bytes" :model-value="draft.splitBytes" inputmode="numeric" placeholder="Never" @update:model-value="set('splitBytes', String($event))" />
          </div>
        </div>
      </div>
      <Notice v-if="problem" tone="warning">{{ problem }}</Notice>
      <Notice v-if="changes.failure.value" tone="error">{{ changes.failure.value }}</Notice>
      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">Cancel</Button>
        <Button :disabled="Boolean(problem) || changes.busy.value" @click="save">Save</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
