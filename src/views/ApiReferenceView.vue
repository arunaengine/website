<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import { ChevronLeft } from '@lucide/vue'
import { ApiReference, type ApiReferenceConfiguration } from '@scalar/api-reference'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { apiBaseUrl } from '@/composables/aruna/state'
import { useTheme } from '@/composables/useTheme'
import { apiSpecUrl } from '@/docs/apiSpec'

// Remap Scalar's theme variables onto the portal tokens; the portal's own
// CSS variables resolve here because the reference renders in-document.
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

// Bundled, no CDN and no JS eval, so it holds under the portal CSP.
// Reference-only: the try-it client stays hidden; portal fonts are reused.
const configuration = computed<Partial<ApiReferenceConfiguration>>(() => ({
  url: specUrl.value,
  forceDarkModeState: resolved.value,
  hideDarkModeToggle: true,
  hideClientButton: true,
  hideTestRequestButton: true,
  withDefaultFonts: false,
  customCss: brandCss,
}))
</script>

<template>
  <div>
    <PageHeader
      title="API reference"
      description="Every REST endpoint of this node, rendered live from its OpenAPI document."
    >
      <template #breadcrumbs>
        <span>·</span>
        <Badge variant="outline">REST</Badge>
      </template>
      <template #actions>
        <Button variant="outline" as-child>
          <RouterLink :to="{ name: 'docs' }"><ChevronLeft class="h-4 w-4" /> Portal docs</RouterLink>
        </Button>
      </template>
    </PageHeader>

    <!-- Theme is forced from the portal theme; remount applies a toggle. -->
    <ApiReference :key="resolved" :configuration="configuration" />
  </div>
</template>

<style>
@import '@scalar/api-reference/style.css';
@import '@scalar/api-reference/vue-styles.css';
</style>
