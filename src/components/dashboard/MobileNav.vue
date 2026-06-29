<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { Home, Boxes, Compass, Users, Settings } from '@lucide/vue'

const route = useRoute()

const nav = [
  { to: '/app', icon: Home, label: 'Home', exact: true },
  { to: '/app/buckets', icon: Boxes, label: 'Data' },
  { to: '/app/search', icon: Compass, label: 'Discover', also: ['/app/metadata'] },
  { to: '/app/groups', icon: Users, label: 'Groups' },
  { to: '/app/settings', icon: Settings, label: 'Settings' },
]

function isActive(item: (typeof nav)[number]): boolean {
  if (item.exact) return route.path === item.to
  const prefixes = [item.to, ...(item.also ?? [])]
  return prefixes.some((prefix) => route.path === prefix || route.path.startsWith(`${prefix}/`))
}
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
        class="flex flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-medium transition-colors hover:bg-muted hover:text-foreground"
        :class="isActive(item) ? 'bg-primary/10 text-primary' : 'text-muted-foreground'"
      >
        <component :is="item.icon" class="h-4 w-4" />
        <span>{{ item.label }}</span>
      </RouterLink>
    </div>
  </nav>
</template>
