<script setup lang="ts">
// Desktop first run, once a realm is known: signing in is the way into the
// app, so it owns the window instead of sitting on a guest dashboard. The
// panel itself is the portal's, and the redirect returns through /auth/callback.
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import AppLogo from '@/components/layout/AppLogo.vue'
import RealmUnreachable from '@/components/layout/RealmUnreachable.vue'
import SignInPanel from '@/components/auth/SignInPanel.vue'
import Button from '@/components/ui/Button.vue'
import { probeRealm, realmOrigin, realmReach } from '@/lib/desktopBoot'

// Follows the shell: a realm switched under this window renames it in place.
const origin = computed(() => realmOrigin())
// This page boots the app for a returning owner, so a dead realm is named here
// rather than behind a sign-in button that can only fail.
const unreachable = computed(() => realmReach.value === 'unreachable')

onMounted(() => void probeRealm())
</script>

<template>
  <div class="relative flex min-h-full items-center justify-center overflow-hidden px-4 py-10">
    <div
      aria-hidden="true"
      class="grid-faint pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_50%_0%,black_30%,transparent_75%)]"
    />
    <div aria-hidden="true" class="wash-primary pointer-events-none absolute inset-0" />

    <RealmUnreachable v-if="unreachable" class="relative" />

    <div v-else class="relative w-full max-w-3xl space-y-4">
      <div class="flex flex-col items-center gap-1">
        <AppLogo :size="26" />
        <p class="hash break-all text-center">{{ origin }}</p>
      </div>

      <SignInPanel />

      <div class="text-center">
        <RouterLink :to="{ name: 'welcome', query: { change: '1' } }">
          <Button variant="ghost" size="sm">Change realm</Button>
        </RouterLink>
      </div>
    </div>
  </div>
</template>
