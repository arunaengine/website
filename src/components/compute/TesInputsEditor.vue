<script setup lang="ts">
import { ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Badge from '@/components/ui/Badge.vue'
import TesDataRefDialog from '@/components/compute/TesDataRefDialog.vue'
import type { TesInput } from '@/lib/tes'
import { truncateMiddle } from '@/lib/utils'
import { ListPlus, X } from '@lucide/vue'

// Input row editor (aruna#290): never mutates the prop — every change emits a
// fresh array. New rows come from the TesDataRefDialog picker; the container
// path stays editable inline.
const props = defineProps<{ modelValue: TesInput[]; disabled?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: TesInput[]): void }>()

const dialogOpen = ref(false)

function addEntry(entry: { url: string; path: string; name?: string }) {
  const input: TesInput = { path: entry.path, url: entry.url, type: 'FILE' }
  if (entry.name) input.name = entry.name
  emit('update:modelValue', [...props.modelValue, input])
}
function patchPath(i: number, path: string) {
  emit('update:modelValue', props.modelValue.map((inp, idx) => (idx === i ? { ...inp, path } : inp)))
}
function remove(i: number) {
  emit('update:modelValue', props.modelValue.filter((_, idx) => idx !== i))
}
</script>

<template>
  <div class="space-y-3">
    <p v-if="!modelValue.length" class="text-sm text-muted-foreground">
      No inputs — the task starts with an empty working directory.
    </p>
    <div v-else class="space-y-2">
      <div v-for="(input, i) in modelValue" :key="i" class="surface-inline flex flex-wrap items-center gap-3 p-3">
        <div class="min-w-0 flex-1">
          <div class="truncate font-mono text-[11px] text-foreground" :title="input.url">{{ truncateMiddle(input.url || '', 20, 16) }}</div>
        </div>
        <Badge variant="outline">FILE</Badge>
        <div class="w-full sm:w-64">
          <Input :model-value="input.path" class="font-mono" :disabled="disabled" aria-label="Container path" @update:model-value="patchPath(i, String($event))" />
        </div>
        <Button variant="ghost" size="icon-sm" :disabled="disabled" aria-label="Remove input" @click="remove(i)"><X class="h-4 w-4" /></Button>
      </div>
    </div>

    <Button variant="outline" size="sm" :disabled="disabled" @click="dialogOpen = true"><ListPlus class="size-3.5" /> Add input</Button>

    <TesDataRefDialog v-model:open="dialogOpen" mode="input" @add="addEntry" />
  </div>
</template>
