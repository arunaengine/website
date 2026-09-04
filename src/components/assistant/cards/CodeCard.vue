<script setup lang="ts">
// A code, query or config block the assistant asked to show, in the same
// read-only highlighted viewer the object preview uses.
import { defineAsyncComponent } from 'vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import type { CodeView } from '@/lib/assistant/types'
import { Code } from '@lucide/vue'

// The viewer pulls in CodeMirror, so it loads only once a code card is shown.
const TextPreview = defineAsyncComponent(() => import('@/components/preview/TextPreview.vue'))

defineProps<{ view: CodeView }>()
</script>

<template>
  <div class="surface-inline overflow-hidden text-xs">
    <div class="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5">
      <Code class="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span class="min-w-0 flex-1 truncate font-medium text-foreground">{{ view.title }}</span>
      <span class="shrink-0 font-mono text-[10px] text-muted-foreground">{{ view.language }}</span>
      <CopyButton :value="view.code" label="Copy the code" />
    </div>
    <div class="space-y-2 px-3 py-2.5">
      <p v-if="view.caption" class="leading-relaxed text-foreground/85">{{ view.caption }}</p>
      <TextPreview :text="view.code" :language="view.language" />
    </div>
  </div>
</template>
