<script setup lang="ts">
import AppLogo from '@/components/layout/AppLogo.vue'
import Button from '@/components/ui/Button.vue'
import { useAuth } from '@/composables/useAuth'
import { isDesktop } from '@/lib/desktop'
import { onMounted, watch } from 'vue'
import { useRoute, useRouter, RouterLink, type LocationQuery } from 'vue-router'
import { Loader2 } from '@lucide/vue'

const route = useRoute()
const router = useRouter()
const { completeSignIn, signIn, stage, stageError } = useAuth()
// The shell has no guest surface to fall back to: signing in is the way in.
const inDesktop = isDesktop()

function retry() {
  void signIn({ redirectTo: '/app' })
}

const stageLabels: Record<string, string> = {
  exchanging: 'Verifying your identity…',
  registering: 'Preparing your Aruna session…',
  done: 'Signed in, taking you to the portal.',
}

function searchOf(query: LocationQuery): URLSearchParams {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    const single = Array.isArray(value) ? value[0] : value
    if (typeof single === 'string') search.set(key, single)
  }
  return search
}

async function exchange(): Promise<void> {
  stage.value = 'idle'
  stageError.value = null
  try {
    const target = await completeSignIn(searchOf(route.query))
    await router.replace(target)
  } catch {
    // stageError is rendered below.
  }
}

onMounted(exchange)

// A second return lands on this same route, so the view is reused: without
// this the new code would never be exchanged.
watch(
  () => route.fullPath,
  () => {
    if (route.name === 'auth-callback') void exchange()
  },
)
</script>

<template>
  <div class="flex min-h-full items-center justify-center bg-background px-4">
    <div class="w-full max-w-md text-center">
      <div class="mb-8 flex justify-center">
        <AppLogo :size="26" />
      </div>
      <div class="surface p-8">
        <template v-if="stage !== 'error'">
          <Loader2 class="mx-auto h-6 w-6 animate-spin text-primary" />
          <p class="mt-4 text-sm text-muted-foreground">
            {{ stageLabels[stage] ?? 'Completing sign-in…' }}
          </p>
        </template>
        <template v-else>
          <h1 class="font-display text-base font-semibold text-foreground">Sign-in failed</h1>
          <p class="mt-2 text-sm text-muted-foreground">{{ stageError }}</p>
          <div class="mt-6 flex justify-center gap-2">
            <Button @click="retry">Try again</Button>
            <RouterLink v-if="inDesktop" :to="{ name: 'welcome', query: { change: '1' } }">
              <Button variant="outline">Change realm</Button>
            </RouterLink>
            <RouterLink v-else to="/app">
              <Button variant="outline">Browse as guest</Button>
            </RouterLink>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
