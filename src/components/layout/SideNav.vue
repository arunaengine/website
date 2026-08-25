<script setup lang="ts">
import AppLogo from '@/components/layout/AppLogo.vue'
import { RouterLink, useRoute } from 'vue-router'
import { computed, ref, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { featureEnabled } from '@/lib/config'
import { isDesktop } from '@/lib/desktop'
import type { NavItem, NavSection } from '@/components/layout/nav'
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Boxes,
  ChevronsLeft,
  ChevronsRight,
  FileJson2,
  LayoutDashboard,
  Laptop,
  ListChecks,
  Settings,
  ShieldCheck,
  Users,
  Workflow,
} from '@lucide/vue'

// A layout that owns its own destinations (the desktop shell) passes them in;
// without them the sidebar computes the portal's own.
const props = defineProps<{ sections?: NavSection[]; backLink?: boolean }>()

const {
  isRealmAdmin,
  canInspectUsers,
  canManageOnboarding,
  canManageQuarantine,
  isManagementNode,
} = useAruna()

// The shell has no landing page to go back to.
const desktop = isDesktop()

// Config resolves before the app mounts, so a plain read is safe here. The
// unified Compute entry appears when either compute plane (TES tasks or
// durable jobs) is enabled; the view degrades per flag.
const tesEnabled = featureEnabled('tes')
const jobsEnabled = featureEnabled('jobs')

const adminItems = computed<NavItem[]>(() => [
  ...(isRealmAdmin.value
    ? [{ to: '/app/admin', icon: ShieldCheck, label: 'Admin', exact: true }]
    : []),
  ...(canInspectUsers.value
    ? [{ to: '/app/admin/users', icon: Users, label: 'Users' }]
    : []),
  ...(canManageOnboarding.value && isManagementNode.value
    ? [{ to: '/app/admin/onboarding', icon: Workflow, label: 'Node onboarding' }]
    : []),
  ...(canManageQuarantine.value
    ? [{ to: '/app/admin/quarantine', icon: Activity, label: 'Quarantine' }]
    : []),
])

const portalSections = computed<NavSection[]>(() => [
  {
    label: 'Workspace',
    items: [
      { to: '/app', icon: LayoutDashboard, label: 'Dashboard', exact: true },
      { to: '/app/buckets', icon: Boxes, label: 'Data' },
      ...(tesEnabled || jobsEnabled
        ? [{ to: '/app/compute', icon: Workflow, label: 'Compute' }]
        : []),
    ],
  },
  {
    label: 'Catalog',
    items: [
      { to: '/app/search', icon: FileJson2, label: 'Datasets', match: ['/app/search', '/app/metadata'] },
      { to: '/app/profiles', icon: ListChecks, label: 'Profiles' },
    ],
  },
  {
    label: 'Realm',
    items: [
      { to: '/app/groups', icon: Users, label: 'Groups' },
      { to: '/app/status', icon: Activity, label: 'Status' },
    ],
  },
  {
    label: 'Account',
    items: [
      ...(desktop ? [{ to: '/app/device', icon: Laptop, label: 'This device' }] : []),
      { to: '/app/settings', icon: Settings, label: 'Settings' },
    ],
  },
  {
    label: 'Help',
    items: [{ to: '/app/docs/v1', icon: BookOpen, label: 'Docs', match: ['/app/docs'] }],
  },
  ...(adminItems.value.length
    ? [
        {
          label: 'Admin',
          items: adminItems.value,
        },
      ]
    : []),
])

const sections = computed<NavSection[]>(() => props.sections ?? portalSections.value)
const showBackLink = computed(() => props.backLink ?? !desktop)

const route = useRoute()

function isActive(item: NavItem): boolean {
  if (item.exact) return route.path === item.to
  return (item.match ?? [item.to]).some((prefix) => route.path.startsWith(prefix))
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
      <div v-for="(section, index) in sections" :key="section.label" class="mb-4 last:mb-0">
        <div
          v-if="!collapsed"
          class="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70"
        >
          {{ section.label }}
        </div>
        <div v-else-if="index > 0" class="mx-2 mb-2 border-t border-border/60" />
        <ul class="space-y-0.5">
          <li v-for="item in section.items" :key="item.to">
            <RouterLink
              :to="item.to"
              :title="collapsed ? item.label : undefined"
              :aria-current="isActive(item) ? 'page' : undefined"
              :aria-label="collapsed ? item.label : undefined"
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
      </div>
    </nav>

    <div class="border-t border-border/60 px-2.5 py-3 text-xs">
      <button
        type="button"
        :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
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
        v-if="showBackLink"
        to="/"
        :title="collapsed ? 'Back to landing' : undefined"
        :aria-label="collapsed ? 'Back to landing' : undefined"
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
