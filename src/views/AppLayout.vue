<script setup lang="ts">
import SideNav from '@/components/layout/SideNav.vue'
import TopBar from '@/components/dashboard/TopBar.vue'
import GlobalErrorBanner from '@/components/layout/GlobalErrorBanner.vue'
import MobileNav from '@/components/dashboard/MobileNav.vue'
import TransfersPanel from '@/components/data/TransfersPanel.vue'
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="app-shell flex min-h-full bg-background">
    <SideNav />
    <div class="flex min-w-0 flex-1 flex-col">
      <TopBar />
      <GlobalErrorBanner />
      <main class="flex-1 overflow-x-hidden pb-20 md:pb-0">
        <RouterView />
      </main>
    </div>
    <MobileNav />
    <!-- Uploads run through the shared queue and survive navigation, so the
         floating transfers panel lives at the layout, bottom-right. -->
    <TransfersPanel />
  </div>
</template>
