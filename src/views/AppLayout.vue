<script setup lang="ts">
import SideNav from '@/components/layout/SideNav.vue'
import TopBar from '@/components/dashboard/TopBar.vue'
import GlobalErrorBanner from '@/components/layout/GlobalErrorBanner.vue'
import MobileNav from '@/components/dashboard/MobileNav.vue'
import RealmUnreachable from '@/components/layout/RealmUnreachable.vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { computed, defineAsyncComponent, nextTick, onMounted, ref, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { assistantOpen } from '@/composables/assistantState'
import { bindTourRouter, tourActive } from '@/composables/useTour'
import { uploadQueueItems } from '@/composables/uploadQueueState'
import { asyncChunkError } from '@/lib/chunk-recovery'
import { probeRealm, realmReach } from '@/lib/desktopBoot'

const TransfersPanel = defineAsyncComponent({
  loader: () => import('@/components/data/TransfersPanel.vue'),
  onError: asyncChunkError,
})

const AssistantPanel = defineAsyncComponent({
  loader: () => import('@/components/assistant/AssistantPanel.vue'),
  onError: asyncChunkError,
})

const TourOverlay = defineAsyncComponent({
  loader: () => import('@/components/docs/TourOverlay.vue'),
  onError: asyncChunkError,
})

const route = useRoute()
const router = useRouter()
bindTourRouter(router)
const mainEl = ref<HTMLElement | null>(null)
const prefetchedRoutes = new Set<string>()
const { bootstrapped, refresh } = useAruna()
if (typeof window !== 'undefined' && !bootstrapped.value) void refresh()
// A realm that never answered blocks every view here; on the web it never does.
const unreachable = computed(() => realmReach.value === 'unreachable')

onMounted(() => void probeRealm())

// Warm only route chunks from an already-mounted app shell. The shell has
// loaded the shared session module before this handler can run, so importing a
// destination cannot start another bootstrap request; no API work is done for
// links outside the app shell.
function prefetchRoute(event: Event) {
  if (typeof window === 'undefined') return
  const target = event.target
  if (!(target instanceof Element)) return
  const anchor = target.closest<HTMLAnchorElement>('a[href]')
  if (!anchor || anchor.origin !== window.location.origin) return
  const path = `${anchor.pathname}${anchor.search}${anchor.hash}`
  if (path !== '/app' && !path.startsWith('/app/')) return

  const resolved = router.resolve(path)
  if (resolved.fullPath === route.fullPath || prefetchedRoutes.has(resolved.fullPath)) return
  const loaders: Array<() => unknown> = []
  for (const record of resolved.matched) {
    const component = record.components?.default
    if (typeof component === 'function') loaders.push(component as () => unknown)
  }
  if (!loaders.length) return

  prefetchedRoutes.add(resolved.fullPath)
  for (const load of loaders) {
    void Promise.resolve(load()).catch(() => {
      prefetchedRoutes.delete(resolved.fullPath)
    })
  }
}

// On SPA route change move focus to the main landmark so keyboard/SR users
// land on the new content instead of a stale control. Skip when a hash is
// present so the established one-shot post-load anchor-scroll patterns
// (#storage, #join-requests, …) are not disturbed; preventScroll leaves the
// router's scrollBehavior in charge of scrolling.
watch(
  () => route.path,
  () => {
    if (route.hash) return
    void nextTick(() => mainEl.value?.focus({ preventScroll: true }))
  },
)
</script>

<template>
  <div
    class="app-shell flex min-h-full bg-background"
    @pointerover.capture="prefetchRoute"
    @focusin.capture="prefetchRoute"
  >
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"
      >Skip to content</a
    >
    <SideNav />
    <div class="flex min-w-0 flex-1 flex-col">
      <TopBar />
      <GlobalErrorBanner />
      <main id="main-content" ref="mainEl" tabindex="-1" class="flex-1 overflow-x-hidden pb-20 outline-none md:pb-0">
        <RealmUnreachable v-if="unreachable" />
        <RouterView v-else />
      </main>
    </div>
    <MobileNav />
    <!-- Uploads run through the shared queue and survive navigation, so the
         floating transfers panel lives at the layout, bottom-right. -->
    <TransfersPanel v-if="uploadQueueItems.length" />
    <AssistantPanel v-if="assistantOpen" />
    <TourOverlay v-if="tourActive" />
  </div>
</template>
