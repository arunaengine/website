<script setup lang="ts">
// The RO-Crate derived from one version, read only.
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
import Spinner from '@/components/ui/Spinner.vue'
import type { DatasetHistoryState } from '@/composables/useDatasetHistory'
import { versionCrate } from '@/lib/api'
import { shortVersion } from '@/lib/versions'
import { errorMessage } from '@/lib/utils'

const props = defineProps<{ history: DatasetHistoryState; version: string }>()
const open = defineModel<boolean>('open', { required: true })

const text = ref('')
const error = ref('')
let token = 0

watch(open, async (isOpen) => {
  if (!isOpen) return
  const current = ++token
  text.value = ''
  error.value = ''
  try {
    const answer = await versionCrate(props.history.documentId.value, props.version, props.history.client())
    if (current === token) text.value = JSON.stringify(answer.rocrate, null, 2)
  } catch (err) {
    if (current === token) error.value = errorMessage(err)
  }
}, { immediate: true })
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-3xl">
      <DialogHeader>
        <DialogTitle>RO-Crate of <span class="font-mono">{{ shortVersion(version) }}</span></DialogTitle>
        <DialogDescription>The metadata as it was in this version.</DialogDescription>
      </DialogHeader>
      <Notice v-if="error" tone="error">{{ error }}</Notice>
      <pre v-else-if="text" class="max-h-[60vh] overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs">{{ text }}</pre>
      <Spinner v-else label="Loading the RO-Crate" show-label />
      <DialogFooter>
        <DialogClose as-child><Button variant="outline">Close</Button></DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
