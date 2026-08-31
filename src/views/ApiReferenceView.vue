<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import { ChevronLeft } from '@lucide/vue'
import { ApiReference, type ApiReferenceConfiguration } from '@scalar/api-reference'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { apiBaseUrl } from '@/composables/aruna/state'
import { useTheme } from '@/composables/useTheme'
import { apiSpecUrl } from '@/docs/apiSpec'

// Remap Scalar's theme variables onto the portal tokens. The header height
// keeps Scalar's mobile header below the portal top bar; the desktop scroll
// region zeroes it (below) so the pinned sidebar starts at the region's top.
const brandCss = `
html .light-mode, html .dark-mode {
  --scalar-font: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --scalar-font-code: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --scalar-color-1: hsl(var(--foreground));
  --scalar-color-2: hsl(var(--muted-foreground));
  --scalar-color-3: hsl(var(--muted-foreground));
  --scalar-color-accent: hsl(var(--primary));
  --scalar-background-1: hsl(var(--background));
  --scalar-background-2: hsl(var(--card));
  --scalar-background-3: hsl(var(--muted));
  --scalar-background-accent: hsl(var(--primary) / 0.12);
  --scalar-border-color: hsl(var(--border));
  --scalar-radius: 6px;
  --scalar-radius-lg: 8px;
  --scalar-custom-header-height: 3.5rem;
}
`

const { resolved } = useTheme()
const specUrl = computed(() => apiSpecUrl(apiBaseUrl.value))

// Bundled, no CDN and no JS eval, so it holds under the portal CSP. A pure
// reference: the try-it client, schema models, Scalar's own AI agent and its
// toolbar are off, so search returns operations and the portal assistant chats.
const configuration = computed<Partial<ApiReferenceConfiguration>>(() => ({
  url: specUrl.value,
  forceDarkModeState: resolved.value,
  hideDarkModeToggle: true,
  hideClientButton: true,
  hideTestRequestButton: true,
  hideModels: true,
  showToolbar: 'never',
  agent: { disabled: true },
  mcp: { disabled: true },
  withDefaultFonts: false,
  customCss: brandCss,
}))
</script>

<template>
  <!-- At Scalar's desktop width the reference fills the area below the top bar
       and owns its own scroll so its sidebar stays pinned. The header bar is a
       fixed height so the scroll region's size is exact. Narrower, it flows. -->
  <div class="min-[1000px]:flex min-[1000px]:h-[calc(100dvh-3.5rem)] min-[1000px]:flex-col">
    <div class="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 sm:px-6">
      <h1 class="font-display text-base font-semibold text-aruna-navy">API reference</h1>
      <Badge variant="outline">REST</Badge>
      <span class="hidden truncate text-xs text-muted-foreground md:inline">
        Every REST endpoint of this node, live from its OpenAPI document.
      </span>
      <Button variant="outline" size="sm" class="ml-auto shrink-0" as-child>
        <RouterLink :to="{ name: 'docs' }"><ChevronLeft class="h-4 w-4" /> Portal docs</RouterLink>
      </Button>
    </div>

    <!-- Theme is forced from the portal theme; remount applies a toggle. -->
    <div class="api-reference-embed min-[1000px]:min-h-0 min-[1000px]:flex-1">
      <ApiReference :key="resolved" :configuration="configuration" />
    </div>
  </div>
</template>

<style>
@import '@scalar/api-reference/style.css';
@import '@scalar/api-reference/vue-styles.css';

/* At Scalar's desktop width (1000px, its own breakpoint) the reference is its
   own scroll container (top bar 3.5rem + the header bar 3.5rem = 7rem above
   it), which is what makes the grid-area sidebar's sticky positioning engage;
   the portal main only ever scrolls the page. */
@media (min-width: 1000px) {
  .api-reference-embed .scalar-app.scalar-api-reference {
    /* Override Scalar's own 100dvh height AND min-height so only this region
       scrolls, not the page around it; otherwise it overflows the layout and
       stacks a second scrollbar on the page. */
    height: calc(100dvh - 7rem) !important;
    min-height: 0 !important;
    overflow-y: auto;
    overflow-x: hidden;
    /* The region owns the scroll, so the sidebar pins to its top, not the bar. */
    --scalar-custom-header-height: 0px;
  }
  /* An explicit height and align-start keep the sidebar from stretching to the
     content, so it sizes to the scroll region and its sticky offset engages. */
  .api-reference-embed .t-doc__sidebar {
    height: calc(100dvh - 7rem) !important;
    min-height: 0 !important;
    top: 0 !important;
    align-self: start !important;
  }
}
</style>
