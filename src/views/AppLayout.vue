<script setup lang="ts">
import Sidebar from '@/components/dashboard/Sidebar.vue'
import TopBar from '@/components/dashboard/TopBar.vue'
import MobileNav from '@/components/dashboard/MobileNav.vue'
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="app-shell flex min-h-full bg-background">
    <Sidebar />
    <div class="flex min-w-0 flex-1 flex-col">
      <TopBar />
      <main class="flex-1 overflow-y-auto pb-20 md:pb-0">
        <RouterView />
      </main>
    </div>
    <MobileNav />
  </div>
</template>
