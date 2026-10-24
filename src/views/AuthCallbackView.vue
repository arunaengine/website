<script setup lang="ts">
import AppLogo from '@/components/layout/AppLogo.vue'
import Button from '@/components/ui/Button.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { DESKTOP_CALLBACK_URI, DESKTOP_STATE_PREFIX, useAuth } from '@/composables/useAuth'
import { isDesktop } from '@/lib/desktop'
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, RouterLink, type LocationQuery } from 'vue-router'

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

// The realm website is the desktop's callback too: a marked state goes on to
// the app with the provider's answer untouched, as that sign-in lives there.
function handoffUrl(): string | null {
  if (inDesktop) return null
  const { search, hash } = window.location
  const state = new URLSearchParams(search).get('state')
  return state?.startsWith(DESKTOP_STATE_PREFIX) ? `${DESKTOP_CALLBACK_URI}${search}${hash}` : null
}

const handoff = ref(handoffUrl())

async function exchange(): Promise<void> {
  handoff.value = handoffUrl()
  if (handoff.value) {
    window.location.replace(handoff.value)
    return
  }
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
        <template v-if="handoff">
          <h1 class="font-display text-base font-semibold text-foreground">Continue in Aruna Desktop</h1>
          <p class="mt-2 text-sm text-muted-foreground">Your sign-in is done. Aruna Desktop completes it.</p>
          <div class="mt-6 flex justify-center">
            <Button as-child>
              <a :href="handoff">Open Aruna Desktop</a>
            </Button>
          </div>
          <p class="mt-4 text-xs text-muted-foreground">You can close this window afterwards.</p>
        </template>
        <template v-else-if="stage !== 'error'">
          <Spinner
            show-label
            class="flex-col gap-4 text-sm [&>svg]:size-6 [&>svg]:text-primary"
            :label="stageLabels[stage] ?? 'Completing sign-in…'"
          />
        </template>
        <template v-else>
          <h1 class="font-display text-base font-semibold text-foreground">Sign-in failed</h1>
          <p class="mt-2 text-sm text-muted-foreground">{{ stageError }}</p>
          <div class="mt-6 flex justify-center gap-2">
            <Button @click="retry">Try again</Button>
            <Button v-if="inDesktop" variant="outline" as-child>
              <RouterLink :to="{ name: 'welcome', query: { change: '1' } }">Change realm</RouterLink>
            </Button>
            <Button v-else variant="outline" as-child>
              <RouterLink to="/app">Browse as guest</RouterLink>
            </Button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
