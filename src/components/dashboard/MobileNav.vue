<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { computed, ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { useAssistantChat } from '@/composables/useAssistantChat'
import { isDesktop } from '@/lib/desktop'
import Sheet from '@/components/ui/Sheet.vue'
import SheetContent from '@/components/ui/SheetContent.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import { navEntries, navItemActive, type NavItem } from '@/components/layout/nav'
import { MoreHorizontal } from '@lucide/vue'

const route = useRoute()
const moreOpen = ref(false)
const { isRealmAdmin, canInspectUsers } = useAruna()
const { available: assistant } = useAssistantChat()

// The same list the sidebar renders, in the same order: the bottom bar takes
// the primary entries and the More sheet keeps every other one reachable.
const items = computed<NavItem[]>(() =>
  navEntries({
    desktop: isDesktop(),
    isRealmAdmin: isRealmAdmin.value,
    canInspectUsers: canInspectUsers.value,
    assistant: assistant.value,
  }).filter((entry): entry is NavItem => !('separator' in entry)),
)

const primaryNav = computed(() => items.value.filter((item) => item.primary))
const moreNav = computed(() => items.value.filter((item) => !item.primary))

function isActive(item: NavItem): boolean {
  return navItemActive(item, route.path)
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
