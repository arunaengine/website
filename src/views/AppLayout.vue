<script setup lang="ts">
import SideNav from '@/components/layout/SideNav.vue'
import TopBar from '@/components/dashboard/TopBar.vue'
import GlobalErrorBanner from '@/components/layout/GlobalErrorBanner.vue'
import MobileNav from '@/components/dashboard/MobileNav.vue'
import RealmUnreachable from '@/components/layout/RealmUnreachable.vue'
import TransfersPanel from '@/components/data/TransfersPanel.vue'
import AssistantPanel from '@/components/assistant/AssistantPanel.vue'
import { RouterView, useRoute } from 'vue-router'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { probeRealm, realmReach } from '@/lib/desktopBoot'

const route = useRoute()
const mainEl = ref<HTMLElement | null>(null)
// A realm that never answered blocks every view here; on the web it never does.
const unreachable = computed(() => realmReach.value === 'unreachable')

onMounted(() => void probeRealm())

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
  <div class="app-shell flex min-h-full bg-background">
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
    <TransfersPanel />
    <AssistantPanel />
  </div>
</template>
