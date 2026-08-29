<script setup lang="ts">
// The one picker surface: a centred dialog with a search box on top and the
// results scrolling inside it, so no list ever runs off the page.
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import CommandPane from '@/components/ui/CommandPane.vue'

defineProps<{
  open: boolean
  title: string
  description?: string
  modelValue: string
  placeholder?: string
  ariaLabel?: string
  busy?: boolean
}>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'update:modelValue', value: string): void
}>()
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-w-lg gap-0 overflow-hidden p-0">
      <div class="border-b border-border px-4 py-3 pr-10">
        <DialogTitle class="text-sm">{{ title }}</DialogTitle>
        <DialogDescription v-if="description" class="mt-0.5 text-xs">{{ description }}</DialogDescription>
      </div>
      <CommandPane
        :model-value="modelValue"
        :placeholder="placeholder"
        :aria-label="ariaLabel"
        :busy="busy"
        @update:model-value="(value) => emit('update:modelValue', value)"
      >
        <slot />
        <template v-if="$slots.footer" #footer><slot name="footer" /></template>
      </CommandPane>
    </DialogContent>
  </Dialog>
</template>
