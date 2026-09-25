<script setup lang="ts">
// Asks before a history write and shows its refusal inline.
import { ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Notice from '@/components/ui/Notice.vue'
import { writeMessage } from '@/lib/versions'

const props = defineProps<{
  title: string
  description: string
  action: string
  run: () => Promise<unknown>
}>()
const emit = defineEmits<{ (e: 'done'): void }>()
const open = defineModel<boolean>('open', { required: true })

const busy = ref(false)
const error = ref('')
watch(open, (isOpen) => {
  if (isOpen) error.value = ''
})

async function confirm() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await props.run()
    open.value = false
    emit('done')
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
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ description }}</DialogDescription>
      </DialogHeader>
      <Notice v-if="error" tone="error">{{ error }}</Notice>
      <DialogFooter>
        <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
        <Button variant="destructive" :disabled="busy" @click="confirm">{{ action }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
