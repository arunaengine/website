<script setup lang="ts">
// Reusable titled code block with a copy button (aruna#277). Layout mirrors the
// CLI-usage block in CreateCredentialDialog. Purely presentational: the
// device-enrollment flow (aruna#271) reuses it for its agent-config snippet, so
// keep it free of onboarding-specific copy and API calls.
import CopyButton from '@/components/nodes/CopyButton.vue'

defineProps<{ title: string; code: string; hint?: string }>()
</script>

<template>
  <div class="relative rounded-md border border-border bg-muted/40 px-3 py-2">
    <div class="text-[10px] uppercase tracking-wider text-muted-foreground">{{ title }}</div>
    <pre class="mt-1 overflow-x-auto whitespace-pre font-mono text-[11px] leading-5 text-foreground/90">{{ code }}</pre>
    <p v-if="hint" class="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{{ hint }}</p>
    <div class="absolute right-2 top-2"><CopyButton :value="code" :label="`Copy ${title}`" /></div>
  </div>
</template>
