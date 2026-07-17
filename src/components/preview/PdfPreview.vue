<script setup lang="ts">
// The served CSP (aruna api/src/csp.rs) sets frame-src 'none', so PDFs cannot
// be shown inline — not even from blob: URLs. Until the policy allows blob:
// frames, offer the browser's own viewer in a new tab.
import Button from '@/components/ui/Button.vue'
import { ExternalLink, FileText } from '@lucide/vue'

const props = defineProps<{ url: string; name?: string }>()

function openTab() {
  window.open(props.url, '_blank', 'noopener')
}
</script>

<template>
  <div class="surface flex flex-col items-center gap-3 px-5 py-14 text-center">
    <FileText class="h-8 w-8 text-muted-foreground/70" />
    <p class="text-sm font-medium text-foreground">{{ name || 'PDF document' }}</p>
    <p class="max-w-md text-xs text-muted-foreground">
      This portal cannot embed PDFs (the security policy forbids frames). The document opens in your browser's PDF viewer instead.
    </p>
    <Button size="sm" @click="openTab"><ExternalLink class="h-4 w-4" /> Open PDF in new tab</Button>
  </div>
</template>
