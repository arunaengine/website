<script setup lang="ts">
// App shell of Aruna Desktop. Same bones as AppLayout and the same navigation
// definition, with this computer's own surfaces behind it. No mobile bar: this
// shell only ever runs in a desktop window.
import SideNav from '@/components/layout/SideNav.vue'
import TopBar from '@/components/dashboard/TopBar.vue'
import GlobalErrorBanner from '@/components/layout/GlobalErrorBanner.vue'
import RealmUnreachable from '@/components/layout/RealmUnreachable.vue'
import NodeDown from '@/components/layout/NodeDown.vue'
import Notice from '@/components/ui/Notice.vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { uploadQueueItems } from '@/composables/uploadQueueState'
import { assistantAvailable, assistantOpen } from '@/composables/assistantState'
import { bindTourRouter, tourActive } from '@/composables/useTour'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { appQuit } from '@/lib/desktopBridge'
import { probeRealm, realmReach } from '@/lib/desktopBoot'
import { asyncChunkError } from '@/lib/chunk-recovery'
import { errorMessage } from '@/lib/utils'
import { navEntries, navRowClass, type NavEntry } from '@/components/layout/nav'
import { Power } from '@lucide/vue'

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
bindTourRouter(useRouter())
const mainEl = ref<HTMLElement | null>(null)
const unreachable = computed(() => realmReach.value === 'unreachable')
const quitting = ref(false)
const quitError = ref<string | null>(null)

const { bootstrapped, refresh, isRealmAdmin, canInspectUsers } = useAruna()
if (typeof window !== 'undefined' && !bootstrapped.value) void refresh()
const { status, loaded, state, start: watchNode, stop: unwatchNode } = useDeviceStatus()
const nodeDown = computed(
  () =>
    loaded.value &&
    route.name !== 'device' &&
    ((state.value === 'stopped' && status.value?.realmMismatch != null) ||
      (status.value?.enrolled === true && (state.value === 'stopped' || state.value === 'error'))),
)

async function quit(): Promise<void> {
  quitting.value = true
  quitError.value = null
  try {
    await appQuit()
  } catch (err) {
    quitError.value = errorMessage(err)
    quitting.value = false
  }
}

const items = computed<NavEntry[]>(() =>
  navEntries({
    desktop: true,
    isRealmAdmin: isRealmAdmin.value,
    canInspectUsers: canInspectUsers.value,
    assistant: assistantAvailable.value,
  }),
)

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
    <SideNav :items="items" :back-link="false">
      <template #footer="{ collapsed }">
        <button
          type="button"
          :disabled="quitting"
          :title="collapsed ? 'Quit Aruna Desktop' : undefined"
          :aria-label="collapsed ? 'Quit Aruna Desktop' : undefined"
          :class="[
            navRowClass(collapsed),
            'text-destructive/80 hover:bg-destructive/[0.08] hover:text-destructive disabled:opacity-60',
          ]"
          @click="quit"
        >
          <Power class="h-4 w-4 shrink-0" />
          <span v-if="!collapsed">{{ quitting ? 'Quitting…' : 'Quit Aruna Desktop' }}</span>
        </button>
        <Notice v-if="quitError" tone="error" class="mt-1 break-all">{{ quitError }}</Notice>
      </template>
    </SideNav>
    <div class="flex min-w-0 flex-1 flex-col">
      <TopBar variant="desktop" />
      <GlobalErrorBanner />
      <main id="main-content" ref="mainEl" tabindex="-1" class="flex-1 overflow-x-hidden outline-none">
        <RealmUnreachable v-if="unreachable" />
        <NodeDown v-else-if="nodeDown" />
        <RouterView v-else />
      </main>
    </div>
    <TransfersPanel v-if="uploadQueueItems.length" />
    <AssistantPanel v-if="assistantOpen" />
    <TourOverlay v-if="tourActive" />
  </div>
</template>
