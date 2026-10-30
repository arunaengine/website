<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import IconTile from '@/components/ui/IconTile.vue'
import { RouterLink, useRoute } from 'vue-router'
import { FileJson2, LayoutDashboard, SearchX } from '@lucide/vue'

const route = useRoute()
</script>

<template>
  <div class="w-full px-4 sm:px-6 flex min-h-[60vh] items-center justify-center py-16">
    <div class="surface w-full max-w-lg p-8 text-center">
      <IconTile :icon="SearchX" tone="muted" class="mx-auto" />
      <h1 class="type-page-title mt-4">Page not found</h1>
      <p class="mt-2 text-sm text-muted-foreground">No page in the portal has this address.</p>
      <p class="mx-auto mt-4 max-w-full truncate rounded-md bg-muted/40 px-3 py-2 font-mono text-xs text-foreground/80">
        {{ route.fullPath }}
      </p>
      <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button variant="outline" as-child>
          <RouterLink :to="{ name: 'dashboard' }"><LayoutDashboard class="h-4 w-4" /> Dashboard</RouterLink>
        </Button>
        <Button variant="outline" as-child>
          <RouterLink :to="{ name: 'datasets' }"><FileJson2 class="h-4 w-4" /> Datasets</RouterLink>
        </Button>
      </div>
    </div>
  </div>
</template>
