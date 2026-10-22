<script setup lang="ts">
// Where buckets created from now on keep their files: Aruna storage, one shared S3 bucket,
// or one S3 bucket per bucket from a template. Existing buckets stay where they are.
import { computed, ref, useId, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import { useAruna } from '@/composables/useAruna'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import type { BackendImport, GroupBackendResponse, GroupRoutingResponse } from '@/lib/api'
import { fillTemplate, templateProblem } from '@/lib/bucketNaming'
import { defaultBucket, defaultConflict, splitsBuckets, suggestBucket } from '@/lib/storageRules'
import { errorMessage } from '@/lib/utils'

const props = defineProps<{
  open: boolean
  groupId: string
  groupName: string
  backends: GroupBackendResponse[]
  routing: GroupRoutingResponse | null
  links: BackendImport[]
}>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void; (e: 'saved'): void }>()

const { putGroupRouting, sessionEpoch } = useAruna()
const { writesDisabled } = useConnectivity()
const uid = useId()

const store = ref('')
const mode = ref<'own' | 'shared'>('shared')
const template = ref('')
const shared = ref('')
const saving = ref(false)
const submitError = ref<string | null>(null)
let initial = ''

const ARUNA = 'aruna'
const storeOptions = computed(() => [
  { value: ARUNA, label: 'Aruna storage' },
  ...props.backends
    .filter((backend) => !backend.disabled || backend.backend_id === store.value)
    .map((backend) => ({ value: backend.backend_id, label: backend.name })),
])
const backend = computed(() => props.backends.find((entry) => entry.backend_id === store.value) ?? null)
const splits = computed(() => Boolean(backend.value && splitsBuckets(backend.value)))
const problem = computed(() => {
  if (!backend.value || !splits.value) return null
  if (mode.value === 'own') return templateProblem(template.value, props.groupName)
  return defaultConflict(backend.value, props.links, shared.value.trim())
})
const draft = computed(() => JSON.stringify([store.value, splits.value ? mode.value : '', template.value.trim(), shared.value.trim()]))
const same = computed(() => draft.value === initial)
const destination = computed(() => {
  if (!backend.value) return 'Aruna storage'
  if (!splits.value) return defaultBucket(backend.value) ?? backend.value.name
  return mode.value === 'own' ? fillTemplate(template.value, 'samples', props.groupName) : shared.value.trim()
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    const routing = props.routing
    store.value = routing?.default_target?.backend_id ?? ARUNA
    const chosen = backend.value
    mode.value = routing?.bucket_template ? 'own' : 'shared'
    template.value = routing?.bucket_template ?? suggestBucket(props.groupName).replace(/-default$/, '-{bucket}')
    shared.value = routing?.bucket ?? (chosen ? defaultBucket(chosen) : null) ?? suggestBucket(props.groupName)
    submitError.value = null
    initial = draft.value
  },
)

// Another storage starts from its own shared bucket.
watch(store, (id) => {
  if (!props.open || id === props.routing?.default_target?.backend_id) return
  shared.value = (backend.value ? defaultBucket(backend.value) : null) ?? suggestBucket(props.groupName)
})

// Another account or realm must never inherit an open form.
watch(sessionEpoch, () => {
  if (props.open) emit('update:open', false)
})

async function save() {
  if (same.value || problem.value || saving.value || writesDisabled.value) return
  saving.value = true
  submitError.value = null
  const epoch = sessionEpoch.value
  try {
    const chosen = backend.value
    if (!chosen) await putGroupRouting(props.groupId, null)
    else if (!splits.value) await putGroupRouting(props.groupId, { backend_id: chosen.backend_id })
    else if (mode.value === 'own') await putGroupRouting(props.groupId, { backend_id: chosen.backend_id }, undefined, template.value.trim())
    else await putGroupRouting(props.groupId, { backend_id: chosen.backend_id }, shared.value.trim(), '')
    if (epoch !== sessionEpoch.value) return
    emit('saved')
    emit('update:open', false)
  } catch (err) {
    if (epoch === sessionEpoch.value) submitError.value = errorMessage(err)
  } finally {
    saving.value = false
  }
}

function optionClass(value: 'own' | 'shared') {
  return [
    'flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5',
    mode.value === value ? 'border-primary bg-primary/5' : 'border-border',
  ]
}
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-w-xl">
      <DialogHeader>
        <DialogTitle>New buckets</DialogTitle>
        <DialogDescription>Where buckets created from now on keep their files. Existing buckets stay.</DialogDescription>
      </DialogHeader>
      <form class="grid gap-4" @submit.prevent="save">
        <div>
          <label class="text-xs font-medium">Storage</label>
          <Select v-model="store" :options="storeOptions" aria-label="Storage" class="mt-1" />
        </div>
        <div v-if="splits" class="grid gap-2">
          <label :class="optionClass('own')">
            <input v-model="mode" type="radio" value="own" :name="`${uid}-mode`" class="mt-1" />
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium">Own S3 bucket for each bucket</div>
              <Input
                v-model="template"
                class="mt-2 font-mono"
                aria-label="S3 bucket template"
                :invalid="mode === 'own' && problem ? 'error' : undefined"
                @focus="mode = 'own'"
              />
              <p class="mt-1 text-[11px] text-muted-foreground">
                <span class="font-mono">{bucket}</span> is the bucket name, <span class="font-mono">{group}</span> the group.
                Files keep their names.
              </p>
              <p v-if="mode === 'own' && problem" class="mt-1 text-xs text-destructive">{{ problem }}</p>
            </div>
          </label>
          <label :class="optionClass('shared')">
            <input v-model="mode" type="radio" value="shared" :name="`${uid}-mode`" class="mt-1" />
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium">One shared S3 bucket</div>
              <Input
                v-model="shared"
                class="mt-2 font-mono"
                aria-label="Shared S3 bucket"
                :invalid="mode === 'shared' && problem ? 'error' : undefined"
                @focus="mode = 'shared'"
              />
              <p class="mt-1 text-[11px] text-muted-foreground">Aruna names the files there.</p>
              <p v-if="mode === 'shared' && problem" class="mt-1 text-xs text-destructive">{{ problem }}</p>
            </div>
          </label>
        </div>
        <p class="text-xs text-muted-foreground">
          {{ same ? 'Example' : 'After saving' }}: new bucket <span class="font-mono text-foreground">samples</span> →
          <span class="font-mono text-foreground">{{ destination }}</span>
        </p>
        <Notice v-if="submitError" tone="error">{{ submitError }}</Notice>
        <DialogFooter>
          <DialogClose as-child><Button type="button" variant="outline" size="sm">Cancel</Button></DialogClose>
          <Button
            type="submit"
            size="sm"
            :disabled="same || Boolean(problem) || saving || writesDisabled"
            :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
          >
            {{ saving ? 'Saving…' : 'Save' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
