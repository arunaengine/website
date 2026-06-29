<script setup lang="ts">
import AppLogo from '@/components/layout/AppLogo.vue'
import Button from '@/components/ui/Button.vue'
import { useAuth } from '@/composables/useAuth'
import { onMounted } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { Loader2 } from '@lucide/vue'

const router = useRouter()
const { completeSignIn, signIn, stage, stageError } = useAuth()

function retry() {
  void signIn({ redirectTo: '/app' })
}

const stageLabels: Record<string, string> = {
  exchanging: 'Verifying your identity…',
  registering: 'Preparing your Aruna session…',
  done: 'Signed in — taking you to the portal.',
}

onMounted(async () => {
  try {
    const target = await completeSignIn(new URLSearchParams(window.location.search))
    await router.replace(target)
  } catch {
    // stageError is rendered below.
  }
})
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
            <RouterLink to="/app">
              <Button variant="outline">Browse as guest</Button>
            </RouterLink>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
