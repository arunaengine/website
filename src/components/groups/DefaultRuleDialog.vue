<script setup lang="ts">
// The default rule of a group: all buckets go to one bucket of one of its storages.
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
import { computed, ref, useId, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { defaultBucket, defaultConflict, splitsBuckets, suggestBucket } from '@/lib/storageRules'
import type { BackendImport, GroupBackendResponse } from '@/lib/api'
import { errorMessage } from '@/lib/utils'

const props = defineProps<{
  open: boolean
  groupId: string
  groupName: string
  backend: GroupBackendResponse | null
  links: BackendImport[]
}>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'saved'): void
}>()

const { putGroupRouting, saving, sessionEpoch } = useAruna()
const { writesDisabled } = useConnectivity()
const uid = useId()

const bucket = ref('')
const submitError = ref<string | null>(null)

const splits = computed(() => (props.backend ? splitsBuckets(props.backend) : false))
const problem = computed(() =>
  props.backend && splits.value ? defaultConflict(props.backend, props.links, bucket.value.trim()) : null,
)
const submitDisabled = computed(() => saving.value || writesDisabled.value || Boolean(problem.value))

// Each opening is a new draft; a save from an earlier opening must not touch it.
let opening = 0

watch(
  () => props.open,
  (open) => {
    if (!open || !props.backend) return
    opening += 1
    bucket.value = defaultBucket(props.backend) ?? suggestBucket(props.groupName)
    submitError.value = null
  },
)

// Another account or realm must never inherit an open form.
watch(sessionEpoch, () => {
  if (props.open) emit('update:open', false)
})

async function submit() {
  if (submitDisabled.value || !props.backend) return
  submitError.value = null
  const generation = opening
  const epoch = sessionEpoch.value
  const current = () => generation === opening && epoch === sessionEpoch.value
  try {
    const name = splits.value ? bucket.value.trim() : undefined
    await putGroupRouting(props.groupId, { backend_id: props.backend.backend_id }, name)
    if (epoch !== sessionEpoch.value) return
    emit('saved')
    if (current()) emit('update:open', false)
  } catch (err) {
    if (current()) submitError.value = errorMessage(err)
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-xl">
      <DialogHeader>
        <DialogTitle>Default rule</DialogTitle>
        <DialogDescription>
          New uploads of all buckets go to {{ backend?.name }}, unless a linked rule covers them.
        </DialogDescription>
      </DialogHeader>
      <form class="space-y-3" @submit.prevent="submit">
        <div v-if="splits" class="space-y-1">
          <label :for="`${uid}-bucket`" class="text-xs font-medium text-foreground">
            Bucket in {{ backend?.name }}
          </label>
          <Input
            :id="`${uid}-bucket`"
            v-model="bucket"
            class="font-mono text-xs"
            :invalid="problem ? 'error' : undefined"
            placeholder="aruna-lab-default"
          />
          <p v-if="problem" class="text-[11px] text-destructive">{{ problem }}</p>
          <p v-else class="text-[11px] text-muted-foreground">
            Aruna creates the bucket if it is missing. Aruna keeps its own layout there and never reads it back.
          </p>
        </div>
        <p v-else class="text-xs text-foreground">
          New uploads go to bucket <span class="font-mono">{{ backend ? defaultBucket(backend) : '' }}</span>.
        </p>
        <Notice v-if="submitError" tone="error">{{ submitError }}</Notice>
        <DialogFooter>
          <DialogClose as-child><Button type="button" variant="outline">Cancel</Button></DialogClose>
          <Button type="submit" :disabled="submitDisabled" :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined">
            {{ saving ? 'Saving…' : 'Use as default' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
