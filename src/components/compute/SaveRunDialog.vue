<script setup lang="ts">
// "Save as my run": keeps a run request on this computer. The person picks what is asked again at
// each start; image, command and resources stay as they are.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Input from '@/components/ui/Input.vue'
import { useSavedRuns } from '@/composables/useSavedRuns'
import { savedTask } from '@/lib/savedRuns'
import type { TesTask } from '@/lib/tes'

const props = defineProps<{ open: boolean; task: TesTask | null; blocked?: string | null }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; saved: [] }>()

const saved = useSavedRuns()
const name = ref('')
const asked = ref<string[]>([])
const results = ref(false)

const inputs = computed(() => (props.task?.inputs ?? []).filter((input) => input.url))
const hasOutputs = computed(() => Boolean(props.task?.outputs?.length))

watch(() => props.open, (open) => {
  if (!open) return
  name.value = props.task?.name ?? ''
  asked.value = []
  results.value = false
}, { immediate: true })

function toggle(path: string) {
  asked.value = asked.value.includes(path) ? asked.value.filter((item) => item !== path) : [...asked.value, path]
}

function save() {
  if (!props.task || !name.value.trim()) return
  const kept = saved.save({
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    name: name.value.trim(),
    savedAt: new Date().toISOString(),
    task: savedTask(props.task),
    ask: { inputs: asked.value, results: results.value },
  })
  if (!kept) return
  emit('saved')
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>Save as my run</DialogTitle>
        <DialogDescription>
          Image, command and resources are kept as they are now. Saved only on this computer. You can export it as a file to share it.
        </DialogDescription>
      </DialogHeader>
      <p v-if="blocked" class="text-sm text-muted-foreground">{{ blocked }}</p>
      <template v-else>
        <div>
          <label for="saved-run-name" class="text-xs font-medium text-foreground">Name</label>
          <Input id="saved-run-name" v-model="name" class="mt-1" />
        </div>
        <fieldset v-if="inputs.length || hasOutputs" class="space-y-1.5">
          <legend class="mb-1 text-xs font-medium text-foreground">Ask me each time for</legend>
          <label v-for="input in inputs" :key="input.path" class="flex items-center gap-2 text-sm">
            <input type="checkbox" :checked="asked.includes(input.path)" @change="toggle(input.path)" />
            <span>{{ input.name || input.path }} <span class="font-mono text-xs text-muted-foreground">({{ input.path }})</span></span>
          </label>
          <label v-if="hasOutputs" class="flex items-center gap-2 text-sm">
            <input v-model="results" type="checkbox" />
            <span>Results folder</span>
          </label>
        </fieldset>
      </template>
      <p v-if="saved.failure.value" class="text-sm text-destructive">{{ saved.failure.value }}</p>
      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">Cancel</Button>
        <Button :disabled="Boolean(blocked) || !task || !name.trim()" @click="save">Save</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
