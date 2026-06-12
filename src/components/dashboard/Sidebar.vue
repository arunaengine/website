<script setup lang="ts">
import AppLogo from '@/components/layout/AppLogo.vue'
import { RouterLink } from 'vue-router'
import { ref, watch } from 'vue'
import {
  Home,
  Boxes,
  Search,
  FileJson2,
  ListChecks,
  Settings,
  LifeBuoy,
  ArrowLeft,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-vue-next'

const nav = [
  { to: '/app', icon: Home, label: 'Home', exact: true },
  { to: '/app/buckets', icon: Boxes, label: 'Buckets' },
  { to: '/app/search', icon: Search, label: 'Search' },
  { to: '/app/metadata', icon: FileJson2, label: 'Metadata' },
  { to: '/app/profiles', icon: ListChecks, label: 'Profiles' },
  { to: '/app/settings', icon: Settings, label: 'Settings' },
]

const COLLAPSE_KEY = 'aruna.sidebarCollapsed'
const collapsed = ref(
  typeof window !== 'undefined' &&
    window.localStorage.getItem(COLLAPSE_KEY) === '1',
)
watch(collapsed, (value) =>
  window.localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0'),
)
</script>

<template>
  <aside
    :class="[
      'hidden shrink-0 flex-col overflow-hidden border-r border-border bg-card transition-[width] duration-200 md:flex',
      collapsed ? 'w-16' : 'w-56',
    ]"
  >
    <div
      :class="[
        'flex h-14 shrink-0 items-center border-b border-border/60',
        collapsed ? 'justify-center px-0' : 'pl-[22px] pr-4',
      ]"
    >
      <RouterLink to="/" class="flex items-center hover:opacity-90" title="Aruna">
        <AppLogo :variant="collapsed ? 'icon' : 'lockup'" :size="collapsed ? 26 : 22" />
      </RouterLink>
    </div>

    <nav class="flex-1 px-2.5 py-3">
      <ul class="space-y-0.5">
        <li v-for="item in nav" :key="item.to">
          <RouterLink
            :to="item.to"
            :title="collapsed ? item.label : undefined"
            :class="[
              'flex items-center gap-2.5 rounded-md py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground',
              collapsed ? 'justify-center px-0' : 'px-2.5',
            ]"
            active-class="bg-primary/[0.14] !text-foreground hover:bg-primary/[0.18]"
            :exact="item.exact"
          >
            <component :is="item.icon" class="h-4 w-4 shrink-0" />
            <span v-if="!collapsed">{{ item.label }}</span>
          </RouterLink>
        </li>
      </ul>
    </nav>

    <div class="border-t border-border/60 px-2.5 py-3 text-xs">
      <button
        type="button"
        :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        :class="[
          'flex w-full items-center gap-2.5 rounded-md py-2 text-[12px] font-medium text-muted-foreground/80 transition-colors hover:bg-foreground/[0.04] hover:text-foreground',
          collapsed ? 'justify-center px-0' : 'px-2.5',
        ]"
        @click="collapsed = !collapsed"
      >
        <ChevronsRight v-if="collapsed" class="h-4 w-4 shrink-0" />
        <ChevronsLeft v-else class="h-4 w-4 shrink-0" />
        <span v-if="!collapsed">Collapse</span>
      </button>
      <a
        :title="collapsed ? 'Help' : undefined"
        :class="[
          'flex items-center gap-2.5 rounded-md py-2 text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground',
          collapsed ? 'justify-center px-0' : 'px-2.5',
        ]"
        href="#"
      >
        <LifeBuoy class="h-4 w-4 shrink-0" />
        <span v-if="!collapsed">Help</span>
      </a>
      <RouterLink
        to="/"
        :title="collapsed ? 'Back to landing' : undefined"
        :class="[
          'flex items-center gap-2.5 rounded-md py-2 text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground',
          collapsed ? 'justify-center px-0' : 'px-2.5',
        ]"
      >
        <ArrowLeft class="h-4 w-4 shrink-0" />
        <span v-if="!collapsed">Back to landing</span>
      </RouterLink>
    </div>
  </aside>
</template>
