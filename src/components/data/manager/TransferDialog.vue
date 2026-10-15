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
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { selectionNoun } from '@/lib/deletion/request'
import {
  baseName,
  parentPrefix,
  parseTarget,
  runTransfer,
  targetProblem,
  type TransferMode,
  type TransferSource,
  type TransferStore,
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
// `done` names the sources a move or rename took away; the rest stay ticked.
const emit = defineEmits<{ (e: 'update:open', value: boolean): void; (e: 'done', moved: string[]): void }>()

const s3 = useS3()
const { writesDisabled } = useConnectivity()
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

// The account, node, group and key the transfer starts with serve every request;
// once the browser switches to another session, the transfer stops.
function startTransfer(): { store: TransferStore; check: () => void } {
  const identity = () => {
    const context = s3.activeContext.value
    return context ? `${context.userId}|${context.nodeId}|${context.groupId}|${context.session.accessKeyId}` : ''
  }
  const started = identity()
  const groupId = s3.activeContext.value?.groupId
  const reference = groupId ? s3.referenceForContext(props.nodeId, groupId) : null
  if (!reference) throw new Error('No S3 session is open for this bucket.')
  return {
    store: {
      listObjectsRecursive: (bucket, prefix, max, nodeId, options) =>
        s3.listObjectsRecursive(bucket, prefix, max, nodeId, { ...options, reference }),
      copyObject: (source, bucket, key, nodeId) => s3.copyObject(source, bucket, key, nodeId, reference),
      deleteObject: (bucket, key, nodeId) => s3.deleteObject(bucket, key, nodeId, reference),
      headObject: (bucket, key, nodeId) => s3.headObject(bucket, key, nodeId, undefined, reference),
    },
    check() {
      if (identity() !== started) throw new DOMException('The session changed. The move stopped.', 'AbortError')
    },
  }
}

async function confirm() {
  if (problem.value || busy.value || !target.value || writesDisabled.value) return
  busy.value = true
  error.value = null
  const moved: string[] = []
  try {
    const name = renaming.value ? text.value : undefined
    const { store, check } = startTransfer()
    const onMoved = (key: string) => moved.push(key)
    await runTransfer(store, props.mode, props.bucket, props.sources, target.value, props.nodeId, name, onMoved, check)
    emit('update:open', false)
    emit('done', moved)
  } catch (err) {
    const message = err instanceof DOMException ? err.message : s3ErrorMessage(err)
    error.value = moved.length ? `${message} Already moved: ${moved.map((key) => baseName(key)).join(', ')}.` : message
    emit('done', moved)
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
        <Button
          :disabled="Boolean(problem) || busy || writesDisabled"
          :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
          @click="confirm"
        >{{ busy ? 'Working…' : action }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
