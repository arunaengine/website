<script setup lang="ts">
// Creates a branch or a tag from a branch, tag or version.
import { computed, ref, watch } from 'vue'
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
import type { DatasetHistoryState } from '@/composables/useDatasetHistory'
import { createBranch, createTag } from '@/lib/api'
import { shortVersion, writeMessage } from '@/lib/versions'

const props = defineProps<{ history: DatasetHistoryState; kind: 'branch' | 'tag'; source: string }>()
const emit = defineEmits<{ (e: 'created', name: string): void }>()
const open = defineModel<boolean>('open', { required: true })

const name = ref('')
const from = ref(props.source)
const busy = ref(false)
const error = ref('')

watch(open, (isOpen) => {
  if (!isOpen) return
  name.value = ''
  from.value = props.source
  error.value = ''
}, { immediate: true })

const options = computed(() => {
  const list = [
    ...(props.history.branches.value ?? []).map((branch) => ({ value: branch.name, label: branch.name })),
    ...props.history.tags.value.map((tag) => ({ value: tag.name, label: tag.name })),
    ...(props.history.versions.value ?? []).map((version) => ({
      value: version.version,
      label: `${shortVersion(version.version)} ${version.message}`,
    })),
  ]
  if (from.value && !list.some((option) => option.value === from.value)) {
    list.push({ value: from.value, label: shortVersion(from.value) })
  }
  return list
})

async function submit() {
  const wanted = name.value.trim()
  if (busy.value || !wanted || !from.value) return
  busy.value = true
  error.value = ''
  try {
    const documentId = props.history.documentId.value
    const client = props.history.client()
    if (props.kind === 'branch') await createBranch(documentId, { name: wanted, from: from.value }, client)
    else await createTag(documentId, { name: wanted, version: from.value }, client)
    open.value = false
    emit('created', wanted)
  } catch (err) {
    error.value = writeMessage(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>{{ kind === 'branch' ? 'New branch' : 'Create tag' }}</DialogTitle>
        <DialogDescription v-if="kind === 'branch'">
          A branch is a draft line of versions. It does not change the live metadata until it is merged into main.
        </DialogDescription>
        <DialogDescription v-else>A tag is a fixed name for one version, such as v1.0.</DialogDescription>
      </DialogHeader>
      <form class="grid gap-3" @submit.prevent="submit">
        <label class="grid gap-1.5 text-sm">
          <span class="font-medium text-foreground">Name</span>
          <Input v-model="name" :placeholder="kind === 'branch' ? 'draft/new-assay' : 'v1.0'" class="font-mono" />
        </label>
        <div class="grid gap-1.5 text-sm">
          <span class="font-medium text-foreground">{{ kind === 'branch' ? 'Start from' : 'Version' }}</span>
          <Select v-model="from" :options="options" :aria-label="kind === 'branch' ? 'Start from' : 'Version'" />
        </div>
        <Notice v-if="error" tone="error">{{ error }}</Notice>
        <DialogFooter>
          <DialogClose as-child><Button type="button" variant="outline">Cancel</Button></DialogClose>
          <Button type="submit" :disabled="busy || !name.trim()">{{ busy ? 'Creating…' : 'Create' }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
