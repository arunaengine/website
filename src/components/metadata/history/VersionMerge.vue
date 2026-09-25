<script setup lang="ts">
// Confirms a merge. A merge into main rewrites the live metadata; a 409 lists
// what both sides changed differently, and nothing is merged then.
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
import { ApiError, type MergeConflictBody } from '@/lib/api'
import { valueText, writeMessage } from '@/lib/versions'

const props = defineProps<{
  source: string
  target: string
  /** Offers an optional merge message. */
  withMessage?: boolean
  run: (message: string | undefined) => Promise<unknown>
}>()
const emit = defineEmits<{ (e: 'merged'): void; (e: 'stale'): void }>()
const open = defineModel<boolean>('open', { required: true })

const message = ref('')
const busy = ref(false)
const error = ref('')
const conflict = ref<MergeConflictBody | null>(null)

watch(open, (isOpen) => {
  if (!isOpen) return
  message.value = ''
  error.value = ''
  conflict.value = null
})

const live = computed(() => props.target === 'main')

function conflictOf(err: unknown): MergeConflictBody | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null
  const body = err.details as Partial<MergeConflictBody> | undefined
  if (!Array.isArray(body?.files) && !Array.isArray(body?.properties)) return null
  return { files: body?.files ?? [], properties: body?.properties ?? [] }
}

async function submit() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  conflict.value = null
  try {
    await props.run(message.value.trim() || undefined)
    open.value = false
    emit('merged')
  } catch (err) {
    conflict.value = conflictOf(err)
    if (!conflict.value) error.value = writeMessage(err, props.target)
    if (err instanceof ApiError && err.status === 412) emit('stale')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent :class="conflict ? 'max-w-3xl' : 'max-w-md'">
      <DialogHeader>
        <DialogTitle>Merge <span class="font-mono">{{ source }}</span> into {{ target }}</DialogTitle>
        <DialogDescription v-if="conflict">
          Nothing was merged. These were changed both in {{ source }} and on {{ target }}.
        </DialogDescription>
        <DialogDescription v-else-if="live">
          The merged metadata becomes the live metadata of this dataset.
        </DialogDescription>
      </DialogHeader>

      <template v-if="conflict">
        <div v-if="conflict.properties.length" class="overflow-x-auto rounded-md border border-border">
          <table class="w-full text-sm">
            <thead class="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th class="px-3 py-2 text-left font-semibold">Entity</th>
                <th class="px-3 py-2 text-left font-semibold">Property</th>
                <th class="px-3 py-2 text-left font-semibold">{{ source }}</th>
                <th class="px-3 py-2 text-left font-semibold">{{ target }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in conflict.properties" :key="`${entry.entity} ${entry.property}`" class="border-t border-border align-top">
                <td class="px-3 py-2 font-mono text-xs">{{ entry.entity }}</td>
                <td class="px-3 py-2 font-mono text-xs">{{ entry.property }}</td>
                <td class="px-3 py-2 text-xs">{{ entry.source.length ? entry.source.map(valueText).join(', ') : 'no value' }}</td>
                <td class="px-3 py-2 text-xs">{{ entry.target.length ? entry.target.map(valueText).join(', ') : 'no value' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="conflict.files.length">
          <p class="text-xs font-medium text-muted-foreground">Files changed on both sides</p>
          <ul class="mt-1 space-y-1 font-mono text-xs">
            <li v-for="path in conflict.files" :key="path">{{ path }}</li>
          </ul>
        </div>
      </template>

      <label v-else-if="withMessage" class="grid gap-1.5 text-sm">
        <span class="font-medium text-foreground">Message (optional)</span>
        <Input v-model="message" :placeholder="`Merge ${source} into ${target}`" />
      </label>

      <Notice v-if="error" tone="error">{{ error }}</Notice>

      <DialogFooter>
        <DialogClose as-child><Button variant="outline">{{ conflict ? 'Close' : 'Cancel' }}</Button></DialogClose>
        <Button v-if="!conflict" :disabled="busy" @click="submit">{{ busy ? 'Merging…' : 'Merge' }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
