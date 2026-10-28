<script setup lang="ts">
// Manage my runs: remove a saved run, export all as a file, or import a file from someone else.
import { ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Notice from '@/components/ui/Notice.vue'
import { useSavedRuns } from '@/composables/useSavedRuns'
import { askedFor } from '@/lib/savedRuns'
import { errorMessage } from '@/lib/utils'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const saved = useSavedRuns()
const picker = ref<HTMLInputElement | null>(null)
const failure = ref<string | null>(null)

async function chosen(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  failure.value = null
  try {
    await saved.importFile(file)
  } catch (cause) {
    failure.value = errorMessage(cause)
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle>My runs</DialogTitle>
        <DialogDescription>Saved only on this computer. Export them as a file to use them elsewhere.</DialogDescription>
      </DialogHeader>
      <ul v-if="saved.runs.value.length" class="divide-y divide-border rounded-md border border-border">
        <li v-for="run in saved.runs.value" :key="run.id" class="flex items-center gap-3 px-3 py-2 text-sm">
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium text-foreground">{{ run.name }}</span>
            <span v-if="askedFor(run).length" class="block text-xs text-muted-foreground">Asks for: {{ askedFor(run).join(', ') }}</span>
          </span>
          <Button size="sm" variant="ghost" class="text-destructive hover:text-destructive" @click="saved.remove(run.id)">Remove</Button>
        </li>
      </ul>
      <p v-else class="text-sm text-muted-foreground">No saved runs yet. Use "Save as my run" on a run.</p>
      <Notice v-if="failure || saved.failure.value" tone="error">{{ failure || saved.failure.value }}</Notice>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" :disabled="!saved.runs.value.length" @click="saved.exportFile()">Export as file</Button>
        <Button variant="outline" size="sm" @click="picker?.click()">Import a file</Button>
        <input ref="picker" type="file" accept="application/json,.json" class="hidden" @change="chosen" />
      </div>
    </DialogContent>
  </Dialog>
</template>
