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
import Select from '@/components/ui/Select.vue'
import type { NotebookDependencies } from '@/lib/notebook/nbformat'
import Button from '@/components/ui/Button.vue'
import { dependencyFileName } from '@/lib/notebook/runtimes'

const props = defineProps<{ open: boolean; kind: NotebookDependencies['kind']; text: string; running?: boolean }>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'save', dependencies: NotebookDependencies, restart: boolean): void
}>()

const selectedKind = ref(props.kind)
const drafts = ref<Partial<Record<NotebookDependencies['kind'], string>>>({ [props.kind]: props.text })
const draft = computed({ get: () => drafts.value[selectedKind.value] ?? '', set: (text) => { drafts.value[selectedKind.value] = text } })
const managers = [{ value: 'requirements', label: 'Python packages (pip)' }, { value: 'conda', label: 'Conda environment' }]
watch(
  () => props.open,
  (open) => {
    if (open) {
      selectedKind.value = props.kind
      drafts.value = { [props.kind]: props.text }
    }
  },
)

const placeholder = computed(() =>
  selectedKind.value === 'deno' ? '{ "imports": { "chalk": "npm:chalk@5" } }'
    : selectedKind.value === 'conda' ? 'channels:\n  - conda-forge\ndependencies:\n  - python=3.12\n  - pandas\n  - matplotlib'
    : 'pandas>=2\nmatplotlib',
)

function save(restart = false) {
  emit('save', { kind: selectedKind.value, text: draft.value }, restart)
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-w-xl">
      <DialogHeader>
        <DialogTitle>Dependencies</DialogTitle>
        <DialogDescription>
          {{ selectedKind === 'deno' ? 'Declare npm imports in deno.json.' : selectedKind === 'conda' ? 'Define one environment shared by the Python kernel and Bash cells.' : 'Enter one Python package per line, with optional version constraints.' }}
          Packages install when the kernel starts. Restart a running kernel to apply changes.
        </DialogDescription>
      </DialogHeader>
      <Select v-if="kind !== 'deno'" v-model="selectedKind" :options="managers" aria-label="Package manager" />
      <p class="text-xs text-muted-foreground">{{ dependencyFileName(selectedKind) }} is saved beside this notebook.</p>
      <textarea
        v-model="draft"
        rows="10"
        aria-label="Dependency file"
        class="w-full rounded-md border border-input bg-field p-3 font-mono text-xs text-foreground outline-none focus:border-ring"
        :placeholder="placeholder"
      />
      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">Cancel</Button>
        <Button :variant="running ? 'outline' : 'default'" @click="save()">Save dependencies</Button>
        <Button v-if="running" @click="save(true)">Save and restart kernel</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
