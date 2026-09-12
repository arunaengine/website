<script setup lang="ts">
// A tiny confirm shown centered in the viewport when the user tries to leave
// unsaved draft content. It is teleported to the body: a dialog is transformed
// and would pin a fixed overlay to itself instead of to the viewport.
import { FocusScope, useBodyScrollLock } from 'radix-vue'
import { ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'keep'): void
  (e: 'discard'): void
}>()

// The page and the dialog behind the confirm must both hold still. The body
// lock is the one radix uses for the dialog itself; the dialog scroll area is
// found from where this component sits.
const anchor = ref<HTMLElement | null>(null)
const bodyLocked = useBodyScrollLock()
let scrollArea: HTMLElement | null = null

watch(
  () => props.open,
  (open) => {
    bodyLocked.value = open
    if (open) {
      scrollArea = anchor.value?.closest<HTMLElement>('[role="dialog"]') ?? null
      scrollArea?.style.setProperty('overflow', 'hidden')
    } else {
      scrollArea?.style.removeProperty('overflow')
      scrollArea = null
    }
  },
)
</script>

<template>
  <span ref="anchor" hidden />
  <Teleport to="body">
    <!-- data-portal-list: a dialog underneath must not read a click in here as
         a click outside itself. -->
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        data-portal-list
        class="pointer-events-auto fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
        @click.self="emit('keep')"
      >
        <FocusScope as-child trapped loop>
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
        </FocusScope>
      </div>
    </Transition>
  </Teleport>
</template>
