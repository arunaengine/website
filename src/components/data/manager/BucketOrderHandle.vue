<script setup lang="ts">
// The always visible handle that moves a bucket row: drag it, or press the up and down arrows.
import { GripVertical } from '@lucide/vue'

defineProps<{ bucket: string; rowKey: string }>()
const emit = defineEmits<{ (e: 'move', step: -1 | 1): void }>()

function onKeydown(event: KeyboardEvent) {
  const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
  if (!step) return
  event.preventDefault()
  event.stopPropagation()
  emit('move', step)
}
</script>

<template>
  <button
    type="button"
    draggable="true"
    class="cursor-grab rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
    :aria-label="`Move ${bucket}`"
    title="Drag to reorder, or press the up and down arrow keys"
    aria-keyshortcuts="ArrowUp ArrowDown"
    :data-order-handle="rowKey"
    @pointerdown.stop
    @keydown="onKeydown"
  >
    <GripVertical class="h-3.5 w-3.5" aria-hidden="true" />
  </button>
</template>
