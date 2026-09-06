<script setup lang="ts">
// What one cell produced. Each output is shown in its richest form: a page
// through the shared HTML preview, an image inline, everything else as text.
import { computed } from 'vue'
import HtmlPreview from '@/components/preview/HtmlPreview.vue'
import AssistantMarkdown from '@/components/assistant/AssistantMarkdown.vue'
import { plainTraceback, renderOutput } from '@/lib/notebook/outputs'
import type { NotebookOutput } from '@/lib/notebook/nbformat'

const props = defineProps<{ outputs: NotebookOutput[]; name: string }>()

const rendered = computed(() => props.outputs.map((output) => renderOutput(output)))

function svgUrl(text: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(text)}`
}
</script>

<template>
  <div v-if="rendered.length" class="space-y-2 border-t border-border bg-muted/20 px-3 py-2">
    <div v-for="(output, index) in rendered" :key="index">
      <pre
        v-if="output.kind === 'stream'"
        class="scrollbar-thin max-h-80 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed"
        :class="output.name === 'stderr' ? 'text-destructive' : 'text-foreground'"
      >{{ output.text }}</pre>

      <div v-else-if="output.kind === 'error'" class="rounded-md border border-destructive/40 bg-destructive/5 p-2">
        <p class="font-mono text-[11px] font-semibold text-destructive">{{ output.ename }}: {{ output.evalue }}</p>
        <pre
          v-if="output.traceback.length"
          class="scrollbar-thin mt-1 max-h-80 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground"
        >{{ plainTraceback(output.traceback) }}</pre>
      </div>

      <HtmlPreview v-else-if="output.kind === 'html'" :text="output.text" :name="name" />

      <!-- Plots are drawn for a white canvas; a transparent one would vanish in the dark theme. -->
      <img
        v-else-if="output.kind === 'image'"
        :src="output.dataUrl"
        :alt="`Output of ${name}`"
        class="max-w-full rounded-md border border-border bg-white"
      />

      <img
        v-else-if="output.kind === 'svg'"
        :src="svgUrl(output.text)"
        :alt="`Output of ${name}`"
        class="max-w-full rounded-md border border-border bg-white"
      />

      <AssistantMarkdown v-else-if="output.kind === 'markdown'" :text="output.text" size="full" />

      <pre
        v-else
        class="scrollbar-thin max-h-80 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground"
      >{{ output.text }}</pre>
    </div>
  </div>
</template>
