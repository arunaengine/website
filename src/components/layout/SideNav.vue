<script setup lang="ts">
import AppLogo from '@/components/layout/AppLogo.vue'
import { RouterLink, useRoute } from 'vue-router'
import { computed, ref, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { isDesktop } from '@/lib/desktop'
import { navEntries, navItemActive, navRowClass, type NavEntry, type NavItem } from '@/components/layout/nav'
import { ArrowLeft, ChevronsLeft, ChevronsRight } from '@lucide/vue'

// A layout that owns its own destinations (the desktop shell) passes them in;
// without them the sidebar builds the portal's own from the one definition.
const props = defineProps<{ items?: NavEntry[]; backLink?: boolean }>()

const {
  isRealmAdmin,
  canInspectUsers,
  canManageOnboarding,
  canManageQuarantine,
} = useAruna()

// The shell has no landing page to go back to.
const desktop = isDesktop()

const items = computed<NavEntry[]>(
  () =>
    props.items ??
    navEntries({
      desktop: false,
      isRealmAdmin: isRealmAdmin.value,
      canInspectUsers: canInspectUsers.value,
      canManageOnboarding: canManageOnboarding.value,
      canManageQuarantine: canManageQuarantine.value,
    }),
)
const showBackLink = computed(() => props.backLink ?? !desktop)

const route = useRoute()

function isActive(item: NavItem): boolean {
  return navItemActive(item, route.path)
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
      <ul class="flex flex-col gap-0.5">
        <template v-for="(item, index) in items" :key="index">
          <li v-if="'separator' in item" role="separator" class="mx-1 my-1.5 border-t border-border/60" />
          <li v-else>
            <RouterLink
              :to="item.to"
              :title="collapsed ? item.label : undefined"
              :aria-current="isActive(item) ? 'page' : undefined"
              :aria-label="collapsed ? item.label : undefined"
              :class="[
                navRowClass(collapsed),
                isActive(item)
                  ? 'bg-primary/[0.14] text-foreground hover:bg-primary/[0.18]'
                  : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
              ]"
            >
              <component :is="item.icon" class="h-4 w-4 shrink-0" />
              <span v-if="!collapsed">{{ item.label }}</span>
            </RouterLink>
          </li>
        </template>
      </ul>
    </nav>

    <div class="border-t border-border/60 px-2.5 py-3 text-xs">
      <button
        type="button"
        :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        :class="[
          navRowClass(collapsed),
          'text-muted-foreground/80 hover:bg-foreground/[0.04] hover:text-foreground',
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
        :class="[navRowClass(collapsed), 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground']"
      >
        <ArrowLeft class="h-4 w-4 shrink-0" />
        <span v-if="!collapsed">Back to landing</span>
      </RouterLink>
      <slot name="footer" :collapsed="collapsed" />
    </div>
  </aside>
</template>
