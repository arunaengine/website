<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { computed, ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { featureEnabled } from '@/lib/config'
import Sheet from '@/components/ui/Sheet.vue'
import SheetContent from '@/components/ui/SheetContent.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import {
  Activity,
  BookOpen,
  Boxes,
  FileJson2,
  LayoutDashboard,
  ListChecks,
  MoreHorizontal,
  Settings,
  ShieldCheck,
  Users,
  Workflow,
} from '@lucide/vue'

interface NavItem {
  to: string
  icon: unknown
  label: string
  exact?: boolean
  match?: string[]
}

const route = useRoute()
const moreOpen = ref(false)
const {
  isRealmAdmin,
  canInspectUsers,
  canManageOnboarding,
  canManageQuarantine,
  isManagementNode,
} = useAruna()
const tesEnabled = featureEnabled('tes')
const jobsEnabled = featureEnabled('jobs')

const primaryNav = computed<NavItem[]>(() => [
  { to: '/app', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/app/search', icon: FileJson2, label: 'Datasets', match: ['/app/search', '/app/metadata'] },
  { to: '/app/buckets', icon: Boxes, label: 'Data' },
  ...(tesEnabled || jobsEnabled
    ? [{ to: '/app/compute', icon: Workflow, label: 'Compute' }]
    : []),
  { to: '/app/groups', icon: Users, label: 'Groups' },
])

// Anything enabled here that is not promoted to the fixed bar belongs in More.
// This keeps future destinations reachable instead of silently dropping them.
const moreNav = computed<NavItem[]>(() => [
  { to: '/app/profiles', icon: ListChecks, label: 'Profiles' },
  { to: '/app/status', icon: Activity, label: 'Status' },
  { to: '/app/docs/v1', icon: BookOpen, label: 'Docs', match: ['/app/docs'] },
  { to: '/app/settings', icon: Settings, label: 'Settings' },
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

function isActive(item: NavItem): boolean {
  if (item.exact) return route.path === item.to
  return (item.match ?? [item.to]).some(
    (prefix) => route.path === prefix || route.path.startsWith(`${prefix}/`),
  )
}

const moreActive = computed(() => moreNav.value.some(isActive))
</script>

<template>
  <Sheet v-model:open="moreOpen">
    <nav
      class="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/90 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur-xl md:hidden"
      aria-label="Portal navigation"
    >
      <div
        class="grid gap-0.5"
        :style="{ gridTemplateColumns: `repeat(${primaryNav.length + 1}, minmax(0, 1fr))` }"
      >
        <RouterLink
          v-for="item in primaryNav"
          :key="item.to"
          :to="item.to"
          :aria-current="isActive(item) ? 'page' : undefined"
          class="flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-0.5 py-1 text-[10px] font-medium leading-tight transition-colors hover:bg-muted hover:text-foreground"
          :class="isActive(item) ? 'bg-primary/10 text-primary' : 'text-muted-foreground'"
        >
          <component :is="item.icon" class="h-4 w-4 shrink-0" />
          <span class="text-center whitespace-nowrap">{{ item.label }}</span>
        </RouterLink>
        <button
          type="button"
          class="flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-0.5 py-1 text-[10px] font-medium leading-tight transition-colors hover:bg-muted hover:text-foreground"
          :class="moreOpen || moreActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground'"
          aria-haspopup="dialog"
          :aria-expanded="moreOpen"
          aria-controls="mobile-more-drawer"
          @click="moreOpen = true"
        >
          <MoreHorizontal class="h-4 w-4 shrink-0" />
          <span>More</span>
        </button>
      </div>
    </nav>

    <SheetContent
      id="mobile-more-drawer"
      side="bottom"
      class="max-h-[min(80vh,36rem)] rounded-t-2xl px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-5 md:hidden"
    >
      <DialogTitle>More destinations</DialogTitle>
      <DialogDescription class="mt-1 pr-8 text-xs">
        Every enabled destination not shown in the bottom bar.
      </DialogDescription>
      <nav class="mt-4 grid gap-2 sm:grid-cols-2" aria-label="More portal destinations">
        <RouterLink
          v-for="item in moreNav"
          :key="item.to"
          :to="item.to"
          :aria-current="isActive(item) ? 'page' : undefined"
          class="flex min-h-12 items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground"
          :class="isActive(item) ? 'bg-primary/10 text-primary' : 'text-foreground'"
          @click="moreOpen = false"
        >
          <component :is="item.icon" class="h-4 w-4 shrink-0" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
    </SheetContent>
  </Sheet>
</template>
