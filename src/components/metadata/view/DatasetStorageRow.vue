<script setup lang="ts">
// Where a dataset's files are stored. Nothing shows until the node answers; a
// node without the route or a reader without access shows no row.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Notice from '@/components/ui/Notice.vue'
import StorageLocationFields from '@/components/metadata/StorageLocationFields.vue'
import { useAruna } from '@/composables/useAruna'
import { apiErrorMessage, getStorageLocation, setStorageLocation, type DatasetStorageLocation, type StorageLocation } from '@/lib/api'
import { chosenStorage, folderRoute, groupStorage } from '@/lib/crate/dataIdentity'

const props = defineProps<{ documentId: string; groupId: string; canWrite: boolean }>()
const emit = defineEmits<{ (e: 'changed', location: DatasetStorageLocation): void }>()
const { apiBaseUrl, authToken, sessionEpoch, getGroup } = useAruna()

const location = ref<DatasetStorageLocation | null>(null)
// The group's default location; null while unknown.
const groupLocation = ref<StorageLocation | null>(null)
const open = ref(false)
const choice = ref({ bucket: '', prefix: '' })
const busy = ref(false)
const error = ref<string | null>(null)
let generation = 0

watch(
  [() => props.documentId, () => props.groupId, sessionEpoch, apiBaseUrl],
  async () => {
    const current = ++generation
    location.value = null
    groupLocation.value = null
    open.value = false
    getGroup(props.groupId).then((detail) => {
      if (current === generation) groupLocation.value = groupStorage(props.groupId, detail.dataset_location)
    }, () => undefined)
    try {
      const answer = await getStorageLocation(props.documentId, { baseUrl: apiBaseUrl.value, token: authToken.value })
      if (current === generation) location.value = answer
    } catch {
      // Missing, refused or unavailable: the row stays hidden.
    }
  },
  { immediate: true },
)

const label = computed(() => (location.value ? `${location.value.bucket}/${location.value.prefix}` : ''))
// The group default with a folder named after the dataset id.
const datasetDefault = computed(() => (groupLocation.value
  ? { bucket: groupLocation.value.bucket, prefix: `${groupLocation.value.prefix}${props.documentId}/` }
  : null))
const isDefault = computed(() => Boolean(location.value && datasetDefault.value
  && location.value.bucket === datasetDefault.value.bucket && location.value.prefix === datasetDefault.value.prefix))

function change() {
  const found = location.value
  if (!found) return
  choice.value = { bucket: found.bucket, prefix: found.prefix }
  error.value = null
  open.value = true
}

async function save() {
  const current = generation
  const target = chosenStorage(choice.value, null) ?? datasetDefault.value
  if (!target) return
  busy.value = true
  error.value = null
  try {
    const answer = await setStorageLocation(props.documentId, target, { baseUrl: apiBaseUrl.value, token: authToken.value })
    if (current !== generation) return
    location.value = answer
    open.value = false
    emit('changed', answer)
  } catch (failure) {
    if (current === generation) error.value = apiErrorMessage(failure)
  } finally {
    if (current === generation) busy.value = false
  }
}
</script>

<template>
  <div v-if="location" class="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
    <div class="min-w-0">
      <h3 class="flex items-center gap-2 text-sm font-medium text-foreground">
        Storage location <Badge v-if="isDefault" size="sm" variant="outline">Default</Badge>
      </h3>
      <p class="mt-1 break-all text-xs text-muted-foreground">
        Files of this dataset are stored in
        <RouterLink :to="folderRoute(location.bucket, location.prefix, groupId)" class="font-mono text-primary hover:underline">{{ label }}</RouterLink>
      </p>
    </div>
    <Button v-if="canWrite" variant="outline" size="sm" @click="change">Change</Button>

    <Dialog :open="open" @update:open="(value: boolean) => (open = value)">
      <DialogContent class="max-w-lg">
        <DialogHeader>
          <DialogTitle>Change the storage location</DialogTitle>
          <DialogDescription>
            Files pushed with Git go to this bucket and prefix. Existing files stay where they are.
            <template v-if="datasetDefault">
              Default: {{ datasetDefault.bucket }}/{{ datasetDefault.prefix }}, a folder named after the dataset id
              in the group's default storage location.
            </template>
          </DialogDescription>
        </DialogHeader>
        <StorageLocationFields
          v-model="choice"
          :group-id="groupId"
          :default-location="groupLocation"
          :prefix-placeholder="`${documentId}/`"
        />
        <Button
          v-if="datasetDefault && !(choice.bucket === datasetDefault.bucket && choice.prefix.trim() === datasetDefault.prefix)"
          variant="link"
          size="sm"
          class="h-auto justify-start p-0 text-xs"
          @click="choice = { ...datasetDefault }"
        >
          Use the group default
        </Button>
        <Notice v-if="error" tone="error">{{ error }}</Notice>
        <DialogFooter>
          <Button variant="outline" size="sm" :disabled="busy" @click="open = false">Cancel</Button>
          <Button size="sm" :disabled="busy" @click="save">{{ busy ? 'Saving' : 'Save' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
