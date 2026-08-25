<script setup lang="ts">
// App shell of Aruna Desktop. Same bones as AppLayout, but the navigation is
// built around the machine: what is on this disk first, the realm second. No
// mobile bar — this shell only ever runs in a desktop window.
import SideNav from '@/components/layout/SideNav.vue'
import TopBar from '@/components/dashboard/TopBar.vue'
import GlobalErrorBanner from '@/components/layout/GlobalErrorBanner.vue'
import RealmUnreachable from '@/components/layout/RealmUnreachable.vue'
import TransfersPanel from '@/components/data/TransfersPanel.vue'
import { RouterView, useRoute } from 'vue-router'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { probeRealm, realmReach } from '@/lib/desktopBoot'
import type { NavSection } from '@/components/layout/nav'
import {
  Activity,
  BookOpen,
  Boxes,
  FileJson2,
  FolderSync,
  LayoutDashboard,
  Laptop,
  Play,
  Settings,
  ShieldCheck,
  Users,
  Waves,
  Workflow,
} from '@lucide/vue'

const route = useRoute()
const mainEl = ref<HTMLElement | null>(null)
const unreachable = computed(() => realmReach.value === 'unreachable')

const { isRealmAdmin, canInspectUsers, canManageOnboarding, canManageQuarantine, isManagementNode } = useAruna()
const { start: watchNode, stop: unwatchNode } = useDeviceStatus()

const adminItems = computed(() => [
  ...(isRealmAdmin.value ? [{ to: '/app/admin', icon: ShieldCheck, label: 'Admin', exact: true }] : []),
  ...(canInspectUsers.value ? [{ to: '/app/admin/users', icon: Users, label: 'Users' }] : []),
  ...(canManageOnboarding.value && isManagementNode.value
    ? [{ to: '/app/admin/onboarding', icon: Workflow, label: 'Node onboarding' }]
    : []),
  ...(canManageQuarantine.value ? [{ to: '/app/admin/quarantine', icon: Activity, label: 'Quarantine' }] : []),
])

const sections = computed<NavSection[]>(() => [
  {
    label: 'Machine',
    items: [
      { to: '/app', icon: LayoutDashboard, label: 'Home', exact: true },
      { to: '/app/folders', icon: FolderSync, label: 'Synced folders' },
      { to: '/app/transfers', icon: Waves, label: 'Transfers' },
      { to: '/app/runs', icon: Play, label: 'Runs' },
      { to: '/app/device', icon: Laptop, label: 'This device' },
    ],
  },
  {
    label: 'Realm',
    items: [
      { to: '/app/buckets', icon: Boxes, label: 'Buckets' },
      { to: '/app/search', icon: FileJson2, label: 'Datasets', match: ['/app/search', '/app/metadata'] },
      { to: '/app/settings', icon: Settings, label: 'Settings' },
    ],
  },
  ...(adminItems.value.length ? [{ label: 'Admin', items: adminItems.value }] : []),
  {
    label: 'Help',
    items: [{ to: '/app/docs/v1', icon: BookOpen, label: 'Docs', match: ['/app/docs'] }],
  },
])

onMounted(() => {
  void probeRealm()
  watchNode()
})
onUnmounted(unwatchNode)

// Same focus hand-off as the portal shell: a route change moves focus to the
// main landmark unless a hash owns the scroll position.
watch(
  () => route.path,
  () => {
    if (route.hash) return
    void nextTick(() => mainEl.value?.focus({ preventScroll: true }))
  },
)
</script>

<template>
  <div class="app-shell flex min-h-full bg-background">
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"
      >Skip to content</a
    >
    <SideNav :sections="sections" :back-link="false" />
    <div class="flex min-w-0 flex-1 flex-col">
      <TopBar variant="desktop" />
      <GlobalErrorBanner />
      <main id="main-content" ref="mainEl" tabindex="-1" class="flex-1 overflow-x-hidden outline-none">
        <RealmUnreachable v-if="unreachable" />
        <RouterView v-else />
      </main>
    </div>
    <TransfersPanel />
  </div>
</template>
