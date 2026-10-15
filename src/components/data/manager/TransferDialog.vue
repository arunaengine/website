<script setup lang="ts">
// Asks where ticked files go, or for a new name, then copies them on this node.
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
import { s3ErrorMessage, useS3 } from '@/composables/useS3'
import { selectionNoun } from '@/lib/deletion/request'
import {
  baseName,
  parentPrefix,
  parseTarget,
  runTransfer,
  targetProblem,
  type TransferMode,
  type TransferSource,
} from '@/lib/objectMove'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  mode: TransferMode
  bucket: string
  prefix: string
  nodeId: string | null
  sources: TransferSource[]
}>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void; (e: 'done'): void }>()

const s3 = useS3()
const text = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
// The prefilled value says nothing until a person types.
const touched = ref(false)

const renaming = computed(() => props.mode === 'rename')
const label = computed(() => {
  if (props.sources.length === 1) {
    const [source] = props.sources
    return `${baseName(source.key)}${source.folder ? '/' : ''}`
  }
  const folders = props.sources.filter((source) => source.folder).length
  return selectionNoun(props.sources.length - folders, folders)
})
const title = computed(() =>
  renaming.value ? 'Rename' : `${props.mode === 'move' ? 'Move' : 'Copy'} ${label.value}`,
)
const action = computed(() => ({ move: 'Move', copy: 'Copy', rename: 'Rename' })[props.mode])
const target = computed(() =>
  renaming.value
    ? { bucket: props.bucket, prefix: parentPrefix(props.sources[0]?.key ?? '') }
    : parseTarget(text.value),
)
const problem = computed(() => {
  if (!target.value) return 'Type a bucket and folder, such as bucket/folder.'
  const reason = targetProblem(props.mode, props.bucket, props.sources, target.value, text.value)
  if (reason) return reason
  return s3.canWritePrefix(target.value.bucket, target.value.prefix, props.nodeId)
    ? null
    : 'This session cannot write there.'
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    error.value = null
    touched.value = false
    text.value = renaming.value ? baseName(props.sources[0]?.key ?? '') : `${props.bucket}/${props.prefix}`
  },
  { immediate: true },
)

async function confirm() {
  if (problem.value || busy.value || !target.value) return
  busy.value = true
  error.value = null
  try {
    const name = renaming.value ? text.value : undefined
    await runTransfer(s3, props.mode, props.bucket, props.sources, target.value, props.nodeId, name)
    emit('update:open', false)
    emit('done')
  } catch (err) {
    error.value = s3ErrorMessage(err)
    emit('done')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>
          {{ renaming ? 'Give it a new name.' : `Pick the folder to ${mode} to. Files stay on this node.` }}
        </DialogDescription>
      </DialogHeader>
      <label class="block space-y-1.5">
        <span class="text-xs font-medium text-foreground">{{ renaming ? 'Name' : 'Folder' }}</span>
        <Input
          v-model="text"
          class="font-mono text-xs"
          :invalid="touched && problem ? 'error' : undefined"
          @input="touched = true"
          @keyup.enter="confirm"
        />
      </label>
      <p v-if="touched && problem" class="text-xs text-destructive">{{ problem }}</p>
      <Notice v-if="error" tone="error">{{ error }}</Notice>
      <DialogFooter>
        <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
        <Button :disabled="Boolean(problem) || busy" @click="confirm">{{ busy ? 'Working…' : action }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
