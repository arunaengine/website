<script setup lang="ts">
// Describes a bucket as a new dataset, prefilled with the bucket's name, or links an existing
// dataset. Either way the bucket then reads its description from that dataset.
import { computed, ref } from 'vue'
import ValueInput from '@/components/metadata/editor/ValueInput.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Switch from '@/components/ui/Switch.vue'
import Textarea from '@/components/ui/Textarea.vue'
import { useAruna } from '@/composables/useAruna'
import { apiErrorMessage, type BucketMetadata, type BucketMetadataAnswer } from '@/lib/api'
import { LICENSE_PRESETS } from '@/lib/crate/editor'
import { datasetIdOf, pageIdentifier } from '@/lib/databases'

const props = defineProps<{ mode: 'describe' | 'link'; bucket: string; nodeId: string | null; metadata: BucketMetadata }>()
const emit = defineEmits<{ (event: 'linked', answer: BucketMetadataAnswer): void; (event: 'close'): void }>()

const { describeBucket, putBucketMetadata } = useAruna()

const draft = ref({ title: props.bucket, description: '', version: '', license: '', page: '', public: false })
const linkText = ref('')
const busy = ref(false)
const failure = ref<string | null>(null)

// A typed DOI or link that reads as neither is refused, never dropped.
const pageInvalid = computed(() => Boolean(draft.value.page.trim()) && !pageIdentifier(draft.value.page))
const linkId = computed(() => datasetIdOf(linkText.value))
const ready = computed(() =>
  props.mode === 'describe'
    ? Boolean(draft.value.title.trim() && draft.value.description.trim()) && !pageInvalid.value
    : Boolean(linkId.value),
)

async function submit() {
  busy.value = true
  failure.value = null
  try {
    if (props.mode === 'describe') {
      const page = pageIdentifier(draft.value.page)
      const created = await describeBucket(props.bucket, {
        title: draft.value.title.trim(),
        description: draft.value.description.trim(),
        version: draft.value.version.trim() || null,
        license: draft.value.license.trim() || null,
        identifiers: page ? [page] : [],
        public: draft.value.public,
      }, props.nodeId)
      emit('linked', { metadata: created.metadata, description: created.description, description_unavailable: null })
    } else {
      emit('linked', await putBucketMetadata(props.bucket, { ...props.metadata, dataset: linkId.value }, props.nodeId))
    }
  } catch (cause) {
    failure.value = apiErrorMessage(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-3 rounded-lg border border-border p-4">
    <div v-if="mode === 'describe'" class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[7rem_1fr] sm:items-center">
      <label for="dataset-title" class="text-muted-foreground">Title</label>
      <Input id="dataset-title" v-model="draft.title" />
      <label for="dataset-description" class="self-start pt-2 text-muted-foreground">Description</label>
      <Textarea id="dataset-description" v-model="draft.description" class="min-h-20 font-sans" />
      <label for="dataset-version" class="text-muted-foreground">Version</label>
      <Input id="dataset-version" v-model="draft.version" placeholder="6.0" />
      <span class="text-muted-foreground">License</span>
      <ValueInput :model-value="{ kind: 'url', value: draft.license }" label="License" :presets="LICENSE_PRESETS" @update:model-value="(next) => (draft.license = next.value)" />
      <label for="dataset-page" class="text-muted-foreground">DOI or link</label>
      <Input id="dataset-page" v-model="draft.page" class="font-mono text-xs" placeholder="10.5281/zenodo.4247252" :invalid="pageInvalid ? 'error' : undefined" />
      <p v-if="pageInvalid" role="alert" class="text-xs text-destructive sm:col-start-2">Enter a DOI such as 10.5281/zenodo.4247252 or a link starting with https://.</p>
      <span class="text-muted-foreground">Public</span>
      <label class="flex items-center gap-2">
        <Switch v-model:checked="draft.public" aria-label="Anyone may read the dataset" />
        Anyone may read the dataset
      </label>
    </div>
    <div v-else class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[7rem_1fr] sm:items-center">
      <label for="dataset-link" class="text-muted-foreground">Dataset</label>
      <Input id="dataset-link" v-model="linkText" class="font-mono text-xs" placeholder="Dataset id or link" />
      <p class="text-xs text-muted-foreground sm:col-start-2">The dataset must exist and you must be able to read it.</p>
    </div>
    <Notice v-if="failure" tone="error">{{ failure }}</Notice>
    <div class="flex justify-end gap-2">
      <Button variant="ghost" size="sm" :disabled="busy" @click="emit('close')">Cancel</Button>
      <Button size="sm" :disabled="busy || !ready" @click="submit">{{ mode === 'describe' ? 'Create the dataset' : 'Link the dataset' }}</Button>
    </div>
  </div>
</template>
