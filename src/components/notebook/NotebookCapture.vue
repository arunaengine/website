<script setup lang="ts">
import { ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import Notice from '@/components/ui/Notice.vue'
import { injectNotebook } from '@/composables/notebookContext'
import { errorMessage } from '@/lib/utils'
import { Camera } from '@lucide/vue'

const { notebook } = injectNotebook()
const open = ref(false)
const busy = ref(false)
const error = ref('')
const captured = ref('')
watch(notebook.generation, () => { open.value = false; error.value = ''; captured.value = ''; busy.value = false })
async function capture() {
  if (busy.value) return
  const generation = notebook.generation.value
  busy.value = true
  error.value = ''
  captured.value = ''
  try {
    const id = await notebook.capture()
    if (generation === notebook.generation.value) captured.value = id
  } catch (cause) {
    if (generation === notebook.generation.value) error.value = errorMessage(cause)
  } finally {
    if (generation === notebook.generation.value) busy.value = false
  }
}
</script>

<template>
  <IconButton label="Capture as run-crate" :disabled="notebook.loading.value || !notebook.notebook.value" @click="open = true"><Camera class="size-3.5" /></IconButton>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle>Capture as run-crate</DialogTitle>
        <DialogDescription>Save a private dataset with an exact snapshot of this notebook, including embedded images and cell outputs. The kernel keeps running.</DialogDescription>
      </DialogHeader>
      <Notice v-if="error" tone="error">{{ error }}</Notice>
      <p v-if="captured" class="text-sm">Snapshot captured. <RouterLink class="text-primary hover:underline" :to="{ name: 'dataset', params: { id: captured } }">Open run-crate</RouterLink></p>
      <Button :disabled="busy" @click="capture">{{ busy ? 'Capturing…' : captured ? 'Capture another snapshot' : 'Capture snapshot' }}</Button>
    </DialogContent>
  </Dialog>
</template>
