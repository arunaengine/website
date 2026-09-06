<script setup lang="ts">
// The dependency list of the session, as the file the runtime reads. The
// portal stores it beside the notebook and the session installs it at start.
import { computed, ref, watch } from 'vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Button from '@/components/ui/Button.vue'
import { dependencyFileName } from '@/lib/notebook/runtimes'

const props = defineProps<{ open: boolean; kind: 'requirements' | 'deno'; text: string }>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'save', text: string): void
}>()

const draft = ref(props.text)
watch(
  () => props.open,
  (open) => {
    if (open) draft.value = props.text
  },
)

const placeholder = computed(() =>
  props.kind === 'deno' ? '{ "imports": { "chalk": "npm:chalk@5" } }' : 'pandas>=2\nmatplotlib',
)

function save() {
  emit('save', draft.value)
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-w-xl">
      <DialogHeader>
        <DialogTitle>Dependencies</DialogTitle>
        <DialogDescription>
          Stored as {{ dependencyFileName(kind) }} beside the notebook. The session installs it when it starts, so
          changes apply to the next session.
        </DialogDescription>
      </DialogHeader>
      <textarea
        v-model="draft"
        rows="10"
        aria-label="Dependency file"
        class="w-full rounded-md border border-input bg-field p-3 font-mono text-xs text-foreground outline-none focus:border-ring"
        :placeholder="placeholder"
      />
      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">Cancel</Button>
        <Button @click="save">Save</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
