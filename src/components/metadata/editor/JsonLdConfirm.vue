<script setup lang="ts">
// Asked before edited JSON-LD would be left behind, centered like the discard confirm.
import { FocusScope, useBodyScrollLock } from 'radix-vue'
import { watch } from 'vue'
import Button from '@/components/ui/Button.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'answer', choice: 'apply' | 'discard' | 'cancel'): void }>()

const bodyLocked = useBodyScrollLock()
watch(() => props.open, (open) => { bodyLocked.value = open })
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      data-portal-list
      class="pointer-events-auto fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      @click.self="emit('answer', 'cancel')"
      @keydown.esc="emit('answer', 'cancel')"
    >
      <FocusScope as-child trapped loop>
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="jsonld-apply-title"
          class="w-full max-w-xs rounded-lg border border-border bg-popover p-4 text-center shadow-xl"
        >
          <h2 id="jsonld-apply-title" class="text-sm font-semibold text-foreground">Apply your JSON-LD changes?</h2>
          <p class="mt-1 text-xs text-muted-foreground">They are not in the editor yet.</p>
          <div class="mt-4 flex justify-center gap-2">
            <Button variant="outline" size="sm" @click="emit('answer', 'cancel')">Cancel</Button>
            <Button variant="outline" size="sm" @click="emit('answer', 'discard')">Discard</Button>
            <Button size="sm" @click="emit('answer', 'apply')">Apply</Button>
          </div>
        </div>
      </FocusScope>
    </div>
  </Teleport>
</template>
