<script setup lang="ts">
// What the node must offer the run. The tiles show the decision; Edit turns
// their values into inputs in place.
import { computed, nextTick, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import RunSection from '@/components/compute/run/RunSection.vue'
import RunTile from '@/components/compute/run/RunTile.vue'
import AiMark from '@/components/compute/run/AiMark.vue'
import { Check, Cpu, Pencil, RotateCcw } from '@lucide/vue'
import {
  DEFAULT_RESOURCES,
  MAX_RESOURCE_GB,
  MIN_RESOURCE_GB,
  U32_MAX,
  injectCustomRun,
} from '@/composables/useCustomRun'

const {
  cpuCores,
  ramGb,
  diskGb,
  cpuCoresValid,
  ramGbValid,
  diskGbValid,
  resourcesValid,
  resourcesEdited,
  resetResources,
  hasAi,
  clearAi,
} = injectCustomRun()

const editing = ref(false)
async function toggle() {
  editing.value = !editing.value
  if (!editing.value) return
  await nextTick()
  globalThis.document?.getElementById('run-cpu')?.focus()
}
/** The footer jumps here, so a problem opens the editor on its own. */
defineExpose({ open: () => { if (!editing.value) void toggle() } })

const tag = (value: string | number, fallback: string) =>
  String(value).trim() === fallback ? 'default' : 'requested'
const shown = (value: string | number) => (String(value).trim() ? String(value).trim() : 'node decides')
const checkLabel = computed(() => (resourcesValid.value ? 'Complete' : 'Check the numbers'))
</script>

<template>
  <RunSection
    id="section-resources"
    :icon="Cpu"
    title="Resources"
    :complete="resourcesValid"
    :check-label="checkLabel"
  >
    <template #state>
      What the node must offer the run.
      <DocsLink topic="compute-run" label="Docs" />
    </template>
    <template #controls>
      <Button v-if="resourcesEdited" variant="outline" size="sm" @click="resetResources">
        <RotateCcw class="size-3.5" /> Reset to defaults
      </Button>
      <Button
        variant="outline"
        size="sm"
        :aria-expanded="editing"
        :aria-label="editing ? 'Done editing resources' : 'Edit resources'"
        @click="toggle"
      >
        <template v-if="editing"><Check class="size-3.5" /> Done</template>
        <template v-else><Pencil class="size-3.5" /> Edit resources</template>
      </Button>
    </template>

    <dl data-tutorial="run-resources" class="grid gap-x-6 gap-y-4 sm:grid-cols-3">
      <RunTile
        label="CPU cores"
        :tag="tag(cpuCores, DEFAULT_RESOURCES.cpuCores)"
        :value="shown(cpuCores)"
      >
        <template v-if="editing">
          <Input
            id="run-cpu"
            v-model="cpuCores"
            type="number"
            min="1"
            :max="U32_MAX"
            step="1"
            class="h-8"
            aria-label="CPU cores"
            :aria-invalid="cpuCoresValid ? undefined : 'true'"
            :invalid="cpuCoresValid ? undefined : 'error'"
            @update:model-value="clearAi('resources')"
          />
        </template>
        <template v-else-if="hasAi('resources')">{{ shown(cpuCores) }} <AiMark /></template>
      </RunTile>
      <RunTile
        label="RAM"
        :tag="tag(ramGb, DEFAULT_RESOURCES.ramGb)"
        :value="String(ramGb).trim() ? `${shown(ramGb)}\u00a0GB` : shown(ramGb)"
      >
        <template v-if="editing">
          <Input
            id="run-ram"
            v-model="ramGb"
            type="number"
            :min="MIN_RESOURCE_GB"
            :max="MAX_RESOURCE_GB"
            step="any"
            class="h-8"
            aria-label="RAM in GB"
            :aria-invalid="ramGbValid ? undefined : 'true'"
            :invalid="ramGbValid ? undefined : 'error'"
            @update:model-value="clearAi('resources')"
          />
        </template>
      </RunTile>
      <RunTile
        label="Disk"
        :tag="tag(diskGb, DEFAULT_RESOURCES.diskGb)"
        :value="String(diskGb).trim() ? `${shown(diskGb)}\u00a0GB` : shown(diskGb)"
      >
        <template v-if="editing">
          <Input
            id="run-disk"
            v-model="diskGb"
            type="number"
            :min="MIN_RESOURCE_GB"
            :max="MAX_RESOURCE_GB"
            step="any"
            class="h-8"
            aria-label="Disk in GB"
            :aria-invalid="diskGbValid ? undefined : 'true'"
            :invalid="diskGbValid ? undefined : 'error'"
            @update:model-value="clearAi('resources')"
          />
        </template>
      </RunTile>
    </dl>

    <p v-if="!cpuCoresValid" class="mt-1.5 text-xs text-destructive">CPU cores: a whole number of 1 or more.</p>
    <p v-if="!ramGbValid" class="mt-1.5 text-xs text-destructive">RAM must be greater than zero.</p>
    <p v-if="!diskGbValid" class="mt-1.5 text-xs text-destructive">Disk must be greater than zero.</p>
  </RunSection>
</template>
