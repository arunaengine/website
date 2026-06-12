<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Home, Boxes, Search, FileJson2, ListChecks } from 'lucide-vue-next'

const nav = [
  { to: '/app', icon: Home, label: 'Home', exact: true },
  { to: '/app/buckets', icon: Boxes, label: 'Buckets' },
  { to: '/app/search', icon: Search, label: 'Search' },
  { to: '/app/metadata', icon: FileJson2, label: 'Meta' },
  { to: '/app/profiles', icon: ListChecks, label: 'Profiles' },
]
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/90 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur-xl md:hidden"
    aria-label="Portal navigation"
  >
    <div class="grid grid-cols-5 gap-1">
      <RouterLink
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        :exact="item.exact"
        class="flex flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        active-class="bg-primary/10 text-primary"
      >
        <component :is="item.icon" class="h-4 w-4" />
        <span>{{ item.label }}</span>
      </RouterLink>
    </div>
  </nav>
</template>
