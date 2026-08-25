<script setup lang="ts">
// Desktop first run, once a realm is known: signing in is the way into the
// app, so it owns the window instead of sitting on a guest dashboard. The
// panel itself is the portal's, and the redirect returns through /auth/callback.
import { RouterLink } from 'vue-router'
import AppLogo from '@/components/layout/AppLogo.vue'
import SignInPanel from '@/components/auth/SignInPanel.vue'
import Button from '@/components/ui/Button.vue'
import { realmOrigin } from '@/lib/desktopBoot'

const origin = realmOrigin()
</script>

<template>
  <div class="relative flex min-h-full items-center justify-center overflow-hidden px-4 py-10">
    <div
      aria-hidden="true"
      class="grid-faint pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_50%_0%,black_30%,transparent_75%)]"
    />
    <div aria-hidden="true" class="wash-primary pointer-events-none absolute inset-0" />

    <div class="relative w-full max-w-3xl space-y-4">
      <div class="flex flex-col items-center gap-1">
        <AppLogo :size="26" />
        <p class="hash break-all text-center">{{ origin }}</p>
      </div>

      <SignInPanel />

      <div class="text-center">
        <RouterLink :to="{ name: 'welcome' }">
          <Button variant="ghost" size="sm">Change realm</Button>
        </RouterLink>
      </div>
    </div>
  </div>
</template>
