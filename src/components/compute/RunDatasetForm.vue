<script setup lang="ts">
// Creates a dataset of a run's results, the way a bucket is described as one: the results are
// its parts, the inputs what it is based on, and it mentions the run record.
import { computed, ref } from 'vue'
import ValueInput from '@/components/metadata/editor/ValueInput.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Switch from '@/components/ui/Switch.vue'
import Textarea from '@/components/ui/Textarea.vue'
import { useAruna } from '@/composables/useAruna'
import { apiErrorMessage } from '@/lib/api'
import { LICENSE_PRESETS } from '@/lib/crate/editor'
import type { RunCrateModel } from '@/lib/runCrate'
import { resultsDatasetCrate } from '@/lib/runDataset'

const props = defineProps<{ run: RunCrateModel; recordId: string; taskId: string; groupId: string; runName: string }>()
const emit = defineEmits<{ (event: 'created', documentId: string): void; (event: 'close'): void }>()

const { createMetadata, sessionEpoch } = useAruna()

const draft = ref({
  title: `Results of ${props.runName}`,
  description: `The results of the run ${props.runName}, with the inputs it read.`,
  license: '',
  public: false,
})
const busy = ref(false)
const failure = ref<string | null>(null)
const ready = computed(() => Boolean(draft.value.title.trim() && draft.value.description.trim()))

async function submit() {
  const epoch = sessionEpoch.value
  busy.value = true
  failure.value = null
  try {
    const created = await createMetadata({
      group_id: props.groupId,
      path: `datasets/results/${props.taskId}`,
      public: draft.value.public,
      rocrate: resultsDatasetCrate(props.run, props.recordId, {
        name: draft.value.title.trim(),
        description: draft.value.description.trim(),
        license: draft.value.license.trim(),
        published: new Date().toISOString(),
      }),
    })
    if (epoch === sessionEpoch.value) emit('created', created.document_id)
  } catch (cause) {
    if (epoch === sessionEpoch.value) failure.value = apiErrorMessage(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-3 rounded-lg border border-border p-4">
    <div class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[7rem_1fr] sm:items-center">
      <label for="results-title" class="text-muted-foreground">Title</label>
      <Input id="results-title" v-model="draft.title" />
      <label for="results-description" class="self-start pt-2 text-muted-foreground">Description</label>
      <Textarea id="results-description" v-model="draft.description" class="min-h-20 font-sans" />
      <span class="text-muted-foreground">License</span>
      <ValueInput :model-value="{ kind: 'url', value: draft.license }" label="License" :presets="LICENSE_PRESETS" @update:model-value="(next) => (draft.license = next.value)" />
      <span class="text-muted-foreground">Public</span>
      <label class="flex items-center gap-2">
        <Switch v-model:checked="draft.public" aria-label="Anyone may read the dataset" />
        Anyone may read the dataset
      </label>
    </div>
    <p class="text-xs text-muted-foreground">
      {{ run.outputs.length }} result{{ run.outputs.length === 1 ? '' : 's' }} as its files, based on
      {{ run.inputs.length }} input{{ run.inputs.length === 1 ? '' : 's' }}, with a link to the run record.
    </p>
    <Notice v-if="failure" tone="error">{{ failure }}</Notice>
    <div class="flex justify-end gap-2">
      <Button variant="ghost" size="sm" :disabled="busy" @click="emit('close')">Cancel</Button>
      <Button size="sm" :disabled="busy || !ready" @click="submit">Create the dataset</Button>
    </div>
  </div>
</template>
