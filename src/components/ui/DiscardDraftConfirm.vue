<script setup lang="ts">
// A tiny confirm shown centered over a creation dialog when the user tries to
// close it with unsaved draft content. Rendered as an absolutely positioned
// overlay inside a positioned DialogContent, so it stays within the dialog's
// focus trap and centers over the dialog in both themes via design tokens.
import Button from '@/components/ui/Button.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'keep'): void
  (e: 'discard'): void
}>()
</script>

<template>
  <Transition
    enter-active-class="transition-opacity duration-150"
    enter-from-class="opacity-0"
    leave-active-class="transition-opacity duration-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="open"
      class="absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-background/70 p-4 backdrop-blur-sm"
      @click.self="emit('keep')"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="discard-draft-title"
        class="w-full max-w-xs rounded-lg border border-border bg-popover p-4 text-center shadow-xl"
      >
        <h2 id="discard-draft-title" class="text-sm font-semibold text-foreground">Discard this draft?</h2>
        <p class="mt-1 text-xs text-muted-foreground">Your changes will be lost and cannot be recovered.</p>
        <div class="mt-4 flex justify-center gap-2">
          <Button variant="outline" size="sm" @click="emit('keep')">Keep editing</Button>
          <Button variant="destructive" size="sm" @click="emit('discard')">Discard</Button>
        </div>
      </div>
    </div>
  </Transition>
</template>
