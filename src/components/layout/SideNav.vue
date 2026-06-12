<script setup lang="ts">
import AppLogo from '@/components/layout/AppLogo.vue'
import { RouterLink, useRoute } from 'vue-router'
import { ref, watch } from 'vue'
import {
  Activity,
  ArrowLeft,
  Boxes,
  ChevronsLeft,
  ChevronsRight,
  FileJson2,
  LayoutDashboard,
  ListChecks,
  Search,
  Settings,
  Users,
} from 'lucide-vue-next'

interface NavItem {
  to: string
  icon: unknown
  label: string
  exact?: boolean
}

const nav: NavItem[] = [
  { to: '/app', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/app/metadata', icon: FileJson2, label: 'Catalog' },
  { to: '/app/buckets', icon: Boxes, label: 'Data' },
  { to: '/app/search', icon: Search, label: 'Search' },
  { to: '/app/profiles', icon: ListChecks, label: 'Profiles' },
  { to: '/app/groups', icon: Users, label: 'Groups' },
  { to: '/app/status', icon: Activity, label: 'Status' },
  { to: '/app/settings', icon: Settings, label: 'Settings' },
]

const route = useRoute()

function isActive(item: NavItem): boolean {
  return item.exact ? route.path === item.to : route.path.startsWith(item.to)
}

const COLLAPSE_KEY = 'aruna.sidebarCollapsed'
const collapsed = ref(
  typeof window !== 'undefined' && window.localStorage.getItem(COLLAPSE_KEY) === '1',
)
watch(collapsed, (value) => window.localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0'))
</script>

<template>
  <aside
    :class="[
      'sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-border bg-card transition-[width] duration-200 md:flex',
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

    <nav class="flex-1 overflow-y-auto px-2.5 py-3" aria-label="Portal navigation">
      <ul class="space-y-0.5">
        <li v-for="item in nav" :key="item.to">
          <RouterLink
            :to="item.to"
            :title="collapsed ? item.label : undefined"
            :class="[
              'flex items-center gap-2.5 rounded-md py-2 text-[13px] font-medium transition-colors',
              collapsed ? 'justify-center px-0' : 'px-2.5',
              isActive(item)
                ? 'bg-primary/[0.14] text-foreground hover:bg-primary/[0.18]'
                : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
            ]"
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
