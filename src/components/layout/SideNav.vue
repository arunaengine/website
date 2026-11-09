<script setup lang="ts">
import AppLogo from '@/components/layout/AppLogo.vue'
import { RouterLink, useRoute } from 'vue-router'
import { computed, ref, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { usePortalFeatures } from '@/composables/usePortalFeatures'
import { assistantAvailable } from '@/composables/assistantState'
import { isDesktop } from '@/lib/desktop'
import { legalLinks, portalConfig } from '@/lib/config'
import Popover from '@/components/ui/Popover.vue'
import { navAnchor, navEntries, navItemActive, navRowClass, type NavEntry, type NavItem } from '@/components/layout/nav'
import { ArrowLeft, ChevronsLeft, ChevronsRight, Scale } from '@lucide/vue'
import { useMediaQuery } from '@vueuse/core'

// A layout that owns its own destinations (the desktop shell) passes them in;
// without them the sidebar builds the portal's own from the one definition.
const props = defineProps<{ items?: NavEntry[]; backLink?: boolean }>()

const { currentUser, isRealmAdmin, canInspectUsers } = useAruna()
const { authPending } = useAuth()
const { shown } = usePortalFeatures()

// The shell has no landing page to go back to.
const desktop = isDesktop()

const items = computed<NavEntry[]>(
  () =>
    props.items ??
    navEntries({
      desktop: false,
      isRealmAdmin: isRealmAdmin.value,
      canInspectUsers: canInspectUsers.value,
      assistant: assistantAvailable.value,
      shown,
      visitor: !currentUser.value && !authPending.value,
    }),
)
const showBackLink = computed(() => props.backLink ?? (!desktop && portalConfig().landing))
const legal = legalLinks()

const route = useRoute()

function isActive(item: NavItem): boolean {
  return navItemActive(item, route.path, route.query?.notebooks === '1')
}

const COLLAPSE_KEY = 'aruna.sidebarCollapsed'
const narrow = useMediaQuery('(max-width: 1279.98px)')
const manualCollapsed = ref(
  typeof window !== 'undefined' && window.localStorage.getItem(COLLAPSE_KEY) === '1',
)
watch(manualCollapsed, (value) => window.localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0'))

// Narrow viewports force the rail; the stored choice only applies above it.
const collapsed = computed(() => narrow.value || manualCollapsed.value)
</script>

<template>
  <!-- The column runs the full page height; the navigation stays in view inside it. -->
  <div class="hidden shrink-0 border-r border-border bg-card md:block">
  <aside
    :class="[
      'sticky top-0 flex h-screen flex-col overflow-hidden transition-[width] duration-200',
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
              :data-tour="navAnchor(item.label)"
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
        v-if="!narrow"
        type="button"
        :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        :class="[
          navRowClass(collapsed),
          'text-muted-foreground/80 hover:bg-foreground/[0.04] hover:text-foreground',
        ]"
        @click="manualCollapsed = !manualCollapsed"
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
      <!-- The documents also close every page; this row reaches them without scrolling. -->
      <Popover v-if="legal.length" side="right" align="end">
        <button
          type="button"
          :title="collapsed ? 'Legal' : undefined"
          :aria-label="collapsed ? 'Legal' : undefined"
          :class="[navRowClass(collapsed), 'text-muted-foreground/80 hover:bg-foreground/[0.04] hover:text-foreground']"
        >
          <Scale class="h-4 w-4 shrink-0" />
          <span v-if="!collapsed">Legal</span>
        </button>
        <template #content>
          <nav aria-label="Legal" class="flex flex-col gap-2 text-sm">
            <template v-for="(link, index) in legal" :key="index">
              <a v-if="link.external" :href="link.href" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">{{ link.label }}</a>
              <RouterLink v-else :to="link.href" class="text-primary hover:underline">{{ link.label }}</RouterLink>
            </template>
          </nav>
        </template>
      </Popover>
      <slot name="footer" :collapsed="collapsed" />
    </div>
  </aside>
  </div>
</template>
