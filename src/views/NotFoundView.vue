<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import { RouterLink, useRoute } from 'vue-router'
import { Compass, LayoutDashboard } from '@lucide/vue'

const route = useRoute()
</script>

<template>
  <div class="container flex min-h-[60vh] items-center justify-center py-16">
    <div class="surface w-full max-w-lg p-8 text-center">
      <p class="font-display text-3xl font-bold tracking-tight text-aruna-navy">404: page not found</p>
      <p class="mt-3 text-sm text-muted-foreground">
        This URL does not match any page in the portal.
      </p>
      <p class="mx-auto mt-4 max-w-full truncate rounded-md bg-muted/40 px-3 py-2 font-mono text-xs text-foreground/80">
        {{ route.fullPath }}
      </p>
      <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
        <RouterLink :to="{ name: 'dashboard' }">
          <Button variant="outline"><LayoutDashboard class="h-4 w-4" /> Dashboard</Button>
        </RouterLink>
        <RouterLink :to="{ name: 'search' }">
          <Button><Compass class="h-4 w-4" /> Discover</Button>
        </RouterLink>
      </div>
    </div>
  </div>
</template>
