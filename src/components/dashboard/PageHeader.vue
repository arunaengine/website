<script setup lang="ts">
// The top of every page: a breadcrumb (realm, section, then the page's own crumbs), the title, one
// subtitle line, and the actions at the right. Refresh and the manual are icon buttons there.
import { computed, provide } from 'vue'
import { RouterLink, useRoute, type RouteLocationRaw } from 'vue-router'
import { ChevronRight, Globe } from '@lucide/vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import { IN_PAGE_HEADER } from '@/components/ui/pageHeader'
import { navEntries, navItemActive, type NavItem } from '@/components/layout/nav'
import { useRealm } from '@/composables/useRealm'
import { isDesktop } from '@/lib/desktop'
import { cn } from '@/lib/utils'

export interface Crumb {
  label: string
  to?: RouteLocationRaw
}

// `eyebrow` names the section the page belongs to when the navigation does not; `crumbs` follow it.
const props = withDefaults(
  defineProps<{
    title: string
    description?: string
    eyebrow?: string
    crumbs?: Crumb[]
    class?: string
    /** Classes for the inner column, such as a centered reading width. */
    contentClass?: string
    /** The manual page this surface belongs to. */
    docs?: { topic: string; section?: string; label?: string }
  }>(),
  { description: undefined, eyebrow: undefined, crumbs: () => [], class: undefined, contentClass: undefined, docs: undefined },
)

provide(IN_PAGE_HEADER, true)

const { realmDisplayName, realmId } = useRealm()
const route = useRoute()
const section = computed<Crumb | null>(() => {
  if (props.eyebrow) return { label: props.eyebrow }
  const path = route?.path ?? ''
  const item = navEntries({ desktop: isDesktop(), isRealmAdmin: true, canInspectUsers: true })
    .find((entry): entry is NavItem => !('separator' in entry) && navItemActive(entry, path))
  return item ? { label: item.label, to: item.to } : null
})
const trail = computed(() => [...(section.value ? [section.value] : []), ...props.crumbs])
</script>

<template>
  <header
    :class="
      cn('relative overflow-hidden border-b border-border-subtle bg-background/70 backdrop-blur', $props.class)
    "
  >
    <!-- The landing hero's grid and wash, dimmed to a page accent. -->
    <div
      aria-hidden="true"
      class="grid-faint pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_50%_0%,black_20%,transparent_75%)]"
    />
    <div aria-hidden="true" class="wash-primary pointer-events-none absolute inset-0 opacity-60" />
    <div :class="cn('w-full px-4 sm:px-6 relative flex flex-col gap-2 pb-6 pt-6', contentClass)">
      <nav aria-label="Breadcrumb" class="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] leading-[18px] text-muted-foreground">
        <Globe class="size-3.5 shrink-0" aria-hidden="true" />
        <RouterLink :to="{ name: 'dashboard' }" class="truncate hover:text-foreground hover:underline" :title="realmId">{{ realmDisplayName }}</RouterLink>
        <template v-for="(crumb, index) in trail" :key="`${index}:${crumb.label}`">
          <ChevronRight class="size-3.5 shrink-0" aria-hidden="true" />
          <RouterLink v-if="crumb.to && index < trail.length - 1" :to="crumb.to" class="truncate hover:text-foreground hover:underline">{{ crumb.label }}</RouterLink>
          <span v-else class="truncate" :class="index === trail.length - 1 ? 'text-foreground/90' : ''">{{ crumb.label }}</span>
        </template>
        <span v-if="$slots.breadcrumbs" class="ml-1 inline-flex flex-wrap items-center gap-1.5"><slot name="breadcrumbs" /></span>
      </nav>
      <!-- The title takes the room and wraps; the actions keep their row, and go below it on a phone. -->
      <div class="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
        <div class="min-w-0 flex-1">
          <h1 class="type-page-title">
            <slot name="title">{{ title }}</slot>
          </h1>
          <p v-if="description || $slots.description" class="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">
            <slot name="description">{{ description }}</slot>
          </p>
        </div>
        <div v-if="$slots.actions || docs" class="flex shrink-0 flex-wrap items-center gap-2">
          <slot name="actions" />
          <DocsLink v-if="docs" :topic="docs.topic" :section="docs.section" :label="docs.label ?? 'Read the docs'" button />
        </div>
      </div>
    </div>
  </header>
</template>
