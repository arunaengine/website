<script setup lang="ts">
// Creating a notebook is the same wherever the data view stands: name it, and
// the file is written into the folder on screen at the first save.
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import { useS3 } from '@/composables/useS3'
import { notebookKey, notebookSlug } from '@/lib/notebook/document'

const props = defineProps<{ open: boolean; bucket: string; prefix: string; groupId: string }>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const router = useRouter()
const s3 = useS3()
const name = ref('')

const target = computed(() => notebookKey(notebookSlug(name.value), props.prefix))
const canCreate = computed(() => Boolean(
  name.value.trim() &&
  props.bucket &&
  s3.activeContext.value?.groupId === props.groupId &&
  s3.canWrite(props.bucket, target.value),
))

watch(() => props.open, (open) => { if (open) name.value = '' })
// A different storage session may not write here at all.
watch(s3.activeContext, () => emit('update:open', false))

function create() {
  if (!props.open || !canCreate.value) return
  emit('update:open', false)
  void router.push({
    name: 'notebook',
    params: { bucketId: props.bucket, key: target.value },
    query: { group: props.groupId },
  })
}
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>New notebook</DialogTitle>
        <DialogDescription>
          Opens <span class="font-mono text-xs">{{ target }}</span> in
          <span class="font-mono text-xs">{{ bucket }}</span>. The file is written on the first save.
        </DialogDescription>
      </DialogHeader>
      <Input
        v-model="name"
        aria-label="Notebook name"
        placeholder="first-look"
        class="font-mono text-xs"
        @keyup.enter="create"
      />
      <DialogFooter>
        <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
        <Button :disabled="!canCreate" @click="create">Open</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
