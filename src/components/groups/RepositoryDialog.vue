<script setup lang="ts">
// Register or edit a repository connector: an Invenio or Zenodo API root, or an
// OAI-PMH endpoint. The optional read token lives only in this form's memory.
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import { computed, ref, useId, watch } from 'vue'
import { Library } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import {
  createRepositoryConnector,
  replaceRepositoryConnector,
  type RepositoryConnector,
  type RepositoryConnectorKind,
} from '@/lib/api'
import { connectorBody } from '@/lib/invenio'
import { errorMessage } from '@/lib/utils'

const props = defineProps<{
  open: boolean
  groupId: string
  connector?: RepositoryConnector | null
}>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'saved', connector: RepositoryConnector): void
}>()

const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
const { writesDisabled } = useConnectivity()
const uid = useId()

const KIND_OPTIONS = [
  { value: 'invenio', label: 'Invenio or Zenodo' },
  { value: 'oai_pmh', label: 'OAI-PMH' },
]

const name = ref('')
const kind = ref<RepositoryConnectorKind>('invenio')
const endpoint = ref('')
const community = ref('')
const token = ref('')
const removeToken = ref(false)
const saving = ref(false)
const submitError = ref<string | null>(null)

const isEdit = computed(() => Boolean(props.connector))
const isInvenio = computed(() => kind.value === 'invenio')
const hasStoredToken = computed(() => Boolean(props.connector?.has_secret_config))
const endpointInvalid = computed(() => {
  try {
    return !/^https?:$/.test(new URL(endpoint.value.trim()).protocol)
  } catch {
    return true
  }
})
const submitDisabled = computed(
  () => saving.value || writesDisabled.value || !name.value.trim() || endpointInvalid.value,
)

function clearToken() {
  token.value = ''
  removeToken.value = false
}

watch(
  () => props.open,
  (open) => {
    clearToken()
    if (!open) return
    const source = props.connector
    name.value = source?.name ?? ''
    kind.value = source?.kind ?? 'invenio'
    endpoint.value = source?.endpoint ?? ''
    community.value = source?.community ?? ''
    submitError.value = null
  },
)

// Another account or realm must never inherit a typed token or an open form.
watch(sessionEpoch, () => {
  clearToken()
  if (props.open) emit('update:open', false)
})

async function submit() {
  if (submitDisabled.value) return
  submitError.value = null
  saving.value = true
  const body = connectorBody(
    { name: name.value, kind: kind.value, endpoint: endpoint.value, community: community.value, token: token.value, removeToken: removeToken.value },
    isEdit.value,
  )
  clearToken()
  const client = { baseUrl: apiBaseUrl.value, token: authToken.value }
  try {
    const saved = props.connector
      ? await replaceRepositoryConnector(props.groupId, props.connector.connector_id, body, client)
      : await createRepositoryConnector(props.groupId, body, client)
    emit('saved', saved)
    emit('update:open', false)
  } catch (err) {
    submitError.value = errorMessage(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent>
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Library class="h-4 w-4 text-primary" />
          {{ isEdit ? 'Edit repository' : 'Add repository' }}
        </DialogTitle>
        <DialogDescription>
          A repository lets this group import published records and publish datasets to it.
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-3" @submit.prevent="submit">
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label :for="`${uid}-name`" class="text-xs font-medium text-foreground">Name</label>
            <Input :id="`${uid}-name`" v-model="name" class="mt-1" placeholder="Zenodo" />
          </div>
          <div>
            <label class="text-xs font-medium text-foreground">Kind</label>
            <Select
              :model-value="kind"
              :options="KIND_OPTIONS"
              aria-label="Kind"
              class="mt-1"
              @update:model-value="(v: string) => (kind = v as RepositoryConnectorKind)"
            />
          </div>
        </div>
        <div>
          <label :for="`${uid}-endpoint`" class="text-xs font-medium text-foreground">
            {{ isInvenio ? 'API URL' : 'OAI-PMH endpoint' }}
          </label>
          <Input
            :id="`${uid}-endpoint`"
            v-model="endpoint"
            class="mt-1 font-mono text-xs"
            :placeholder="isInvenio ? 'https://zenodo.org/api/' : 'https://repository.example.org/oai2d'"
          />
          <p v-if="isInvenio" class="mt-1 text-[11px] text-muted-foreground">
            The repository API root, for example https://zenodo.org/api/ or https://sandbox.zenodo.org/api/.
          </p>
        </div>
        <template v-if="isInvenio">
          <div>
            <label :for="`${uid}-community`" class="text-xs font-medium text-foreground">
              Community <span class="text-muted-foreground">(optional)</span>
            </label>
            <Input :id="`${uid}-community`" v-model="community" class="mt-1 font-mono text-xs" placeholder="my-community" />
          </div>
          <fieldset class="space-y-2 rounded-md border border-border p-3">
            <legend class="px-1 text-xs font-semibold text-foreground">Read token (optional)</legend>
            <p class="text-[11px] text-muted-foreground">
              Only needed to import restricted records. Aruna stores it sealed for this repository and never shows it
              again. Publishing asks for your own token separately. Aruna never asks for your repository password.
            </p>
            <Input
              v-model="token"
              type="password"
              autocomplete="new-password"
              aria-label="Read token"
              class="font-mono text-xs"
              :placeholder="hasStoredToken ? 'Leave empty to keep the stored token' : ''"
            />
            <label v-if="hasStoredToken && !token" class="flex items-center gap-2 text-xs text-foreground">
              <Switch :checked="removeToken" aria-label="Remove the stored token" @update:checked="removeToken = $event" />
              Remove the stored token
            </label>
          </fieldset>
        </template>
        <Notice v-if="submitError" tone="error">{{ submitError }}</Notice>
        <DialogFooter>
          <DialogClose as-child><Button type="button" variant="outline">Cancel</Button></DialogClose>
          <Button type="submit" :disabled="submitDisabled" :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined">
            {{ saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add repository' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
